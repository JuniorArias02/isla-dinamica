// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * MonitorAirPods — fachada del módulo AirPods (Capa 3).
 *
 * Une el puente con BlueZ (perfilBluez.js) y el protocolo (protocolo.js):
 *   - Registra el perfil AAP al iniciar.
 *   - Cuando se conectan unos audífonos que anuncian el UUID AAP, abre el
 *     canal (con reintentos, porque tardan unos segundos en estar listos).
 *   - Interpreta cada paquete y mantiene el estado por dispositivo:
 *       {izquierdo, derecho, estuche, modoRuido, oido}
 *   - Permite cambiar el modo de ruido.
 *
 * Entrega los cambios con `alCambiar(ruta, estado)`; estado = null cuando se va.
 */

import GLib from 'gi://GLib';

import {TIEMPO_REINTENTO_AAP_MS, INTENTOS_AAP} from '../../constantes.js';
import {registrarInfo, registrarAviso, registrarError, protegido} from '../../registro.js';
import {UUID_AAP, PAQUETES_INICIO, interpretarPaquete, paqueteModoRuido} from './protocolo.js';
import {PerfilAap, SesionAap} from './perfilBluez.js';

/**
 * @typedef {object} EstadoAirPods
 * @property {{nivel: number, cargando: boolean}|null} izquierdo
 * @property {{nivel: number, cargando: boolean}|null} derecho
 * @property {{nivel: number, cargando: boolean}|null} estuche
 * @property {number|null} modoRuido - Uno de MODOS_RUIDO, o null si aún no se sabe.
 * @property {{primario: string, secundario: string}|null} oido - Valores de POSICIONES.
 */

function estadoVacio() {
    return {izquierdo: null, derecho: null, estuche: null, modoRuido: null, oido: null};
}

export class MonitorAirPods {
    /**
     * @param {Function} alCambiar - Recibe (rutaDispositivo, EstadoAirPods|null).
     */
    constructor(alCambiar) {
        this._alCambiar = alCambiar;
        this._perfil = null;
        this._listo = false;

        /** @type {Map<string, SesionAap>} */
        this._sesiones = new Map();
        /** @type {Map<string, EstadoAirPods>} */
        this._estados = new Map();
        /** @type {Map<string, number>} ruta → id del temporizador de reintento */
        this._reintentos = new Map();
        /** @type {Set<string>} rutas con una conexión en curso */
        this._conectando = new Set();
        /** @type {Set<string>} audífonos AAP conectados por Bluetooth ahora mismo */
        this._vinculados = new Set();
    }

    /** Registra el perfil AAP en BlueZ. */
    async iniciar() {
        this._perfil = new PerfilAap(protegido('airpods: canal abierto',
            (ruta, descriptor) => this._alAbrirCanal(ruta, descriptor)));
        try {
            await this._perfil.registrar();
        } catch (error) {
            if (error.message?.includes('already registered')) {
                // Otro programa (u otra sesión de la isla) ya usa el canal de los AirPods.
                registrarAviso('AirPods: otro programa ya usa el canal AAP; la batería por pieza no estará disponible.');
                return;
            }
            throw error;
        }
        this._listo = true;
    }

    /**
     * Unos audífonos se conectaron: si hablan AAP, se abre el canal.
     * @param {{ruta: string, uuids?: string[]}} dispositivo
     */
    vincular(dispositivo) {
        if (!this._listo || !this._hablaAap(dispositivo))
            return;
        this._vinculados.add(dispositivo.ruta);
        if (this._sesiones.has(dispositivo.ruta) || this._conectando.has(dispositivo.ruta))
            return;
        this._intentarConectar(dispositivo.ruta, 1)
            .catch(error => registrarError('airpods: conectar', error));
    }

    /**
     * Los audífonos se desconectaron.
     * @param {string} ruta
     */
    desvincular(ruta) {
        this._vinculados.delete(ruta);
        this._cancelarReintento(ruta);
        this._sesiones.get(ruta)?.cerrar();
        this._sesiones.delete(ruta);
        if (this._estados.delete(ruta))
            this._emitir(ruta, null);
    }

    /**
     * @param {string} ruta
     * @returns {EstadoAirPods|null}
     */
    estado(ruta) {
        return this._estados.get(ruta) ?? null;
    }

    /**
     * Cambia el modo de ruido (cancelación, normal, transparencia...).
     * @param {string} ruta
     * @param {number} modo - Uno de MODOS_RUIDO.
     */
    establecerModoRuido(ruta, modo) {
        const sesion = this._sesiones.get(ruta);
        if (!sesion) {
            registrarAviso(`AirPods: no hay canal abierto con ${ruta} para cambiar el modo.`);
            return;
        }
        sesion.enviar(paqueteModoRuido(modo));
        // Se refleja enseguida en la isla; si los audífonos confirman, llegará el mismo valor.
        this._actualizarEstado(ruta, {modoRuido: modo});
    }

    async destruir() {
        this._listo = false;
        for (const ruta of this._reintentos.keys())
            this._cancelarReintento(ruta);
        for (const sesion of this._sesiones.values())
            sesion.cerrar();
        this._sesiones.clear();
        this._estados.clear();
        this._conectando.clear();
        this._vinculados.clear();
        this._alCambiar = null;
        await this._perfil?.destruir();
        this._perfil = null;
    }

    // ───────────────────────── Conexión ─────────────────────────

    _hablaAap(dispositivo) {
        return (dispositivo.uuids ?? []).some(uuid => uuid.toLowerCase() === UUID_AAP);
    }

    async _intentarConectar(ruta, intento) {
        this._conectando.add(ruta);
        try {
            await this._perfil.conectar(ruta);
            // El canal llega por NewConnection (_alAbrirCanal).
        } catch (error) {
            if (!this._listo)
                return;
            if (intento < INTENTOS_AAP) {
                registrarInfo(`AirPods: el canal AAP aún no responde (intento ${intento}); se reintenta.`);
                this._programarReintento(ruta, intento + 1);
            } else {
                registrarAviso(`AirPods: no se pudo abrir el canal AAP con ${ruta}: ${error.message}`);
            }
        } finally {
            this._conectando.delete(ruta);
        }
    }

    _programarReintento(ruta, intento) {
        this._cancelarReintento(ruta);
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIEMPO_REINTENTO_AAP_MS, () => {
            this._reintentos.delete(ruta);
            if (this._listo && !this._sesiones.has(ruta))
                this._intentarConectar(ruta, intento).catch(error => registrarError('airpods: reintento', error));
            return GLib.SOURCE_REMOVE;
        });
        this._reintentos.set(ruta, id);
    }

    _cancelarReintento(ruta) {
        const id = this._reintentos.get(ruta);
        if (id) {
            GLib.source_remove(id);
            this._reintentos.delete(ruta);
        }
    }

    _alAbrirCanal(ruta, descriptor) {
        this._cancelarReintento(ruta);
        this._sesiones.get(ruta)?.cerrar();

        const sesion = new SesionAap(ruta, descriptor, {
            alRecibir: bytes => this._procesar(ruta, bytes),
            alCerrarse: cerrada => {
                if (this._sesiones.get(ruta) !== cerrada)
                    return;
                this._sesiones.delete(ruta);
                // Los audífonos cerraron el canal pero siguen conectados (ej. se guardaron un
                // momento en el estuche): se vuelve a abrir.
                if (this._listo && this._vinculados.has(ruta)) {
                    registrarInfo('AirPods: el canal se cerró con los audífonos conectados; se reabre.');
                    this._programarReintento(ruta, 1);
                }
            },
        });
        this._sesiones.set(ruta, sesion);
        if (!this._estados.has(ruta))
            this._estados.set(ruta, estadoVacio());

        for (const paquete of PAQUETES_INICIO)
            sesion.enviar(paquete);
        registrarInfo('AirPods: canal AAP listo; esperando batería y estado.');
    }

    // ───────────────────────── Paquetes ─────────────────────────

    _procesar(ruta, bytes) {
        const paquete = interpretarPaquete(bytes);

        switch (paquete.tipo) {
        case 'bateria': {
            const {izquierdo, derecho, estuche, unico} = paquete.componentes;
            const cambios = {};
            if (izquierdo)
                cambios.izquierdo = izquierdo;
            if (derecho)
                cambios.derecho = derecho;
            if (estuche)
                cambios.estuche = estuche;
            // Modelos de un solo cuerpo (ej. auriculares de diadema): se muestra como izquierdo.
            if (unico && !izquierdo && !derecho)
                cambios.izquierdo = unico;
            this._actualizarEstado(ruta, cambios);
            break;
        }
        case 'modoRuido':
            this._actualizarEstado(ruta, {modoRuido: paquete.modo});
            break;
        case 'oido':
            this._actualizarEstado(ruta, {oido: {primario: paquete.primario, secundario: paquete.secundario}});
            break;
        default:
            // Paquetes que no se usan (respuesta al saludo, metadatos...): se ignoran.
            break;
        }
    }

    _actualizarEstado(ruta, cambios) {
        const actual = this._estados.get(ruta) ?? estadoVacio();
        const nuevo = {...actual, ...cambios};
        this._estados.set(ruta, nuevo);
        this._emitir(ruta, nuevo);
    }

    _emitir(ruta, estado) {
        try {
            this._alCambiar?.(ruta, estado);
        } catch (error) {
            registrarError('airpods: entregar estado', error);
        }
    }
}

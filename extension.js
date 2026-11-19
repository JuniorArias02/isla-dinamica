// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Isla Dinámica para GNOME Shell 50.x (ESM).
 * Autor: JuniorArias02 · uuid: isla-dinamica@juniorarias02
 *
 * Punto de entrada de la extensión.
 *
 * Es la "raíz de composición": crea las piezas y las conecta entre sí.
 *
 *   Servicios (Bluetooth, MPRIS, notificaciones)  ──datos──▶  ControladorIsla
 *   ControladorIsla  ──vista──▶  IslaUI
 *   IslaUI  ──intenciones del usuario──▶  ControladorIsla / servicios
 *
 * enable()  crea todo y lo conecta. Si algo falla, deshace todo (nunca queda a medias).
 * disable() lo destruye en orden inverso; un paso que falle no impide los siguientes.
 *
 * Todos los cruces entre capas pasan por `protegido()`: cualquier excepción
 * queda en el registro con su contexto (ver modulos/registro.js).
 */

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    ESTADOS,
    TIPOS_ALERTA,
    TIEMPO_ALERTA_BLUETOOTH_MS,
    VENTANA_AGRUPAR_MS,
    MENSAJES_EN_ALERTA,
    TIEMPO_ALERTA_INDICADOR_MS,
    TIEMPO_ALERTA_ENERGIA_MS,
    TIEMPO_ALERTA_PORTAPAPELES_MS,
    TIEMPO_ALERTA_TEMPORIZADOR_MS,
    ESTADOS_TEMPORIZADOR,
} from './modulos/constantes.js';
import {
    iniciarRegistro,
    detenerRegistro,
    registrarInfo,
    registrarError,
    protegido,
    intentar,
    rutaRegistro,
} from './modulos/registro.js';
import {ControladorIsla} from './modulos/controlador.js';
import {MonitorBluetooth, EVENTOS_BLUETOOTH} from './modulos/servicios/bluetooth.js';
import {MonitorMultimedia} from './modulos/servicios/mpris.js';
import {CapturadorNotificaciones} from './modulos/servicios/notificaciones/capturador.js';
import {MonitorReloj} from './modulos/servicios/reloj.js';
import {MonitorAirPods} from './modulos/servicios/airpods/monitor.js';
import {CapturadorOsd} from './modulos/servicios/osd.js';
import {MonitorEnergia, EVENTOS_ENERGIA} from './modulos/servicios/energia.js';
import {Temporizador} from './modulos/servicios/temporizador.js';
import {MonitorPortapapeles} from './modulos/servicios/portapapeles.js';
import {MonitorPrivacidad} from './modulos/servicios/privacidad.js';
import {IslaUI} from './modulos/ui/isla.js';
import {configurarIconos, liberarIconos} from './modulos/ui/iconos.js';
import {
    configurarAjustes,
    liberarAjustes,
    alCambiarCualquierAjuste,
    dejarDeEscucharAjustes,
    ajuste,
    AJUSTES,
} from './modulos/ajustes.js';

export default class ExtensionIslaDinamica extends Extension {
    /** Se ejecuta cuando la extensión se activa (al iniciar sesión o al desbloquear). */
    enable() {
        iniciarRegistro();
        registrarInfo(`Activando extensión (registro de errores en ${rutaRegistro()})`, true);
        try {
            this._crearYConectar();
        } catch (error) {
            // Nunca dejar la isla a medio montar: se deshace todo y GNOME marca el error.
            registrarError('activación (enable)', error);
            this.disable();
            throw error;
        }
    }

    /**
     * Se ejecuta al desactivar la extensión o al bloquear la pantalla.
     * Libera todo en orden inverso a su creación.
     */
    disable() {
        registrarInfo('Desactivando extensión y liberando memoria...', true);

        intentar('desactivar privacidad', () => this._privacidad?.destruir());
        this._privacidad = null;

        intentar('desactivar portapapeles', () => this._portapapeles?.destruir());
        this._portapapeles = null;

        intentar('desactivar temporizador', () => this._temporizador?.destruir());
        this._temporizador = null;

        intentar('desactivar energía', () => this._energia?.destruir());
        this._energia = null;

        intentar('desactivar volumen/brillo', () => this._osd?.destruir());
        this._osd = null;

        intentar('desactivar reloj', () => this._reloj?.destruir());
        this._reloj = null;

        intentar('desactivar notificaciones', () => this._notificaciones?.destruir());
        this._notificaciones = null;
        this._conversaciones?.clear();

        intentar('desactivar airpods', () => {
            // Retirar el perfil de BlueZ es asíncrono; sus fallos también quedan registrados.
            this._airpods?.destruir().catch(error => registrarError('desactivar airpods', error));
        });
        this._airpods = null;

        intentar('desactivar bluetooth', () => this._bluetooth?.destruir());
        this._bluetooth = null;

        intentar('desactivar multimedia', () => this._multimedia?.destruir());
        this._multimedia = null;

        intentar('desactivar controlador', () => this._controlador?.destruir());
        this._controlador = null;

        intentar('desactivar interfaz', () => this._isla?.destruir());
        this._isla = null;

        intentar('liberar iconos', () => liberarIconos());
        intentar('liberar ajustes', () => {
            dejarDeEscucharAjustes(this);
            liberarAjustes();
        });
        detenerRegistro();
    }

    // ───────────────────────── Construcción ─────────────────────────

    _crearYConectar() {
        configurarIconos(this.path);
        // Opciones del usuario (ventana de ajustes). Se leen en el momento de usarlas.
        configurarAjustes(this.getSettings());

        // Capa 1: interfaz. Cada acción del usuario queda protegida y registrada si falla.
        this._isla = new IslaUI({
            abrirTarjeta: protegido('acción: abrir tarjeta', () => this._controlador?.establecerExpandido(true)),
            cerrarTarjeta: protegido('acción: cerrar tarjeta', () => this._controlador?.establecerExpandido(false)),
            descartarAlerta: protegido('acción: descartar alerta', clave => this._controlador?.descartarAlerta(clave)),
            mantenerAlerta: protegido('acción: mantener alerta', mantener => this._controlador?.mantenerAlerta(mantener)),
            abrirCalendario: protegido('acción: abrir calendario', () => {
                this._controlador?.establecerExpandido(false);
                this._isla?.abrirCalendarioGnome();
            }),
            multimedia: {
                alternar: protegido('multimedia: reproducir/pausa', () => this._multimedia?.activo?.alternarReproduccion()),
                siguiente: protegido('multimedia: siguiente', () => this._multimedia?.activo?.siguiente()),
                anterior: protegido('multimedia: anterior', () => this._multimedia?.activo?.anterior()),
                mostrarReproductor: protegido('multimedia: mostrar reproductor', () => {
                    this._multimedia?.activo?.mostrarVentana();
                    this._controlador?.establecerExpandido(false);
                }),
                obtenerPosicion: () => this._multimedia?.activo?.obtenerPosicion() ?? Promise.resolve(null),
                irAPosicion: protegido('multimedia: ir a posición', posicionUs => this._multimedia?.activo?.irAPosicion(posicionUs)),
            },
            establecerModoRuido: protegido('airpods: cambiar modo de ruido',
                (ruta, modo) => this._airpods?.establecerModoRuido(ruta, modo)),
            notificaciones: {
                activar: protegido('notificaciones: abrir', id => {
                    this._buscarNotificacion(id)?.activar();
                    this._controlador?.quitarNotificacion(id);
                    this._controlador?.establecerExpandido(false);
                }),
                descartar: protegido('notificaciones: descartar', id => {
                    this._buscarNotificacion(id)?.descartar();
                    this._controlador?.quitarNotificacion(id);
                }),
                limpiar: protegido('notificaciones: borrar todas', () => {
                    for (const notificacion of [...(this._controlador?.notificacionesRecientes ?? [])])
                        notificacion.descartar();
                    this._controlador?.limpiarNotificaciones();
                }),
            },
            establecerActividadPreferida: protegido('acción: elegir actividad de la cápsula',
                actividad => this._controlador?.establecerActividadPreferida(actividad)),
            cambiarVistaCompacta: protegido('acción: cambiar vista de la cápsula',
                direccion => this._controlador?.cambiarVistaCompacta(direccion) ?? false, false),
            temporizador: {
                iniciar: protegido('temporizador: iniciar', ms => this._temporizador?.iniciar(ms)),
                sumar: protegido('temporizador: sumar', ms => this._temporizador?.sumar(ms)),
                pausar: protegido('temporizador: pausar', () => this._temporizador?.pausar()),
                reanudar: protegido('temporizador: reanudar', () => this._temporizador?.reanudar()),
                cancelar: protegido('temporizador: cancelar', () => this._temporizador?.cancelar()),
            },
        });

        // Capa 2: controlador (máquina de estados).
        this._controlador = new ControladorIsla(this._isla);

        // Capa 3: servicios.
        this._multimedia = new MonitorMultimedia(
            protegido('multimedia → controlador', pista => this._controlador?.actualizarPista(pista)));
        this._bluetooth = new MonitorBluetooth(
            protegido('bluetooth → controlador', (tipo, dispositivo) => this._alEventoBluetooth(tipo, dispositivo)));
        /** @type {Map<string, {cantidad: number, ultimoMs: number}>} chat → mensajes recientes */
        this._conversaciones = new Map();
        this._notificaciones = new CapturadorNotificaciones({
            alRecibir: protegido('notificación → controlador', (_id, datos) => this._alRecibirNotificacion(datos)),
            // Cerrada desde GNOME o por la app: sale de la lista de recientes.
            alCerrar: protegido('notificación cerrada', id => this._controlador?.quitarNotificacion(id)),
        });
        this._reloj = new MonitorReloj(
            protegido('reloj → controlador', reloj => this._controlador?.actualizarReloj(reloj)));
        this._airpods = new MonitorAirPods(
            protegido('airpods → controlador', (ruta, estado) => this._alCambiarAirPods(ruta, estado)));
        this._osd = new CapturadorOsd(
            protegido('volumen/brillo → controlador', datos => this._alCambiarIndicador(datos)));
        this._energia = new MonitorEnergia(
            protegido('energía → controlador', (evento, datos) => this._alCambiarEnergia(evento, datos)));
        this._temporizador = new Temporizador(
            protegido('temporizador → controlador', resumen => this._alCambiarTemporizador(resumen)));
        this._portapapeles = new MonitorPortapapeles(
            protegido('portapapeles → controlador', datos => this._alCopiar(datos)));
        this._privacidad = new MonitorPrivacidad(
            protegido('privacidad → controlador', estado => this._controlador?.actualizarPrivacidad(estado)));

        // Primero lo que puede fallar por API de GNOME, luego los servicios.
        this._isla.montar(this.uuid);
        this._controlador.actualizarPista(null);
        this._notificaciones.iniciar();
        this._reloj.iniciar();
        this._osd.iniciar();
        this._portapapeles.iniciar();
        this._privacidad.iniciar();
        this._energia.iniciar().catch(error => registrarError('iniciar energía (UPower)', error));

        this._multimedia.iniciar().catch(error => registrarError('iniciar multimedia', error));
        // AirPods necesita a Bluetooth (para saber qué audífonos ya están conectados).
        const airpodsListo = this._airpods.iniciar()
            .catch(error => registrarError('iniciar airpods (perfil AAP)', error));
        this._bluetooth.iniciar()
            .then(() => this._refrescarDispositivos())
            .then(() => airpodsListo)
            .then(() => this._bluetooth?.dispositivosConectados.forEach(d => this._airpods?.vincular(d)))
            .catch(error => registrarError('iniciar bluetooth', error));

        // Cualquier cambio en la ventana de ajustes se ve al instante (sin cerrar sesión).
        alCambiarCualquierAjuste(protegido('ajustes: cambio', clave => {
            registrarInfo(`Ajuste cambiado: ${clave} = ${ajuste(clave)}`);
            this._controlador?.refrescar();
        }), this);

        registrarInfo('Extensión activa.', true);
    }

    // ───────────────────────── Eventos de los servicios ─────────────────────────

    /**
     * @param {string} tipo - Uno de EVENTOS_BLUETOOTH.
     * @param {object} dispositivo - {ruta, nombre, icono, bateria}
     */
    _alEventoBluetooth(tipo, dispositivo) {
        // Unos AirPods recién conectados: se abre su canal para leer batería y estuche.
        if (tipo === EVENTOS_BLUETOOTH.CONECTADO)
            this._airpods?.vincular(dispositivo);
        else if (tipo === EVENTOS_BLUETOOTH.DESCONECTADO)
            this._airpods?.desvincular(dispositivo.ruta);

        this._refrescarDispositivos();

        const clave = `bluetooth-${dispositivo.ruta}`;

        if (tipo === EVENTOS_BLUETOOTH.BATERIA) {
            // La batería suele llegar un instante después de conectar: se actualiza la alerta si sigue visible.
            this._controlador?.actualizarAlerta(clave, {bateria: dispositivo.bateria});
            return;
        }

        const conectado = tipo === EVENTOS_BLUETOOTH.CONECTADO;
        this._controlador?.agregarAlerta({
            tipo: TIPOS_ALERTA.BLUETOOTH,
            clave,
            duracionMs: TIEMPO_ALERTA_BLUETOOTH_MS,
            datos: {
                titulo: dispositivo.nombre,
                detalle: conectado ? 'Conectados' : 'Desconectados',
                bateria: dispositivo.bateria,
                airpods: this._airpods?.estado(dispositivo.ruta) ?? null,
                conectado,
            },
        });
    }

    /**
     * Llegaron datos de unos AirPods (batería por pieza, estuche, modo de ruido...).
     * @param {string} ruta
     * @param {object|null} estado
     */
    _alCambiarAirPods(ruta, estado) {
        this._refrescarDispositivos();
        // Si la alerta de conexión sigue a la vista, se completa con los tres anillos.
        this._controlador?.actualizarAlerta(`bluetooth-${ruta}`, {airpods: estado});
    }

    /**
     * Llega una notificación: se guarda en recientes y se muestra como alerta.
     * Los mensajes del mismo chat se agrupan en una sola alerta ("3 mensajes nuevos").
     * @param {object} datos - Datos del capturador.
     */
    _alRecibirNotificacion(datos) {
        this._controlador?.registrarNotificacion(datos);

        const esChat = datos.aplicacion.esChat;
        const {cantidad, mensajes} = esChat
            ? this._contarMensaje(datos.claveConversacion, datos.detalle)
            : {cantidad: 1, mensajes: [datos.detalle]};
        this._controlador?.agregarAlerta({
            tipo: TIPOS_ALERTA.NOTIFICACION,
            // Misma clave = la alerta del chat se actualiza en lugar de crear otra.
            clave: esChat ? `chat-${datos.claveConversacion}` : datos.id,
            duracionMs: ajuste(AJUSTES.DURACION_NOTIFICACIONES_MS),
            datos: {...datos, cantidad, mensajes},
        });
    }

    /**
     * Cuenta los mensajes de un chat llegados dentro de VENTANA_AGRUPAR_MS y
     * guarda los últimos textos para mostrarlos juntos en la alerta.
     * @param {string} claveConversacion
     * @param {string} texto - Texto del mensaje nuevo.
     * @returns {{cantidad: number, mensajes: string[]}}
     */
    _contarMensaje(claveConversacion, texto) {
        const ahora = Date.now();
        for (const [clave, info] of this._conversaciones) {
            if (ahora - info.ultimoMs > VENTANA_AGRUPAR_MS)
                this._conversaciones.delete(clave);
        }
        const previo = this._conversaciones.get(claveConversacion);
        const cantidad = (previo?.cantidad ?? 0) + 1;
        const mensajes = [...(previo?.mensajes ?? []), texto].filter(Boolean).slice(-MENSAJES_EN_ALERTA);
        this._conversaciones.set(claveConversacion, {cantidad, ultimoMs: ahora, mensajes});
        return {cantidad, mensajes};
    }

    // ───────────────────────── Volumen, energía, temporizador, copiado ─────────────────────────

    /**
     * Volumen o brillo cambió: indicador compacto. Cada pulsación reinicia su tiempo
     * (misma clave) y, si no puede mostrarse ya, se descarta (sin cola).
     * @param {object} datos - {tipo, gicon, nivel, maximo}
     * @returns {boolean} false si la isla no puede mostrarlo (se usa el recuadro de GNOME).
     */
    _alCambiarIndicador(datos) {
        // Desactivado en ajustes, o con la isla abierta (no hay sitio): recuadro de GNOME de siempre.
        if (!ajuste(AJUSTES.MOSTRAR_VOLUMEN_BRILLO) || !this._controlador ||
            this._controlador.estado === ESTADOS.EXPANDIDO)
            return false;
        this._controlador.agregarAlerta({
            tipo: TIPOS_ALERTA.INDICADOR,
            clave: `indicador-${datos.tipo}`,
            duracionMs: TIEMPO_ALERTA_INDICADOR_MS,
            sinCola: true,
            datos,
        });
        return true;
    }

    /**
     * @param {string} evento - Uno de EVENTOS_ENERGIA.
     * @param {object} datos - {porcentaje, cargando, llena, minutosRestantes}
     */
    _alCambiarEnergia(evento, datos) {
        if (!ajuste(AJUSTES.AVISAR_CARGADOR))
            return;
        this._controlador?.agregarAlerta({
            tipo: TIPOS_ALERTA.ENERGIA,
            clave: 'energia',
            duracionMs: TIEMPO_ALERTA_ENERGIA_MS,
            datos: {...datos, enchufado: evento === EVENTOS_ENERGIA.ENCHUFADO},
        });
    }

    /**
     * El temporizador cambió (cada segundo mientras corre).
     * Al terminar se muestra "¡Tiempo cumplido!"; al cancelarlo, ese aviso se quita.
     * @param {{estado: string, totalMs: number, restanteMs: number}} resumen
     */
    _alCambiarTemporizador(resumen) {
        this._controlador?.actualizarTemporizador(resumen);
        if (resumen.estado === ESTADOS_TEMPORIZADOR.TERMINADO) {
            this._controlador?.agregarAlerta({
                tipo: TIPOS_ALERTA.TEMPORIZADOR,
                clave: 'temporizador',
                duracionMs: TIEMPO_ALERTA_TEMPORIZADOR_MS,
                datos: resumen,
            });
        } else {
            this._controlador?.descartarAlerta('temporizador');
        }
    }

    /** @param {object} datos - {tipo, aplicacion} */
    _alCopiar(datos) {
        if (!ajuste(AJUSTES.AVISAR_COPIADO))
            return;
        this._controlador?.agregarAlerta({
            tipo: TIPOS_ALERTA.PORTAPAPELES,
            clave: 'portapapeles',
            duracionMs: TIEMPO_ALERTA_PORTAPAPELES_MS,
            sinCola: true,
            datos,
        });
    }

    _buscarNotificacion(id) {
        return this._controlador?.notificacionesRecientes.find(n => n.id === id) ?? null;
    }

    /** Envía al controlador los audífonos conectados, con el detalle AirPods si lo hay. */
    _refrescarDispositivos() {
        if (!this._bluetooth)
            return;
        const dispositivos = this._bluetooth.dispositivosConectados.map(dispositivo => ({
            ...dispositivo,
            airpods: this._airpods?.estado(dispositivo.ruta) ?? null,
        }));
        this._controlador?.actualizarDispositivos(dispositivos);
    }
}

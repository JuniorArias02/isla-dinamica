// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * ControladorIsla — Capa 2 de la arquitectura.
 *
 * Es la máquina de estados de la isla. Recibe datos de los servicios
 * (Bluetooth, multimedia, notificaciones) y órdenes del usuario (abrir,
 * cerrar, mantener una alerta), decide qué debe mostrarse según las
 * prioridades y le entrega a la interfaz una "vista" (objeto plano).
 *
 * Estados:
 *   REPOSO      → no hay nada que mostrar.
 *   MULTIMEDIA  → hay un reproductor sonando (estado base con música).
 *   ALERTA      → alerta temporal (notificación o Bluetooth) durante unos segundos.
 *   EXPANDIDO   → el usuario abrió la tarjeta; las alertas esperan en cola.
 *
 * No contiene código visual ni sabe nada de Clutter/St.
 */

import GLib from 'gi://GLib';

import {
    ACTIVIDADES,
    ORDEN_ACTIVIDADES,
    VISTAS_COMPACTAS,
    ESTADOS_TEMPORIZADOR,
    ESTADOS,
    PRIORIDADES,
    MAXIMO_ALERTAS_EN_COLA,
    MAXIMO_NOTIFICACIONES_RECIENTES,
    TIEMPO_EXTRA_ALERTA_TRAS_HOVER_MS,
} from './constantes.js';
import {registrarDepuracion, registrarError} from './registro.js';

/**
 * @typedef {object} Vista
 * @property {string} estado - Uno de ESTADOS.
 * @property {object|null} alerta - Alerta visible ({tipo, clave, orden, datos}).
 * @property {object|null} pista - Pista activa del servicio multimedia.
 * @property {object[]} dispositivos - Dispositivos de audio Bluetooth conectados.
 * @property {{hora: string, fecha: string}|null} reloj - Hora y fecha actuales.
 * @property {object[]} notificaciones - Recientes, la más nueva primero.
 * @property {{estado: string, totalMs: number, restanteMs: number}|null} temporizador
 * @property {{microfono: boolean, camara: boolean, pantalla: boolean}} privacidad - Qué se está usando.
 * @property {{principal: string, secundaria: string|null, vistas: string[]}} actividades -
 *   Qué va en la cápsula, qué en el círculo y entre qué vistas se puede deslizar (valores de ACTIVIDADES).
 */

export class ControladorIsla {
    /**
     * @param {object} interfaz - Objeto con el método `mostrarVista(vista)`.
     */
    constructor(interfaz) {
        this._interfaz = interfaz;

        this._estado = ESTADOS.REPOSO;
        this._expandido = false;

        /** @type {object|null} Pista activa (o null si no hay reproductor). */
        this._pista = null;

        /** @type {object[]} Dispositivos de audio conectados. */
        this._dispositivos = [];

        /** @type {{hora: string, fecha: string}|null} Hora y fecha actuales. */
        this._reloj = null;

        /** @type {object[]} Notificaciones recientes (la más nueva primero). */
        this._notificaciones = [];

        /** @type {{estado: string, totalMs: number, restanteMs: number}|null} */
        this._temporizador = null;

        /** @type {{microfono: boolean, camara: boolean, pantalla: boolean}} */
        this._privacidad = {microfono: false, camara: false, pantalla: false};

        /** @type {string|null} Actividad que el usuario eligió ver en la cápsula (ACTIVIDADES). */
        this._actividadPreferida = null;

        /** @type {object|null} Alerta que se está mostrando ahora mismo. */
        this._alertaActual = null;

        /** @type {object[]} Alertas en espera, ordenadas por prioridad. */
        this._colaAlertas = [];

        this._idTemporizadorAlerta = 0;
        this._contadorAlertas = 0;
    }

    /** @returns {string} Estado visual actual (uno de ESTADOS). */
    get estado() {
        return this._estado;
    }

    /** @returns {object[]} Notificaciones recientes (la más nueva primero). */
    get notificacionesRecientes() {
        return this._notificaciones;
    }

    /** @returns {object|null} Alerta visible en este momento. */
    get alertaActual() {
        return this._alertaActual;
    }

    // ───────────────────────── Datos de los servicios ─────────────────────────

    /**
     * Agrega una alerta temporal. Si la isla está libre se muestra al instante;
     * si hay otra alerta o la tarjeta está abierta, queda en cola por prioridad.
     *
     * @param {object} alerta
     * @param {string} alerta.tipo - Uno de TIPOS_ALERTA.
     * @param {string} [alerta.clave] - Identificador para actualizar o descartar la alerta luego.
     * @param {number} alerta.duracionMs - Tiempo en pantalla.
     * @param {object} alerta.datos - Contenido a mostrar (icono, título, detalle...).
     * @param {boolean} [alerta.sinCola=false] - Si no se puede mostrar YA, se descarta
     *   (ej. volumen o "Copiado": mostrarlos más tarde no tendría sentido).
     */
    agregarAlerta(alerta) {
        const nueva = {
            ...alerta,
            prioridad: PRIORIDADES[alerta.tipo] ?? 0,
            orden: this._contadorAlertas++,
        };

        // Una alerta con la misma clave reemplaza a la anterior (ej. conectar/desconectar rápido).
        if (nueva.clave) {
            this._colaAlertas = this._colaAlertas.filter(a => a.clave !== nueva.clave);
            if (this._alertaActual?.clave === nueva.clave) {
                this._mostrarAlerta(nueva);
                return;
            }
        }

        // Una alerta más prioritaria interrumpe a la actual; la interrumpida vuelve a la cola
        // (salvo las "sin cola", que solo tienen sentido en el momento).
        if (this._alertaActual && !this._expandido &&
            nueva.prioridad > this._alertaActual.prioridad) {
            if (!this._alertaActual.sinCola)
                this._encolar(this._alertaActual);
            this._mostrarAlerta(nueva);
            return;
        }

        if (!this._alertaActual && !this._expandido) {
            this._mostrarAlerta(nueva);
            return;
        }

        if (nueva.sinCola)
            return;
        this._encolar(nueva);
    }

    /**
     * Actualiza el contenido de una alerta (visible o en cola) sin reiniciar su tiempo.
     * Útil cuando la batería de los AirPods llega un instante después de conectar.
     *
     * @param {string} clave - Clave de la alerta.
     * @param {object} datosNuevos - Campos a reemplazar en `datos`.
     */
    actualizarAlerta(clave, datosNuevos) {
        const enCola = this._colaAlertas.find(a => a.clave === clave);
        if (enCola)
            enCola.datos = {...enCola.datos, ...datosNuevos};

        if (this._alertaActual?.clave === clave) {
            this._alertaActual.datos = {...this._alertaActual.datos, ...datosNuevos};
            this._emitirVista();
        }
    }

    /**
     * Elimina una alerta (por ejemplo, una notificación que el usuario ya cerró o pulsó).
     * @param {string} clave - Clave de la alerta.
     */
    descartarAlerta(clave) {
        this._colaAlertas = this._colaAlertas.filter(a => a.clave !== clave);
        if (this._alertaActual?.clave === clave)
            this._finalizarAlerta();
    }

    /**
     * Informa la pista activa. `null` significa que no hay reproductor.
     * @param {object|null} pista - Datos normalizados del servicio multimedia.
     */
    actualizarPista(pista) {
        this._pista = pista;
        this._emitirVista();
    }

    /**
     * Informa los dispositivos de audio Bluetooth conectados.
     * @param {object[]} dispositivos
     */
    actualizarDispositivos(dispositivos) {
        this._dispositivos = dispositivos;
        this._emitirVista();
    }

    /**
     * Informa la hora y la fecha (cada minuto).
     * @param {{hora: string, fecha: string}} reloj
     */
    actualizarReloj(reloj) {
        this._reloj = reloj;
        this._emitirVista();
    }

    /**
     * Guarda una notificación en la lista de recientes (página "Notificaciones").
     * @param {object} notificacion - Datos del capturador (con `id`).
     */
    registrarNotificacion(notificacion) {
        this._notificaciones = [notificacion, ...this._notificaciones.filter(n => n.id !== notificacion.id)]
            .slice(0, MAXIMO_NOTIFICACIONES_RECIENTES);
        this._emitirVista();
    }

    /**
     * Quita una notificación de la lista (se cerró, se abrió o se descartó).
     * @param {string} id
     */
    quitarNotificacion(id) {
        const antes = this._notificaciones.length;
        this._notificaciones = this._notificaciones.filter(n => n.id !== id);
        if (this._notificaciones.length !== antes)
            this._emitirVista();
    }

    /**
     * Estado del temporizador de la isla (cada segundo mientras corre).
     * @param {{estado: string, totalMs: number, restanteMs: number}} temporizador
     */
    actualizarTemporizador(temporizador) {
        this._temporizador = temporizador;
        this._emitirVista();
    }

    /**
     * El usuario eligió qué actividad ver en la cápsula (la última página que miró,
     * o tocó el círculo). Se recuerda mientras esa actividad siga activa.
     * @param {string} actividad - ACTIVIDADES.HORA, ACTIVIDADES.MUSICA o ACTIVIDADES.TEMPORIZADOR.
     */
    establecerActividadPreferida(actividad) {
        if (!VISTAS_COMPACTAS.includes(actividad) || actividad === this._actividadPreferida)
            return;
        this._actividadPreferida = actividad;
        registrarDepuracion(`Actividad preferida: ${actividad}`);
        this._emitirVista();
    }

    /**
     * El usuario deslizó sobre la cápsula: pasa a la vista siguiente (+1) o anterior (-1)
     * en el orden de VISTAS_COMPACTAS (hora → música → temporizador).
     * @param {number} direccion - +1 o -1.
     * @returns {boolean} false si ya estaba en el extremo (la UI hace un rebote).
     */
    cambiarVistaCompacta(direccion) {
        const {principal, vistas} = this._calcularActividades();
        const siguiente = vistas[vistas.indexOf(principal) + direccion];
        if (!siguiente)
            return false;
        this._actividadPreferida = siguiente;
        registrarDepuracion(`Vista de la cápsula: ${siguiente}`);
        this._emitirVista();
        return true;
    }

    /**
     * Decide qué va en la cápsula (principal) y qué en el círculo (secundaria).
     *   1. Actividades disponibles: temporizador en marcha/pausa, música sonando.
     *   2. Vistas de la cápsula: la hora (siempre) + las disponibles, en orden VISTAS_COMPACTAS.
     *   3. Principal: la vista preferida del usuario si sigue disponible; si no, la primera
     *      actividad por ORDEN_ACTIVIDADES; si no hay ninguna, la hora.
     *   4. Secundaria: otra actividad (con la hora delante, la primera activa); si no hay,
     *      los auriculares conectados.
     * @returns {{principal: string, secundaria: string|null, vistas: string[]}}
     */
    _calcularActividades() {
        const estadoTemporizador = this._temporizador?.estado;
        const disponibles = ORDEN_ACTIVIDADES.filter(actividad => {
            if (actividad === ACTIVIDADES.TEMPORIZADOR)
                return estadoTemporizador === ESTADOS_TEMPORIZADOR.CORRIENDO || estadoTemporizador === ESTADOS_TEMPORIZADOR.PAUSADO;
            if (actividad === ACTIVIDADES.MUSICA)
                return Boolean(this._pista?.reproduciendo);
            return false;
        });

        const vistas = VISTAS_COMPACTAS.filter(vista => vista === ACTIVIDADES.HORA || disponibles.includes(vista));
        const principal = vistas.includes(this._actividadPreferida)
            ? this._actividadPreferida
            : disponibles[0] ?? ACTIVIDADES.HORA;
        let secundaria = disponibles.find(actividad => actividad !== principal) ?? null;
        if (!secundaria && this._dispositivos.length > 0)
            secundaria = ACTIVIDADES.AURICULARES;
        return {principal, secundaria, vistas};
    }

    /**
     * Micrófono, cámara o pantalla en uso (puntitos de privacidad).
     * @param {{microfono: boolean, camara: boolean, pantalla: boolean}} privacidad
     */
    actualizarPrivacidad(privacidad) {
        this._privacidad = privacidad;
        this._emitirVista();
    }

    /** Vacía la lista de recientes. */
    limpiarNotificaciones() {
        if (this._notificaciones.length === 0)
            return;
        this._notificaciones = [];
        this._emitirVista();
    }

    // ───────────────────────── Órdenes del usuario ─────────────────────────

    /**
     * Abre o cierra la tarjeta expandida. Mientras está abierta, las alertas
     * nuevas esperan en la cola para no interrumpir al usuario.
     * @param {boolean} abierta
     */
    establecerExpandido(abierta) {
        if (this._expandido === abierta)
            return;

        this._expandido = abierta;

        if (abierta) {
            // La alerta visible vuelve a la cola: se terminará de mostrar al cerrar
            // (las "sin cola" se descartan).
            if (this._alertaActual) {
                this._cancelarTemporizador();
                if (!this._alertaActual.sinCola)
                    this._colaAlertas.unshift(this._alertaActual);
                this._alertaActual = null;
            }
            this._emitirVista();
        } else {
            this._siguienteAlerta();
        }
    }

    /**
     * Congela la alerta visible mientras el puntero está encima y le da un
     * margen extra al salir, para que el usuario alcance a leerla.
     * @param {boolean} mantener
     */
    mantenerAlerta(mantener) {
        if (!this._alertaActual)
            return;

        if (mantener)
            this._cancelarTemporizador();
        else if (!this._idTemporizadorAlerta)
            this._programarFinAlerta(TIEMPO_EXTRA_ALERTA_TRAS_HOVER_MS);
    }

    /** Vuelve a dibujar la isla con los datos actuales (ej. tras cambiar un ajuste). */
    refrescar() {
        this._emitirVista();
    }

    /** Libera temporizadores. Debe llamarse desde disable(). */
    destruir() {
        this._cancelarTemporizador();
        this._colaAlertas = [];
        this._alertaActual = null;
        this._interfaz = null;
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    _encolar(alerta) {
        this._colaAlertas.push(alerta);
        this._colaAlertas.sort((a, b) => b.prioridad - a.prioridad || a.orden - b.orden);

        // Evita que se acumulen alertas viejas si el usuario deja la tarjeta abierta mucho tiempo.
        while (this._colaAlertas.length > MAXIMO_ALERTAS_EN_COLA)
            this._colaAlertas.pop();
    }

    _mostrarAlerta(alerta) {
        this._alertaActual = alerta;
        this._programarFinAlerta(alerta.duracionMs);
        this._emitirVista();
    }

    _programarFinAlerta(milisegundos) {
        this._cancelarTemporizador();
        this._idTemporizadorAlerta = GLib.timeout_add(GLib.PRIORITY_DEFAULT, milisegundos, () => {
            this._idTemporizadorAlerta = 0;
            try {
                this._finalizarAlerta();
            } catch (error) {
                registrarError('controlador: fin de alerta', error);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _finalizarAlerta() {
        this._cancelarTemporizador();
        this._alertaActual = null;
        this._siguienteAlerta();
    }

    _siguienteAlerta() {
        if (this._expandido)
            return;

        const siguiente = this._colaAlertas.shift();
        if (siguiente)
            this._mostrarAlerta(siguiente);
        else
            this._emitirVista();
    }

    _cancelarTemporizador() {
        if (this._idTemporizadorAlerta) {
            GLib.source_remove(this._idTemporizadorAlerta);
            this._idTemporizadorAlerta = 0;
        }
    }

    /** Calcula el estado según las prioridades y envía la vista a la interfaz. */
    _emitirVista() {
        if (!this._interfaz)
            return;

        let estado;
        if (this._expandido)
            estado = ESTADOS.EXPANDIDO;
        else if (this._alertaActual)
            estado = ESTADOS.ALERTA;
        else if (this._pista?.reproduciendo)
            estado = ESTADOS.MULTIMEDIA;
        else
            estado = ESTADOS.REPOSO;

        if (estado !== this._estado)
            registrarDepuracion(`Estado: ${this._estado} → ${estado}`);
        this._estado = estado;

        /** @type {Vista} */
        const vista = {
            estado,
            alerta: this._alertaActual,
            pista: this._pista,
            dispositivos: this._dispositivos,
            reloj: this._reloj,
            notificaciones: this._notificaciones,
            temporizador: this._temporizador,
            privacidad: this._privacidad,
            actividades: this._calcularActividades(),
        };
        // Un fallo al dibujar no debe romper la máquina de estados.
        try {
            this._interfaz.mostrarVista(vista);
        } catch (error) {
            registrarError(`interfaz: mostrarVista(${estado})`, error);
        }
    }
}

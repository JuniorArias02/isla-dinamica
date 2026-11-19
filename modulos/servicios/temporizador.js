// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Temporizador — Capa 3 (servicio). El temporizador propio de la isla.
 *
 * El Reloj de GNOME no publica sus temporizadores para otros programas, así
 * que la isla tiene el suyo: se pone desde la página "Temporizador" y la
 * cuenta atrás se ve en la cápsula, como una actividad en vivo del iPhone.
 *
 * Precisión: se guarda la HORA DE FIN (reloj monotónico) y lo que falta se
 * calcula a partir de ella, así no se acumulan desfases.
 *
 * Excepción a "nada de sondeo" (documentada en REGLAS): mientras corre, un
 * temporizador de una sola vez se reprograma al siguiente cambio de segundo
 * para refrescar la cuenta atrás. Pausado o inactivo, no hay ningún temporizador.
 */

import GLib from 'gi://GLib';

import {SONIDO_TEMPORIZADOR, ESTADOS_TEMPORIZADOR} from '../constantes.js';
import {registrarInfo, registrarAviso, registrarError} from '../registro.js';

/** @returns {number} Milisegundos de un reloj que no salta con cambios de hora. */
function ahoraMs() {
    return GLib.get_monotonic_time() / 1000;
}

export class Temporizador {
    /**
     * @param {Function} alCambiar - Recibe {estado, totalMs, restanteMs} en cada cambio y cada segundo.
     */
    constructor(alCambiar) {
        this._alCambiar = alCambiar;
        this._estado = ESTADOS_TEMPORIZADOR.INACTIVO;
        this._totalMs = 0;
        this._finMs = 0;
        this._restantePausadoMs = 0;
        this._idTic = 0;
    }

    /** @returns {{estado: string, totalMs: number, restanteMs: number}} */
    get resumen() {
        return {estado: this._estado, totalMs: this._totalMs, restanteMs: this._restanteMs()};
    }

    /**
     * Arranca una cuenta atrás nueva (reemplaza la que hubiera).
     * @param {number} duracionMs
     */
    iniciar(duracionMs) {
        if (!(duracionMs > 0))
            return;
        this._totalMs = duracionMs;
        this._finMs = ahoraMs() + duracionMs;
        this._estado = ESTADOS_TEMPORIZADOR.CORRIENDO;
        const segundos = Math.round(duracionMs / 1000);
        registrarInfo(`Temporizador iniciado: ${segundos >= 60 ? `${Math.round(segundos / 60)} min` : `${segundos} s`}.`);
        this._programarTic();
        this._emitir();
    }

    /**
     * Suma tiempo (ej. "+1 min"). Si ya había terminado, vuelve a arrancar con ese tiempo.
     * @param {number} ms
     */
    sumar(ms) {
        if (this._estado === ESTADOS_TEMPORIZADOR.CORRIENDO) {
            this._finMs += ms;
            this._totalMs += ms;
        } else if (this._estado === ESTADOS_TEMPORIZADOR.PAUSADO) {
            this._restantePausadoMs += ms;
            this._totalMs += ms;
        } else {
            this.iniciar(ms);
            return;
        }
        this._emitir();
    }

    pausar() {
        if (this._estado !== ESTADOS_TEMPORIZADOR.CORRIENDO)
            return;
        this._restantePausadoMs = this._restanteMs();
        this._estado = ESTADOS_TEMPORIZADOR.PAUSADO;
        this._cancelarTic();
        this._emitir();
    }

    reanudar() {
        if (this._estado !== ESTADOS_TEMPORIZADOR.PAUSADO)
            return;
        this._finMs = ahoraMs() + this._restantePausadoMs;
        this._estado = ESTADOS_TEMPORIZADOR.CORRIENDO;
        this._programarTic();
        this._emitir();
    }

    /** Detiene y olvida la cuenta atrás (también quita el aviso de "tiempo cumplido"). */
    cancelar() {
        this._cancelarTic();
        this._estado = ESTADOS_TEMPORIZADOR.INACTIVO;
        this._totalMs = 0;
        this._restantePausadoMs = 0;
        this._emitir();
    }

    destruir() {
        this._cancelarTic();
        this._alCambiar = null;
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    _restanteMs() {
        switch (this._estado) {
        case ESTADOS_TEMPORIZADOR.CORRIENDO:
            return Math.max(0, this._finMs - ahoraMs());
        case ESTADOS_TEMPORIZADOR.PAUSADO:
            return this._restantePausadoMs;
        default:
            return 0;
        }
    }

    /** Reprograma el siguiente refresco justo cuando cambie el segundo mostrado. */
    _programarTic() {
        this._cancelarTic();
        const restante = this._restanteMs();
        const hastaSiguienteSegundo = (restante % 1000) || 1000;
        this._idTic = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.ceil(hastaSiguienteSegundo), () => {
            this._idTic = 0;
            try {
                this._alTic();
            } catch (error) {
                registrarError('temporizador: tic', error);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelarTic() {
        if (this._idTic) {
            GLib.source_remove(this._idTic);
            this._idTic = 0;
        }
    }

    _alTic() {
        if (this._estado !== ESTADOS_TEMPORIZADOR.CORRIENDO)
            return;
        if (this._restanteMs() <= 0) {
            this._terminar();
            return;
        }
        this._programarTic();
        this._emitir();
    }

    _terminar() {
        this._estado = ESTADOS_TEMPORIZADOR.TERMINADO;
        registrarInfo('Temporizador: ¡tiempo cumplido!');
        try {
            // Sonido de alarma del tema de sonidos del sistema.
            global.display.get_sound_player().play_from_theme(SONIDO_TEMPORIZADOR, 'Temporizador', null);
        } catch (error) {
            registrarAviso(`Temporizador: no se pudo reproducir el sonido: ${error.message}`);
        }
        this._emitir();
    }

    _emitir() {
        try {
            this._alCambiar?.(this.resumen);
        } catch (error) {
            registrarError('temporizador: avisar a la isla', error);
        }
    }
}

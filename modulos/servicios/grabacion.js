// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * MonitorGrabacion — grabación de pantalla de GNOME (herramienta de captura,
 * Ctrl+Alt+Mayús+R).
 *
 * Capa 3 (servicios). Sigue `Main.screenshotUI · screencast-in-progress` y
 * entrega {grabando, transcurridoMs}: al empezar, cada segundo mientras dura y
 * al terminar. También abre la herramienta de captura o de grabación y detiene
 * la grabación (las mismas funciones que usan los atajos de teclado de GNOME).
 *
 * Excepción a la regla de no sondear: un temporizador de una sola vez que se
 * reprograma al siguiente segundo, SOLO mientras se graba (el contador tiene que
 * avanzar). Es lo mismo que hace el indicador de grabación de GNOME.
 */

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Captura from 'resource:///org/gnome/shell/ui/screenshot.js';

import {registrarInfo, registrarError, protegido} from '../registro.js';

const MICROSEGUNDOS_POR_MS = 1000;

export class MonitorGrabacion {
    /**
     * @param {Function} alCambiar - Recibe {grabando, transcurridoMs}.
     */
    constructor(alCambiar) {
        this._alCambiar = alCambiar;
        this._inicioUs = 0;
        this._idTic = 0;
        this._grabando = false;
        /** Duración de la última grabación terminada (para el aviso). */
        this.ultimaDuracionMs = 0;
    }

    iniciar() {
        Main.screenshotUI.connectObject('notify::screencast-in-progress',
            protegido('grabación: cambio de estado', () => this._actualizar()), this);
        this._actualizar();
    }

    /** @returns {{grabando: boolean, transcurridoMs: number}} */
    get estado() {
        return {grabando: this._grabando, transcurridoMs: this._transcurridoMs()};
    }

    /** Detiene la grabación en curso (como el botón rojo de GNOME). */
    detener() {
        Main.screenshotUI.stopScreencast()
            .catch(error => registrarError('grabación: detener', error));
    }

    /** Abre la herramienta de captura de pantalla de GNOME. */
    abrirCaptura() {
        Captura.showScreenshotUI();
    }

    /** Abre la herramienta de captura en modo grabación. */
    abrirGrabacion() {
        Captura.showScreenRecordingUI();
    }

    destruir() {
        Main.screenshotUI.disconnectObject(this);
        this._detenerTic();
        this._alCambiar = null;
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    _actualizar() {
        const grabando = Boolean(Main.screenshotUI.screencast_in_progress);
        if (grabando === this._grabando)
            return;
        // La duración se mide ANTES de marcar el final (después ya no hay inicio).
        if (!grabando)
            this.ultimaDuracionMs = this._transcurridoMs();
        this._grabando = grabando;

        if (grabando) {
            this._inicioUs = GLib.get_monotonic_time();
            registrarInfo('Grabación de pantalla: empieza.');
            this._programarTic();
        } else {
            this._detenerTic();
            this._inicioUs = 0;
            registrarInfo(`Grabación de pantalla: termina (${Math.round(this.ultimaDuracionMs / 1000)} s).`);
        }
        this._emitir();
    }

    _transcurridoMs() {
        if (!this._grabando || !this._inicioUs)
            return 0;
        return Math.floor((GLib.get_monotonic_time() - this._inicioUs) / MICROSEGUNDOS_POR_MS);
    }

    /** Un aviso al siguiente cambio de segundo (no se acumula desfase). */
    _programarTic() {
        this._detenerTic();
        const espera = 1000 - (this._transcurridoMs() % 1000);
        this._idTic = GLib.timeout_add(GLib.PRIORITY_DEFAULT, espera, () => {
            this._idTic = 0;
            protegido('grabación: segundo', () => {
                if (!this._grabando)
                    return;
                this._emitir();
                this._programarTic();
            })();
            return GLib.SOURCE_REMOVE;
        });
    }

    _detenerTic() {
        if (this._idTic) {
            GLib.source_remove(this._idTic);
            this._idTic = 0;
        }
    }

    _emitir() {
        try {
            this._alCambiar?.(this.estado);
        } catch (error) {
            registrarError('grabación: avisar a la isla', error);
        }
    }
}

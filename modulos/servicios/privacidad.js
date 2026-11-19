// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * MonitorPrivacidad — Capa 3 (servicio). ¿Qué está usando las apps ahora mismo?
 *
 *   Cámara     → Shell.CameraMonitor (API pública: propiedad cameras-in-use).
 *   Micrófono  → el indicador de entrada de audio de los Ajustes rápidos de GNOME
 *                se hace visible cuando una app graba sonido; se observa su
 *                visibilidad (es interno: si GNOME lo cambia, se registra un aviso
 *                y el resto sigue funcionando).
 *   Pantalla   → grabación con la herramienta de GNOME (Main.screenshotUI) y
 *                grabación/compartición por otras apps (RemoteAccessController de
 *                Mutter: OBS, videollamadas compartiendo pantalla...).
 *
 * Todo por señales; nada de sondeo. Entrega {microfono, camara, pantalla} (booleanos).
 */

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {registrarInfo, registrarAviso, protegido} from '../registro.js';

/** GNOME crea los indicadores de Ajustes rápidos de forma asíncrona: se reintenta encontrarlos. */
const INTERVALO_BUSQUEDA_MICROFONO_MS = 1000;
const INTENTOS_BUSQUEDA_MICROFONO = 20;

export class MonitorPrivacidad {
    /**
     * @param {Function} alCambiar - Recibe {microfono, camara, pantalla}.
     */
    constructor(alCambiar) {
        this._alCambiar = alCambiar;
        this._camara = null;
        this._indicadorMicrofono = null;
        this._controladorRemoto = null;
        /** @type {Set<object>} Sesiones de grabación/compartición de pantalla de otras apps. */
        this._sesionesPantalla = new Set();
        this._estado = {microfono: false, camara: false, pantalla: false};
        this._idBusquedaMicrofono = 0;
    }

    iniciar() {
        const actualizar = protegido('privacidad: cambio', () => this._actualizar());

        // Cámara · Shell.CameraMonitor · propiedad cameras-in-use.
        this._camara = new Shell.CameraMonitor();
        this._camara.connectObject('notify::cameras-in-use', actualizar, this);

        // Micrófono · indicador de entrada de audio de los Ajustes rápidos (visible = alguien graba).
        // Al iniciar sesión puede no existir todavía: se busca hasta que aparezca.
        this._buscarIndicadorMicrofono(actualizar, 1);

        // Pantalla (herramienta de GNOME) · Main.screenshotUI · notify::screencast-in-progress.
        Main.screenshotUI.connectObject('notify::screencast-in-progress', actualizar, this);

        // Pantalla (otras apps) · Meta.RemoteAccessController · señal new-handle.
        this._controladorRemoto = global.backend.get_remote_access_controller();
        this._controladorRemoto?.connectObject('new-handle', protegido('privacidad: nueva sesión de pantalla',
            (_controlador, sesion) => this._alNuevaSesion(sesion)), this);

        this._actualizar();
        registrarInfo('Privacidad lista.');
    }

    destruir() {
        if (this._idBusquedaMicrofono) {
            GLib.source_remove(this._idBusquedaMicrofono);
            this._idBusquedaMicrofono = 0;
        }
        this._camara?.disconnectObject(this);
        this._camara?.run_dispose();
        this._camara = null;
        this._indicadorMicrofono?.disconnectObject(this);
        this._indicadorMicrofono = null;
        Main.screenshotUI.disconnectObject(this);
        this._controladorRemoto?.disconnectObject(this);
        this._controladorRemoto = null;
        for (const sesion of this._sesionesPantalla)
            sesion.disconnectObject?.(this);
        this._sesionesPantalla.clear();
        this._alCambiar = null;
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    /**
     * Engancha el indicador de micrófono de GNOME; si aún no existe, reintenta.
     * @param {Function} actualizar
     * @param {number} intento
     */
    _buscarIndicadorMicrofono(actualizar, intento) {
        this._idBusquedaMicrofono = 0;
        const indicador = Main.panel.statusArea.quickSettings?._volumeInput?._indicator ?? null;
        if (indicador) {
            this._indicadorMicrofono = indicador;
            indicador.connectObject('notify::visible', actualizar, this);
            this._actualizar();
            return;
        }
        if (intento >= INTENTOS_BUSQUEDA_MICROFONO) {
            registrarAviso('Privacidad: no se encontró el indicador de micrófono de GNOME; no se mostrará su punto.');
            return;
        }
        this._idBusquedaMicrofono = GLib.timeout_add(GLib.PRIORITY_DEFAULT, INTERVALO_BUSQUEDA_MICROFONO_MS, () => {
            this._idBusquedaMicrofono = 0;
            protegido('privacidad: buscar indicador de micrófono',
                () => this._buscarIndicadorMicrofono(actualizar, intento + 1))();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** Una app empezó a grabar o compartir la pantalla (cuenta hasta que la sesión termina). */
    _alNuevaSesion(sesion) {
        this._sesionesPantalla.add(sesion);
        sesion.connectObject('stopped', protegido('privacidad: fin de sesión de pantalla', () => {
            sesion.disconnectObject(this);
            this._sesionesPantalla.delete(sesion);
            this._actualizar();
        }), this);
        this._actualizar();
    }

    _actualizar() {
        const nuevo = {
            microfono: Boolean(this._indicadorMicrofono?.visible),
            camara: Boolean(this._camara?.cameras_in_use),
            pantalla: Boolean(Main.screenshotUI.screencast_in_progress) || this._sesionesPantalla.size > 0,
        };
        const cambio = Object.keys(nuevo).some(clave => nuevo[clave] !== this._estado[clave]);
        if (!cambio)
            return;
        this._estado = nuevo;
        const enUso = Object.entries(nuevo).filter(([, activo]) => activo).map(([nombre]) => nombre);
        registrarInfo(`Privacidad: ${enUso.length ? `en uso → ${enUso.join(', ')}` : 'nada en uso'}.`);
        this._alCambiar?.({...nuevo});
    }
}

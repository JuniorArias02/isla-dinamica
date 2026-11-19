// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * MonitorModos — "No molestar" y modo avión.
 *
 * Capa 3 (servicios). Avisa cuando el usuario activa o desactiva uno de los
 * modos (desde Ajustes rápidos, el teclado o el menú de la isla). El estado al
 * arrancar no genera aviso.
 *
 *   No molestar → GSettings org.gnome.desktop.notifications · show-banners (false = activado)
 *   Modo avión  → org.gnome.SettingsDaemon.Rfkill · propiedad AirplaneMode (bus de sesión)
 */

import Gio from 'gi://Gio';

import {MODOS} from '../constantes.js';
import {registrarInfo, registrarAviso, registrarError, protegido} from '../registro.js';

const XML_RFKILL = `
<node>
  <interface name="org.gnome.SettingsDaemon.Rfkill">
    <property name="AirplaneMode" type="b" access="readwrite"/>
    <property name="HardwareAirplaneMode" type="b" access="read"/>
    <property name="HasAirplaneMode" type="b" access="read"/>
  </interface>
</node>`;

const ProxyRfkill = Gio.DBusProxy.makeProxyWrapper(XML_RFKILL);

export class MonitorModos {
    /**
     * @param {Function} alCambiar - Recibe (modo, activo, estado): modo es uno de MODOS y
     *   estado = {noMolestar, avion} completo. Se llama solo cuando algo cambia.
     */
    constructor(alCambiar) {
        this._alCambiar = alCambiar;
        this._notificaciones = null;
        this._rfkill = null;
        this._idRfkill = 0;
        this._cancelable = new Gio.Cancellable();
        this._estado = {noMolestar: false, avion: false};
    }

    /** @returns {{noMolestar: boolean, avion: boolean}} */
    get estado() {
        return {...this._estado};
    }

    async iniciar() {
        // No molestar · GSettings (lo mismo que cambia el interruptor de Ajustes rápidos).
        this._notificaciones = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        this._estado.noMolestar = !this._notificaciones.get_boolean('show-banners');
        this._notificaciones.connectObject('changed::show-banners',
            protegido('modos: cambio de No molestar', () => this._actualizar(MODOS.NO_MOLESTAR,
                !this._notificaciones.get_boolean('show-banners'))), this);

        // Modo avión · Servicio org.gnome.SettingsDaemon.Rfkill · interfaz org.gnome.SettingsDaemon.Rfkill
        try {
            this._rfkill = await new Promise((resolver, rechazar) => {
                ProxyRfkill(Gio.DBus.session, 'org.gnome.SettingsDaemon.Rfkill',
                    '/org/gnome/SettingsDaemon/Rfkill',
                    (proxy, error) => (error ? rechazar(error) : resolver(proxy)), this._cancelable);
            });
            this._estado.avion = this._avionActivo();
            // Señal org.freedesktop.DBus.Properties.PropertiesChanged (g-properties-changed).
            this._idRfkill = this._rfkill.connect('g-properties-changed',
                protegido('modos: cambio de modo avión', () => this._actualizar(MODOS.AVION, this._avionActivo())));
        } catch (error) {
            if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            registrarAviso(`Modos: no se pudo vigilar el modo avión (${error.message}).`);
        }

        registrarInfo(`Modos listos: No molestar ${this._estado.noMolestar ? 'activado' : 'desactivado'}, ` +
            `modo avión ${this._estado.avion ? 'activado' : 'desactivado'}.`);
    }

    /**
     * Activa o desactiva "No molestar" (desde el menú de la isla).
     * @param {boolean} activo
     */
    establecerNoMolestar(activo) {
        this._notificaciones?.set_boolean('show-banners', !activo);
    }

    destruir() {
        this._cancelable.cancel();
        this._notificaciones?.disconnectObject(this);
        this._notificaciones = null;
        if (this._rfkill && this._idRfkill)
            this._rfkill.disconnect(this._idRfkill);
        this._idRfkill = 0;
        this._rfkill = null;
        this._alCambiar = null;
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    /** Modo avión por software (interruptor de GNOME) o por hardware (tecla del portátil). */
    _avionActivo() {
        return Boolean(this._rfkill?.AirplaneMode || this._rfkill?.HardwareAirplaneMode);
    }

    _actualizar(modo, activo) {
        const clave = modo === MODOS.NO_MOLESTAR ? 'noMolestar' : 'avion';
        if (this._estado[clave] === activo)
            return;
        this._estado[clave] = activo;
        registrarInfo(`Modos: ${modo} ${activo ? 'activado' : 'desactivado'}.`);
        try {
            this._alCambiar?.(modo, activo, this.estado);
        } catch (error) {
            registrarError('modos: avisar a la isla', error);
        }
    }
}

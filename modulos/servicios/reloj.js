/**
 * MonitorReloj — Capa 3 (servicio de hora y fecha).
 *
 * Usa el mismo reloj que el panel de GNOME (GnomeDesktop.WallClock): avisa
 * con `notify::clock` cuando cambia el minuto (sin sondeo) y respeta el
 * formato 12/24 h e idioma del sistema.
 *
 * Entrega {hora, fecha}, por ejemplo {hora: '10:29 a. m.', fecha: 'Miércoles, 19 de noviembre'}.
 */

import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';

import {registrarInfo, protegido} from '../registro.js';

/** Formato de la fecha larga (el idioma lo pone el sistema: lunes, martes...). */
const FORMATO_FECHA = '%A, %-d de %B';

export class MonitorReloj {
    /**
     * @param {Function} alCambiar - Recibe {hora, fecha} cada vez que cambia el minuto.
     */
    constructor(alCambiar) {
        this._alCambiar = alCambiar;
        this._reloj = null;
        this._idCambio = 0;
    }

    /** Empieza a escuchar el reloj del sistema y emite la hora actual. */
    iniciar() {
        // Solo la hora (sin fecha): la fecha la formatea la isla aparte.
        this._reloj = new GnomeDesktop.WallClock({time_only: true});
        // Señal notify::clock de GnomeDesktop.WallClock (cambia cada minuto).
        this._idCambio = this._reloj.connect('notify::clock', protegido('reloj: cambio de minuto', () => this._emitir()));
        this._emitir();
        registrarInfo('Reloj listo.');
    }

    /** @returns {{hora: string, fecha: string}} */
    get actual() {
        const ahora = GLib.DateTime.new_now_local();
        const fecha = ahora.format(FORMATO_FECHA) ?? '';
        return {
            hora: (this._reloj?.clock ?? ahora.format('%H:%M')).trim(),
            fecha: fecha.charAt(0).toUpperCase() + fecha.slice(1),
        };
    }

    destruir() {
        if (this._reloj && this._idCambio)
            this._reloj.disconnect(this._idCambio);
        this._idCambio = 0;
        this._reloj?.run_dispose();
        this._reloj = null;
        this._alCambiar = null;
    }

    _emitir() {
        this._alCambiar?.(this.actual);
    }
}

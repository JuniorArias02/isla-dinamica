// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * MonitorCalendario — eventos del calendario de GNOME (los mismos que muestra
 * el menú del reloj: Evolution, Google y demás cuentas en línea).
 *
 * Capa 3 (servicios). Reutiliza la fuente de eventos del menú del reloj
 * (`dateMenu._eventSource`, una Calendar.DBusEventSource) en lugar de crear otra:
 * el servidor de calendario de GNOME tiene UN rango de fechas compartido, y
 * pedirle otro distinto descuadraría el calendario del panel. Por eso se pide
 * exactamente la cuadrícula del mes actual, la misma que pide GNOME al abrir
 * su calendario.
 *
 * Entrega {hayCalendarios, inicioSemana, eventos} donde cada evento es
 * {id, titulo, inicioMs, finMs, todoElDia, hora}. Nunca registra títulos.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {registrarInfo, registrarAviso, registrarError, protegido} from '../registro.js';
import {rangoCuadricula, esTodoElDia} from './calendarioFechas.js';

/** org.gnome.desktop.calendar · week-start-day: 0 = "default" (según el idioma). */
const INICIO_SEMANA_POR_DEFECTO = 0;

export class MonitorCalendario {
    /**
     * @param {Function} alCambiar - Recibe {hayCalendarios, inicioSemana, eventos} cada vez que cambian.
     */
    constructor(alCambiar) {
        this._alCambiar = alCambiar;
        this._fuente = null;
        this._idMedianoche = 0;
        this._formatoReloj = null;
        this._ajustesCalendario = null;
    }

    iniciar() {
        this._fuente = Main.panel.statusArea.dateMenu?._eventSource ?? null;
        if (!this._fuente?.getEvents) {
            registrarAviso('Calendario: no se encontró la fuente de eventos de GNOME; la página no mostrará eventos.');
            this._fuente = null;
            this._emitir();
            return;
        }

        // 12 o 24 horas, como el reloj del panel.
        this._formatoReloj = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._formatoReloj.connectObject('changed::clock-format',
            protegido('calendario: cambio de formato de hora', () => this._emitir()), this);
        // Primer día de la semana (lunes, domingo...), como el calendario de GNOME.
        this._ajustesCalendario = new Gio.Settings({schema_id: 'org.gnome.desktop.calendar'});
        this._ajustesCalendario.connectObject('changed::week-start-day',
            protegido('calendario: cambio de primer día de la semana', () => this.pedirMesActual()), this);

        const actualizar = protegido('calendario: eventos cambiados', () => this._emitir());
        this._fuente.connectObject(
            'changed', actualizar,
            'notify::has-calendars', actualizar,
            this);

        this.pedirMesActual();
        this._programarMedianoche();
        registrarInfo(`Calendario listo (${this._fuente.hasCalendars ? 'con' : 'sin'} calendarios).`);
    }

    /**
     * Pide al servidor los eventos del mes actual (la misma cuadrícula que GNOME).
     * Si ya es el rango vigente, GNOME no vuelve a cargar nada.
     */
    pedirMesActual() {
        if (!this._fuente)
            return;
        const {inicio, fin} = rangoCuadricula(new Date(), this._inicioSemana());
        this._fuente.requestRange(inicio, fin);
        this._emitir();
    }

    destruir() {
        if (this._idMedianoche) {
            GLib.source_remove(this._idMedianoche);
            this._idMedianoche = 0;
        }
        // La fuente es de GNOME: solo se desconecta, nunca se destruye.
        this._fuente?.disconnectObject(this);
        this._fuente = null;
        this._formatoReloj?.disconnectObject(this);
        this._formatoReloj = null;
        this._ajustesCalendario?.disconnectObject(this);
        this._ajustesCalendario = null;
        this._alCambiar = null;
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    /** Al cambiar de día (o de mes) se vuelve a pedir el mes y se redibuja. */
    _programarMedianoche() {
        const ahora = new Date();
        const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0, 5);
        this._idMedianoche = GLib.timeout_add(GLib.PRIORITY_DEFAULT, manana - ahora, () => {
            this._idMedianoche = 0;
            protegido('calendario: cambio de día', () => {
                this.pedirMesActual();
                this._programarMedianoche();
            })();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** @returns {number} Primer día de la semana: 0 = domingo … 6 = sábado. */
    _inicioSemana() {
        const elegido = this._ajustesCalendario?.get_enum('week-start-day') ?? INICIO_SEMANA_POR_DEFECTO;
        return elegido === INICIO_SEMANA_POR_DEFECTO ? Shell.util_get_week_start() : elegido % 7;
    }

    _formatearHora(fecha) {
        const doceHoras = this._formatoReloj?.get_string('clock-format') === '12h';
        const fechaGlib = GLib.DateTime.new_from_unix_local(Math.floor(fecha.getTime() / 1000));
        return fechaGlib.format(doceHoras ? '%l:%M %p' : '%H:%M').trim();
    }

    _emitir() {
        const inicioSemana = this._inicioSemana();
        let datos = {hayCalendarios: false, inicioSemana, eventos: []};
        if (this._fuente) {
            const {inicio, fin} = rangoCuadricula(new Date(), inicioSemana);
            const eventos = this._fuente.getEvents(inicio, fin).map(evento => {
                const todoElDia = esTodoElDia(evento.date, evento.end);
                return {
                    id: evento.id,
                    titulo: evento.summary ?? '',
                    inicioMs: evento.date.getTime(),
                    finMs: evento.end.getTime(),
                    todoElDia,
                    hora: todoElDia ? null : this._formatearHora(evento.date),
                };
            });
            datos = {hayCalendarios: Boolean(this._fuente.hasCalendars), inicioSemana, eventos};
        }
        try {
            this._alCambiar?.(datos);
        } catch (error) {
            registrarError('calendario: avisar a la isla', error);
        }
    }
}

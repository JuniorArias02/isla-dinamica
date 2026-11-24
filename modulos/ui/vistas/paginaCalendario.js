// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * PaginaCalendario — el mes actual y los próximos eventos.
 *
 *   NOVIEMBRE                      HOY
 *   L  M  X  J  V  S  D            ▍ Reunión de equipo
 *                     1            ▍ 5:00 p. m.
 *   2  3  4  5  6  7  8            MAÑANA
 *   …     (19)  ·                  ▍ Cumpleaños de Ana
 *                                  ▍ Todo el día
 *
 * - Hoy va en un círculo rojo; los días con eventos llevan un punto debajo.
 * - Solo se listan eventos que aún no terminaron, de hoy a una semana.
 * - Tocar la página abre la app Calendario.
 *
 * Es la página de la hora: se abre cuando la cápsula muestra la hora.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {protegido} from '../../registro.js';

/** Eventos que caben en la lista (el resto se resume en "y N más"). */
const MAXIMO_EVENTOS = 3;

/** Días hacia adelante que se miran para la lista de próximos eventos. */
const DIAS_PROXIMOS = 7;

/** Letras de los días (domingo primero) con el mismo contexto de traducción que GNOME. */
const LETRAS_DIAS = Object.freeze([
    ['grid sunday', 'S'], ['grid monday', 'M'], ['grid tuesday', 'T'], ['grid wednesday', 'W'],
    ['grid thursday', 'T'], ['grid friday', 'F'], ['grid saturday', 'S'],
]);

/** Inicial del día de la semana (0 = domingo), traducida como en el calendario de GNOME. */
function letraDia(dia) {
    const [contexto, letra] = LETRAS_DIAS[dia];
    const traducida = Shell.util_translate_time_string(`${contexto}\u0004${letra}`);
    if (traducida && !traducida.includes('\u0004') && traducida !== letra)
        return traducida;
    // Sin traducción: primera letra del nombre corto del día en el idioma del sistema.
    const domingo = GLib.DateTime.new_local(2023, 1, 1, 0, 0, 0); // 1 de enero de 2023 fue domingo
    return domingo.add_days(dia).format('%a').charAt(0).toLocaleUpperCase();
}

/** Inicio del día de una fecha (medianoche local). */
function inicioDelDia(fecha) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

/** "HOY", "MAÑANA" o "LUN 24". */
function nombreDelDia(dia, hoy) {
    const diferencia = Math.round((dia - hoy) / (24 * 60 * 60 * 1000));
    if (diferencia <= 0)
        return 'HOY';
    if (diferencia === 1)
        return 'MAÑANA';
    const fecha = GLib.DateTime.new_from_unix_local(Math.floor(dia.getTime() / 1000));
    return fecha.format('%a %e').replace(/\s+/g, ' ').replace('.', '').toLocaleUpperCase();
}

export const PaginaCalendario = GObject.registerClass(
class PaginaCalendario extends St.BoxLayout {
    /**
     * @param {object} opciones
     * @param {Function} opciones.alAbrir - Abre la app Calendario.
     */
    _init({alAbrir}) {
        super._init({style_class: 'isla-pagina isla-pagina-calendario'});

        const abrir = protegido('calendario: abrir la app', () => alAbrir());

        // Mes
        this._mes = new St.BoxLayout({
            style_class: 'isla-calendario-mes',
            orientation: Clutter.Orientation.VERTICAL,
        });
        this._nombreMes = new St.Label({style_class: 'isla-calendario-nombre-mes'});
        this._cuadricula = new St.Widget({
            style_class: 'isla-calendario-cuadricula',
            layout_manager: new Clutter.GridLayout({column_homogeneous: true, row_spacing: 1}),
        });
        this._mes.add_child(this._nombreMes);
        this._mes.add_child(this._cuadricula);
        const botonMes = new St.Button({
            style_class: 'isla-calendario-boton',
            child: this._mes,
            y_align: Clutter.ActorAlign.START,
        });
        botonMes.connect('clicked', abrir);

        // Próximos eventos
        this._eventos = new St.BoxLayout({
            style_class: 'isla-calendario-eventos',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        const botonEventos = new St.Button({
            style_class: 'isla-calendario-boton',
            child: this._eventos,
            x_expand: true,
            y_align: Clutter.ActorAlign.START,
        });
        botonEventos.connect('clicked', abrir);

        this.add_child(botonMes);
        this.add_child(botonEventos);

        this._claveMes = null;
        this._claveEventos = null;
    }

    /**
     * @param {object|null} calendario - {hayCalendarios, inicioSemana, eventos}
     */
    actualizar(calendario) {
        const ahora = new Date();
        const hoy = inicioDelDia(ahora);
        const {hayCalendarios = false, inicioSemana = 1, eventos = []} = calendario ?? {};

        // Días del mes con algún evento (para el punto).
        const diasConEventos = new Set();
        for (const evento of eventos) {
            const dia = inicioDelDia(new Date(evento.inicioMs));
            const ultimo = new Date(evento.finMs - 1);
            for (; dia <= ultimo; dia.setDate(dia.getDate() + 1)) {
                if (dia.getMonth() === hoy.getMonth())
                    diasConEventos.add(dia.getDate());
            }
        }

        const claveMes = `${hoy.getTime()}|${inicioSemana}|${[...diasConEventos].sort((a, b) => a - b)}`;
        if (claveMes !== this._claveMes) {
            this._claveMes = claveMes;
            this._dibujarMes(hoy, inicioSemana, diasConEventos);
        }

        const proximos = this._elegirProximos(eventos, ahora, hoy);
        const claveEventos = `${hayCalendarios}|${hoy.getTime()}|` +
            proximos.lista.map(e => `${e.id}@${e.inicioMs}-${e.finMs}:${e.titulo}:${e.hora}`).join(',') + `|${proximos.resto}`;
        if (claveEventos !== this._claveEventos) {
            this._claveEventos = claveEventos;
            this._dibujarEventos(proximos, hayCalendarios, hoy);
        }
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    _dibujarMes(hoy, inicioSemana, diasConEventos) {
        const fecha = GLib.DateTime.new_from_unix_local(Math.floor(hoy.getTime() / 1000));
        this._nombreMes.text = (fecha.format('%OB') || fecha.format('%B')).toLocaleUpperCase();

        this._cuadricula.destroy_all_children();
        const rejilla = this._cuadricula.layout_manager;

        for (let columna = 0; columna < 7; columna++) {
            rejilla.attach(new St.Label({
                text: letraDia((inicioSemana + columna) % 7),
                style_class: 'isla-calendario-dia-semana',
                x_align: Clutter.ActorAlign.CENTER,
            }), columna, 0, 1, 1);
        }

        const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
        const desplazamiento = (7 + primero.getDay() - inicioSemana) % 7;

        for (let dia = 1; dia <= diasEnMes; dia++) {
            const posicion = desplazamiento + dia - 1;
            const diaSemana = (inicioSemana + (posicion % 7)) % 7;
            const celda = new St.BoxLayout({
                style_class: 'isla-calendario-dia',
                orientation: Clutter.Orientation.VERTICAL,
                x_align: Clutter.ActorAlign.CENTER,
            });
            const numero = new St.Bin({
                style_class: 'isla-calendario-numero',
                x_align: Clutter.ActorAlign.CENTER,
                child: new St.Label({
                    text: `${dia}`,
                    style_class: 'isla-calendario-numero-texto',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                }),
            });
            if (dia === hoy.getDate())
                numero.add_style_class_name('hoy');
            else if (diaSemana === 0 || diaSemana === 6)
                numero.add_style_class_name('fin-de-semana');
            celda.add_child(numero);
            celda.add_child(new St.Widget({
                style_class: 'isla-calendario-punto',
                x_align: Clutter.ActorAlign.CENTER,
                opacity: diasConEventos.has(dia) && dia !== hoy.getDate() ? 255 : 0,
            }));
            rejilla.attach(celda, posicion % 7, 1 + Math.floor(posicion / 7), 1, 1);
        }
    }

    /**
     * Eventos que todavía no terminaron, de hoy a DIAS_PROXIMOS días, en orden.
     * @returns {{lista: object[], resto: number}}
     */
    _elegirProximos(eventos, ahora, hoy) {
        const limite = new Date(hoy);
        limite.setDate(limite.getDate() + DIAS_PROXIMOS);
        const vigentes = eventos
            .filter(e => e.finMs > ahora.getTime() && e.inicioMs < limite.getTime())
            .sort((a, b) => Math.max(a.inicioMs, hoy.getTime()) - Math.max(b.inicioMs, hoy.getTime()) ||
                Number(b.todoElDia) - Number(a.todoElDia));
        return {lista: vigentes.slice(0, MAXIMO_EVENTOS), resto: Math.max(0, vigentes.length - MAXIMO_EVENTOS)};
    }

    _dibujarEventos({lista, resto}, hayCalendarios, hoy) {
        this._eventos.destroy_all_children();

        if (lista.length === 0) {
            this._eventos.add_child(new St.Label({
                text: hayCalendarios ? 'Sin eventos próximos' : 'Sin calendarios',
                style_class: 'isla-calendario-vacio',
            }));
            const detalle = new St.Label({
                text: hayCalendarios
                    ? 'Nada en tu calendario esta semana.'
                    : 'Añade una cuenta en Configuración → Cuentas en línea.',
                style_class: 'isla-calendario-vacio-detalle',
            });
            detalle.clutter_text.line_wrap = true;
            this._eventos.add_child(detalle);
            return;
        }

        let diaAnterior = null;
        for (const evento of lista) {
            const dia = inicioDelDia(new Date(Math.max(evento.inicioMs, hoy.getTime())));
            if (diaAnterior?.getTime() !== dia.getTime()) {
                this._eventos.add_child(new St.Label({
                    text: nombreDelDia(dia, hoy),
                    style_class: 'isla-calendario-encabezado-dia',
                }));
                diaAnterior = dia;
            }
            this._eventos.add_child(this._crearFilaEvento(evento));
        }

        if (resto > 0) {
            this._eventos.add_child(new St.Label({
                text: resto === 1 ? 'y 1 más' : `y ${resto} más`,
                style_class: 'isla-calendario-mas',
            }));
        }
    }

    _crearFilaEvento(evento) {
        const fila = new St.BoxLayout({style_class: 'isla-calendario-evento'});
        fila.add_child(new St.Widget({style_class: 'isla-calendario-barra', y_expand: true}));

        const textos = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        const titulo = new St.Label({
            text: evento.titulo || 'Sin título',
            style_class: 'isla-calendario-titulo',
        });
        titulo.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        textos.add_child(titulo);
        textos.add_child(new St.Label({
            text: evento.todoElDia ? 'Todo el día' : evento.hora ?? '',
            style_class: 'isla-calendario-hora',
        }));
        fila.add_child(textos);
        return fila;
    }
});

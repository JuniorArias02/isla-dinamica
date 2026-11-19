// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * BateriasAirPods — los tres anillos de batería de unos AirPods:
 * izquierdo, derecho y estuche, con un rayo cuando cargan.
 *
 * También exporta `nivelMostrado()`, que decide qué porcentaje enseñar
 * cuando solo cabe un número (burbuja del panel).
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {icono, ICONOS} from '../iconos.js';
import {aparecerConRebote} from '../animaciones.js';
import {IndicadorBateria} from './anilloBateria.js';

const PIEZAS = Object.freeze([
    {clave: 'izquierdo', etiqueta: 'Izq.', etiquetaCorta: 'I'},
    {clave: 'derecho', etiqueta: 'Der.', etiquetaCorta: 'D'},
    {clave: 'estuche', etiqueta: 'Estuche', etiquetaCorta: null},
]);

/**
 * Porcentaje a mostrar cuando solo cabe uno: el auricular con menos batería
 * (es el que se acabará primero). Si no hay datos AAP, la batería de BlueZ.
 * @param {object} dispositivo - {bateria, airpods}
 * @returns {number|null}
 */
export function nivelMostrado(dispositivo) {
    const {izquierdo, derecho} = dispositivo?.airpods ?? {};
    const niveles = [izquierdo?.nivel, derecho?.nivel].filter(n => Number.isFinite(n));
    if (niveles.length > 0)
        return Math.min(...niveles);
    return dispositivo?.bateria ?? null;
}

/**
 * @param {object|null} airpods - EstadoAirPods del servicio.
 * @returns {boolean} true si hay al menos un dato de batería por pieza.
 */
export function tieneBateriasDetalladas(airpods) {
    return Boolean(airpods?.izquierdo || airpods?.derecho || airpods?.estuche);
}

/** Una pieza: anillo + nombre (+ rayo si carga). */
const PiezaAirPods = GObject.registerClass(
class PiezaAirPods extends St.BoxLayout {
    _init({clave, etiqueta, etiquetaCorta}, compacto) {
        super._init({
            style_class: 'isla-pieza-airpods',
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.clave = clave;

        this._anillo = new IndicadorBateria({
            diametro: compacto ? 34 : 52,
            grosor: compacto ? 3.5 : 5,
        });
        this._anillo.x_align = Clutter.ActorAlign.CENTER;

        const pie = new St.BoxLayout({style_class: 'isla-pieza-pie', x_align: Clutter.ActorAlign.CENTER});
        this._rayo = new St.Icon({gicon: icono(ICONOS.RAYO), style_class: 'isla-pieza-rayo', visible: false});
        pie.add_child(this._rayo);

        const texto = compacto ? etiquetaCorta : etiqueta;
        if (texto) {
            pie.add_child(new St.Label({text: texto, style_class: 'isla-pieza-etiqueta'}));
        } else {
            pie.add_child(new St.Icon({gicon: icono(ICONOS.ESTUCHE), style_class: 'isla-pieza-icono-estuche'}));
        }

        this.add_child(this._anillo);
        this.add_child(pie);
        this._datos = null;
    }

    /** @param {{nivel: number, cargando: boolean}|null} datos */
    actualizar(datos) {
        this._datos = datos;
        this.visible = Boolean(datos);
        if (!datos)
            return;
        this._anillo.establecer(datos.nivel);
        this._rayo.visible = datos.cargando;
    }

    animarEntrada(retraso) {
        if (!this._datos)
            return;
        aparecerConRebote(this._anillo, {retraso, escalaInicial: 0.6});
        this._anillo.establecer(this._datos.nivel, {desdeCero: true});
    }
});

export const BateriasAirPods = GObject.registerClass(
class BateriasAirPods extends St.BoxLayout {
    /**
     * @param {object} [opciones]
     * @param {boolean} [opciones.compacto=false] - Versión pequeña (para la alerta).
     */
    _init({compacto = false} = {}) {
        super._init({
            style_class: compacto ? 'isla-baterias-airpods compacto' : 'isla-baterias-airpods',
            x_align: compacto ? Clutter.ActorAlign.END : Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._piezas = PIEZAS.map(pieza => {
            const actor = new PiezaAirPods(pieza, compacto);
            this.add_child(actor);
            return actor;
        });
    }

    /** @param {object|null} airpods - EstadoAirPods del servicio. */
    actualizar(airpods) {
        for (const pieza of this._piezas)
            pieza.actualizar(airpods?.[pieza.clave] ?? null);
    }

    /** Los anillos se llenan uno tras otro. */
    animarEntrada(retrasoBase = 0) {
        this._piezas.forEach((pieza, indice) => pieza.animarEntrada(retrasoBase + indice * 70));
    }
});

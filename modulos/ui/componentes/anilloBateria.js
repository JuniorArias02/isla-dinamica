// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * IndicadorBateria — anillo circular de batería al estilo de los móviles.
 *
 * Usa el Aro genérico (anilloProgreso.js) con color según el nivel
 * (verde / amarillo / rojo). El arco se llena con una
 * animación de la propiedad `progreso`. En el centro va el porcentaje o
 * un icono pequeño.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {DURACION_ANILLO_MS} from '../../constantes.js';
import {icono, ICONOS} from '../iconos.js';
import {animarPropiedad} from '../movimiento.js';
import {Aro, COLORES_ARO} from './anilloProgreso.js';

/** Color del arco según el nivel de batería: verde, amarillo o rojo. */
function colorSegunNivel(fraccion) {
    if (fraccion > 0.5)
        return COLORES_ARO.VERDE;
    if (fraccion > 0.2)
        return COLORES_ARO.AMARILLO;
    return COLORES_ARO.ROJO;
}

export const IndicadorBateria = GObject.registerClass(
class IndicadorBateria extends St.Widget {
    /**
     * @param {object} opciones
     * @param {number} opciones.diametro - Tamaño en píxeles.
     * @param {number} [opciones.grosor=4] - Grosor del aro.
     * @param {'texto'|'icono'} [opciones.centro='texto'] - Qué se dibuja dentro del aro.
     */
    _init({diametro, grosor = 4, centro = 'texto'}) {
        super._init({
            style_class: 'isla-indicador-bateria',
            layout_manager: new Clutter.BinLayout(),
            width: diametro,
            height: diametro,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._aro = new Aro(diametro, grosor, colorSegunNivel);
        this.add_child(this._aro);

        if (centro === 'icono') {
            this._centro = new St.Icon({
                gicon: icono(ICONOS.AURICULARES),
                style_class: 'isla-indicador-icono',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
        } else {
            this._centro = new St.Label({
                style_class: 'isla-indicador-texto',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
        }
        this.add_child(this._centro);

        this._porcentaje = undefined;
    }

    /**
     * Fuerza un color (ej. verde mientras carga, como el iPhone) o vuelve al
     * color según el nivel.
     * @param {number[]|null} color - RGBA 0–1, o null para el color por nivel.
     */
    establecerColorFijo(color) {
        this._aro.establecerColor(color ?? colorSegunNivel);
    }

    /**
     * Muestra un nivel de batería.
     * @param {number|null} porcentaje - 0–100, o null si se desconoce.
     * @param {object} [opciones]
     * @param {boolean} [opciones.desdeCero=false] - Si el arco debe llenarse desde 0 (efecto de entrada).
     */
    establecer(porcentaje, {desdeCero = false} = {}) {
        const fraccion = porcentaje === null ? 0 : porcentaje / 100;

        if (this._centro instanceof St.Label)
            this._centro.text = porcentaje === null ? '' : `${porcentaje}`;

        if (porcentaje === this._porcentaje && !desdeCero)
            return;
        this._porcentaje = porcentaje;

        this._aro.establecerNivelReal(fraccion);
        if (desdeCero)
            this._aro.progreso = 0;

        this._aro.remove_transition('progreso');
        animarPropiedad(this._aro, 'progreso', fraccion, {
            duration: DURACION_ANILLO_MS,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }
});

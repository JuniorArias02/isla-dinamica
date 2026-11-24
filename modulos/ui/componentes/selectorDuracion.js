// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * SelectorDuracion — horas, minutos y segundos con ruedas (estilo iPhone).
 *
 *        23       58       58
 *   ┌─[ 00 ] h  [ 05 ] min [ 00 ] s ─┐   ← banda del valor elegido
 *        01       06       01
 *
 * No sabe nada del temporizador: solo entrega la duración elegida.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {ALTO_FILA_RUEDA_PX} from '../../constantes.js';
import {RuedaSelector} from './ruedaSelector.js';

const SEGUNDOS_POR_HORA = 3600;
const SEGUNDOS_POR_MINUTO = 60;

export const SelectorDuracion = GObject.registerClass(
class SelectorDuracion extends St.Widget {
    /**
     * @param {object} opciones
     * @param {number} opciones.segundos - Duración inicial.
     * @param {Function} [opciones.alCambiar] - Recibe la duración en segundos cada vez que cambia.
     */
    _init({segundos, alCambiar = null}) {
        super._init({
            style_class: 'isla-selector-duracion',
            layout_manager: new Clutter.BinLayout(),
        });
        this._alCambiar = alCambiar;
        this._listo = false;

        // Banda detrás del valor elegido, a lo ancho de las tres ruedas.
        this.add_child(new St.Widget({
            style_class: 'isla-selector-banda',
            height: ALTO_FILA_RUEDA_PX,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));

        const fila = new St.BoxLayout({style_class: 'isla-selector-ruedas', x_align: Clutter.ActorAlign.CENTER});
        const avisar = () => {
            if (this._listo)
                this._alCambiar?.(this.segundos);
        };
        this._horas = new RuedaSelector({cantidad: 24, alCambiar: avisar});
        this._minutos = new RuedaSelector({cantidad: 60, alCambiar: avisar});
        this._segundos = new RuedaSelector({cantidad: 60, alCambiar: avisar});

        for (const [rueda, unidad] of [[this._horas, 'h'], [this._minutos, 'min'], [this._segundos, 's']]) {
            fila.add_child(rueda);
            fila.add_child(new St.Label({
                text: unidad,
                style_class: 'isla-selector-unidad',
                y_align: Clutter.ActorAlign.CENTER,
            }));
        }
        this.add_child(fila);

        this.establecerSegundos(segundos, false);
        this._listo = true;
    }

    /** @returns {number} Duración elegida, en segundos. */
    get segundos() {
        return this._horas.valor * SEGUNDOS_POR_HORA + this._minutos.valor * SEGUNDOS_POR_MINUTO + this._segundos.valor;
    }

    /**
     * Pone las ruedas en una duración (girando si se pide animación).
     * @param {number} segundos
     * @param {boolean} [conAnimacion=true]
     */
    establecerSegundos(segundos, conAnimacion = true) {
        const total = Math.max(0, Math.round(segundos));
        this._horas.establecerValor(Math.floor(total / SEGUNDOS_POR_HORA) % 24, conAnimacion);
        this._minutos.establecerValor(Math.floor(total % SEGUNDOS_POR_HORA / SEGUNDOS_POR_MINUTO), conAnimacion);
        this._segundos.establecerValor(total % SEGUNDOS_POR_MINUTO, conAnimacion);
    }
});

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * CapaTinte — tiñe el vidrio con el color de la canción (estilo Liquid Glass).
 *
 * Se coloca entre el vidrio y el contenido, con la forma de la isla (la pone el CSS:
 * `isla-tinte-portada`, y `tarjeta` para la isla abierta). El color es un degradado
 * del de la carátula, más intenso arriba.
 *
 * Cambio de color (una canción nueva), como luz que entra en el cristal:
 *
 *   rojo ──────╮
 *              ╳  1. Cruce: dos láminas; la del color nuevo aparece mientras la
 *   azul ──────╯     del anterior se va (sin pasar por "sin color").
 *              ✦  2. Destello: el color nuevo llega más intenso
 *                    (INTENSIDAD_DESTELLO_TINTE)…
 *              ─  3. …y se asienta despacio en su intensidad normal.
 *
 * La primera vez aparece igual (destello y asentado); sin música, se desvanece.
 * Todo con el motor de movimiento: respeta el ajuste "Animaciones siempre".
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
    DURACION_TINTE_MS,
    DURACION_CAMBIO_COLOR_MS,
    DURACION_ASENTAR_COLOR_MS,
    INTENSIDAD_DESTELLO_TINTE,
    OPACIDAD_TINTE_ARRIBA,
    OPACIDAD_TINTE_ABAJO,
} from '../../constantes.js';
import {animar} from '../movimiento.js';
import {colorDeTinte, cssRgba, mismoColor} from '../estilos/tinte.js';

/**
 * Opacidad de una lámina ya asentada. Cada lámina se pinta con la intensidad del
 * destello; asentada, su opacidad la deja en la intensidad normal.
 */
const OPACIDAD_ASENTADA = Math.round(255 / INTENSIDAD_DESTELLO_TINTE);

export const CapaTinte = GObject.registerClass(
class CapaTinte extends St.Widget {
    /**
     * @param {object} [opciones]
     * @param {string} [opciones.claseExtra] - Ej. 'tarjeta' (esquinas de la isla abierta).
     */
    _init({claseExtra = ''} = {}) {
        super._init({
            style_class: `isla-tinte-portada ${claseExtra}`.trim(),
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
            reactive: false,
        });
        this._laminas = [0, 1].map(() => {
            const lamina = new St.Widget({style_class: 'isla-tinte-lamina', x_expand: true, y_expand: true, opacity: 0});
            this.add_child(lamina);
            return lamina;
        });
        /** Lámina que muestra el color actual (la otra recibe el siguiente). */
        this._actual = 0;
        this._color = null;
        this.connect('destroy', () => this._laminas.forEach(lamina => lamina.remove_all_transitions()));
    }

    /** @returns {{r: number, g: number, b: number}|null} El tinte que muestra (ya ajustado), o null. */
    get color() {
        return this._color;
    }

    /** No pide sitio: ocupa lo que le dé su contenedor. */
    vfunc_get_preferred_width(_alto) {
        return [0, 0];
    }

    vfunc_get_preferred_height(_ancho) {
        return [0, 0];
    }

    /**
     * @param {{r: number, g: number, b: number}|null} color - Color de la carátula (null = sin tinte).
     */
    establecerColor(color) {
        const tinte = colorDeTinte(color);
        if (mismoColor(tinte, this._color))
            return;
        this._color = tinte;

        const saliente = this._laminas[this._actual];
        if (!tinte) {
            animar(saliente, {opacity: 0, duration: DURACION_TINTE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            return;
        }

        // 1. Cruce: la lámina libre toma el color nuevo y aparece encima de la anterior.
        this._actual = 1 - this._actual;
        const entrante = this._laminas[this._actual];
        entrante.remove_all_transitions();
        entrante.opacity = 0;
        entrante.style = `background-gradient-direction: vertical;
            background-gradient-start: ${cssRgba(tinte, Math.min(1, OPACIDAD_TINTE_ARRIBA * INTENSIDAD_DESTELLO_TINTE))};
            background-gradient-end: ${cssRgba(tinte, Math.min(1, OPACIDAD_TINTE_ABAJO * INTENSIDAD_DESTELLO_TINTE))};`;
        this.set_child_above_sibling(entrante, null);

        animar(saliente, {opacity: 0, duration: DURACION_CAMBIO_COLOR_MS, mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD});
        // 2. Destello: llega con toda su intensidad…
        animar(entrante, {
            opacity: 255,
            duration: DURACION_CAMBIO_COLOR_MS,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            // 3. …y se asienta despacio en la intensidad normal.
            onComplete: () => animar(entrante, {
                opacity: OPACIDAD_ASENTADA,
                duration: DURACION_ASENTAR_COLOR_MS,
                mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
            }),
        });
    }
});

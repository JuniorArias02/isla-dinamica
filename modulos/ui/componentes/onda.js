// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Onda — barras de audio decorativas que "bailan" mientras suena música.
 *
 * Es una animación del compositor (ease con repetición infinita); solo corre
 * cuando está activa, y se detiene por completo al pausar u ocultarse.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {animar} from '../movimiento.js';

/** Duración de cada barra; distintas para que el movimiento parezca orgánico. */
const DURACIONES_MS = [420, 560, 360, 500, 440];

/** Altura en reposo (fracción) de cada barra. */
const ESCALA_REPOSO = 0.35;

export const Onda = GObject.registerClass(
class Onda extends St.BoxLayout {
    /**
     * @param {object} [opciones]
     * @param {number} [opciones.barras=4] - Número de barras.
     * @param {string} [opciones.claseExtra] - Clase CSS adicional (ej. tamaño grande).
     */
    _init({barras = 4, claseExtra = ''} = {}) {
        super._init({
            style_class: `isla-onda ${claseExtra}`.trim(),
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._activa = false;
        this._barras = DURACIONES_MS.slice(0, barras).map(() => {
            const barra = new St.Widget({
                style_class: 'isla-onda-barra',
                y_align: Clutter.ActorAlign.CENTER,
            });
            barra.set_pivot_point(0.5, 0.5);
            barra.scale_y = ESCALA_REPOSO;
            this.add_child(barra);
            return barra;
        });

        this.connect('destroy', () => this._barras.forEach(b => b.remove_all_transitions()));
    }

    /**
     * Arranca o detiene el baile de las barras.
     * @param {boolean} activa
     */
    establecerActiva(activa) {
        if (activa === this._activa)
            return;
        this._activa = activa;

        if (!activa) {
            this._detener();
            return;
        }

        this._barras.forEach((barra, indice) => {
            barra.scale_y = ESCALA_REPOSO;
            animar(barra, {
                scale_y: 1,
                duration: DURACIONES_MS[indice],
                mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                repeatCount: -1,
                autoReverse: true,
            });
        });
    }

    _detener() {
        for (const barra of this._barras) {
            barra.remove_all_transitions();
            animar(barra, {
                scale_y: ESCALA_REPOSO,
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }
});

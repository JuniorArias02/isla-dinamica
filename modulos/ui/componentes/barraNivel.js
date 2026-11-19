// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * BarraNivel — barra horizontal con un relleno proporcional (volumen, brillo, progreso).
 *
 *   ━━━━━━━━━━━━━━━━──────────
 *
 * El ancho del relleno se calcula DENTRO de la asignación de tamaño de la barra
 * (vfunc_allocate) a partir de la propiedad `fraccion`. Así sigue a la barra
 * aunque esta cambie de ancho en cada fotograma (morfosis de la isla) sin volver
 * a pedir otra asignación en medio de la actual.
 *
 * No cambiar esto por un `notify::width` que ajuste el ancho del relleno: eso pide
 * un nuevo cálculo de tamaños mientras Mutter está calculando, la tarjeta queda
 * sin tamaño válido ese fotograma ("Can't update stage views...") y sus
 * animaciones pueden congelarse.
 *
 * `fraccion` es una propiedad GObject: se anima con animarPropiedad().
 */

import GObject from 'gi://GObject';
import St from 'gi://St';

import {animarPropiedad} from '../movimiento.js';

export const BarraNivel = GObject.registerClass({
    Properties: {
        'fraccion': GObject.ParamSpec.double(
            'fraccion', null, null,
            GObject.ParamFlags.READWRITE,
            0, 1, 0),
    },
}, class BarraNivel extends St.Widget {
    /**
     * @param {object} opciones
     * @param {string} opciones.estiloBarra - Clase CSS del fondo de la barra.
     * @param {string} opciones.estiloRelleno - Clase CSS del relleno.
     * @param {object} [opciones.parametros] - Más propiedades de St.Widget (x_expand, y_align...).
     */
    _init({estiloBarra, estiloRelleno, ...parametros}) {
        super._init({style_class: estiloBarra, ...parametros});
        this._fraccion = 0;
        this._relleno = new St.Widget({style_class: estiloRelleno});
        this.add_child(this._relleno);
    }

    /** @returns {number} Fracción rellena (0–1). */
    get fraccion() {
        return this._fraccion;
    }

    set fraccion(valor) {
        const limitado = Math.min(1, Math.max(0, valor));
        if (limitado === this._fraccion)
            return;
        this._fraccion = limitado;
        this.notify('fraccion');
        this.queue_relayout();
    }

    /** El relleno, para añadirle o quitarle clases CSS (ej. "amplificado"). */
    get relleno() {
        return this._relleno;
    }

    /**
     * Cambia el nivel, con o sin animación.
     * @param {number} fraccion - 0–1.
     * @param {object} [opciones]
     * @param {number} [opciones.duracionMs=0] - 0 = al instante.
     * @param {number} [opciones.modo] - Clutter.AnimationMode.
     */
    establecerFraccion(fraccion, {duracionMs = 0, modo} = {}) {
        this.remove_transition('fraccion');
        if (duracionMs > 0)
            animarPropiedad(this, 'fraccion', Math.min(1, Math.max(0, fraccion)), {duration: duracionMs, mode: modo});
        else
            this.fraccion = fraccion;
    }

    vfunc_allocate(caja) {
        this.set_allocation(caja);
        const contenido = this.get_theme_node().get_content_box(caja);
        const relleno = contenido.copy();
        relleno.x2 = relleno.x1 + Math.round(contenido.get_width() * this._fraccion);
        this._relleno.allocate(relleno);
    }
});

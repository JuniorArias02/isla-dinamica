// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Anillos de progreso dibujados con Cairo (genéricos).
 *
 *   Aro             — el dibujo: aro de fondo + arco de progreso (0–1) animable.
 *                     El color lo decide una función según el nivel, o es fijo.
 *   AnilloProgreso  — Aro + texto en el centro (ej. "4:32" del temporizador).
 *
 * IndicadorBateria (anilloBateria.js) usa el mismo Aro con colores de batería.
 */

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {animarPropiedad} from '../movimiento.js';

/** Color del aro de fondo (RGBA 0–1). */
const COLOR_FONDO = [1, 1, 1, 0.16];

/** Colores de acento reutilizables (RGBA 0–1). */
export const COLORES_ARO = Object.freeze({
    VERDE: [0.19, 0.82, 0.35, 1],
    AMARILLO: [1.0, 0.84, 0.04, 1],
    ROJO: [1.0, 0.27, 0.23, 1],
    NARANJA: [1.0, 0.62, 0.04, 1],
});

/**
 * El aro dibujado. `progreso` va de 0 a 1 y se anima con animarPropiedad.
 */
export const Aro = GObject.registerClass({
    Properties: {
        'progreso': GObject.ParamSpec.double(
            'progreso', null, null,
            GObject.ParamFlags.READWRITE,
            0, 1, 0),
    },
}, class Aro extends St.DrawingArea {
    /**
     * @param {number} diametro
     * @param {number} grosor
     * @param {Function|number[]} color - RGBA fijo, o función (nivel 0–1) → RGBA.
     */
    _init(diametro, grosor, color) {
        super._init({width: diametro, height: diametro});
        this._grosor = grosor;
        this._color = color;
        this._progreso = 0;
        this._nivelReal = 0;
    }

    get progreso() {
        return this._progreso;
    }

    set progreso(valor) {
        if (this._progreso === valor)
            return;
        this._progreso = valor;
        this.notify('progreso');
        this.queue_repaint();
    }

    /** Nivel real (para elegir el color aunque la animación aún no haya llegado). */
    establecerNivelReal(fraccion) {
        this._nivelReal = fraccion;
        this.queue_repaint();
    }

    /** @param {Function|number[]} color - RGBA fijo o función nivel → RGBA. */
    establecerColor(color) {
        this._color = color;
        this.queue_repaint();
    }

    vfunc_repaint() {
        const contexto = this.get_context();
        const [ancho, alto] = this.get_surface_size();
        const radio = Math.min(ancho, alto) / 2 - this._grosor / 2;
        const centroX = ancho / 2;
        const centroY = alto / 2;

        contexto.setLineWidth(this._grosor);
        contexto.setLineCap(Cairo.LineCap.ROUND);

        // Aro de fondo.
        contexto.setSourceRGBA(...COLOR_FONDO);
        contexto.arc(centroX, centroY, radio, 0, 2 * Math.PI);
        contexto.stroke();

        // Arco de progreso, empezando arriba y girando en sentido horario.
        if (this._progreso > 0.001) {
            const inicio = -Math.PI / 2;
            const color = typeof this._color === 'function' ? this._color(this._nivelReal) : this._color;
            contexto.setSourceRGBA(...color);
            contexto.arc(centroX, centroY, radio, inicio, inicio + 2 * Math.PI * this._progreso);
            contexto.stroke();
        }

        contexto.$dispose();
    }
});

/**
 * Anillo con texto en el centro y color fijo (ej. cuenta atrás del temporizador).
 */
export const AnilloProgreso = GObject.registerClass(
class AnilloProgreso extends St.Widget {
    /**
     * @param {object} opciones
     * @param {number} opciones.diametro
     * @param {number} [opciones.grosor=5]
     * @param {number[]} [opciones.color=COLORES_ARO.NARANJA]
     * @param {string} [opciones.claseTexto='isla-anillo-texto'] - Clase CSS del texto central.
     */
    _init({diametro, grosor = 5, color = COLORES_ARO.NARANJA, claseTexto = 'isla-anillo-texto'}) {
        super._init({
            layout_manager: new Clutter.BinLayout(),
            width: diametro,
            height: diametro,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._aro = new Aro(diametro, grosor, color);
        this._texto = new St.Label({
            style_class: claseTexto,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._aro);
        this.add_child(this._texto);
    }

    /**
     * @param {number} fraccion - 0–1.
     * @param {object} [opciones]
     * @param {string} [opciones.texto] - Texto central.
     * @param {number} [opciones.duracion=0] - Animación del arco (0 = instantáneo).
     */
    establecer(fraccion, {texto, duracion = 0} = {}) {
        if (texto !== undefined)
            this._texto.text = texto;
        const destino = Math.min(1, Math.max(0, fraccion));
        this._aro.remove_transition('progreso');
        if (duracion > 0) {
            animarPropiedad(this._aro, 'progreso', destino, {
                duration: duracion,
                mode: Clutter.AnimationMode.LINEAR,
            });
        } else {
            this._aro.progreso = destino;
        }
    }
});

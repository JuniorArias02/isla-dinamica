// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * BarraProgreso — tiempo transcurrido, barra y duración de la pista.
 *
 * - El relleno avanza con una transición lineal para que se vea continuo
 *   aunque la posición solo se consulte una vez por segundo.
 * - Clic en la barra → salta a ese punto de la canción (alBuscar).
 *   La zona de clic es más alta que la barra visible para que sea fácil acertar,
 *   y la barra se engrosa al pasar el puntero.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {INTERVALO_PROGRESO_MS} from '../../constantes.js';
import {protegido} from '../../registro.js';
import {BarraNivel} from './barraNivel.js';

/**
 * Convierte microsegundos a "m:ss".
 * @param {number} microsegundos
 * @returns {string}
 */
export function formatearTiempo(microsegundos) {
    const totalSegundos = Math.max(0, Math.floor(microsegundos / 1_000_000));
    const minutos = Math.floor(totalSegundos / 60);
    const segundos = String(totalSegundos % 60).padStart(2, '0');
    return `${minutos}:${segundos}`;
}

export const BarraProgreso = GObject.registerClass(
class BarraProgreso extends St.BoxLayout {
    /**
     * @param {Function} [alBuscar] - Recibe la fracción (0–1) donde se hizo clic.
     */
    _init(alBuscar) {
        super._init({style_class: 'isla-fila-progreso'});

        this._alBuscar = alBuscar;
        this._buscable = false;

        this._tiempoActual = new St.Label({style_class: 'isla-tiempo', y_align: Clutter.ActorAlign.CENTER});
        this._tiempoTotal = new St.Label({style_class: 'isla-tiempo isla-tiempo-total', y_align: Clutter.ActorAlign.CENTER});

        // Zona de clic (alta) que contiene la barra visible (fina).
        this._zona = new St.Widget({
            style_class: 'isla-zona-barra',
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
        });
        this._barra = new BarraNivel({
            estiloBarra: 'isla-barra-progreso',
            estiloRelleno: 'isla-relleno-progreso',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._zona.add_child(this._barra);

        const gestoClic = new Clutter.ClickGesture();
        gestoClic.connect('recognize', protegido('barra: clic para buscar', () => this._alHacerClic(gestoClic)));
        this._zona.add_action(gestoClic);

        this.add_child(this._tiempoActual);
        this.add_child(this._zona);
        this.add_child(this._tiempoTotal);

        this._fraccion = 0;
        this.reiniciar(0);
    }

    /**
     * Activa o desactiva el clic para saltar (algunos reproductores no lo permiten).
     * @param {boolean} buscable
     */
    establecerBuscable(buscable) {
        this._buscable = buscable;
        this._zona.reactive = buscable;
        if (buscable)
            this._zona.add_style_class_name('buscable');
        else
            this._zona.remove_style_class_name('buscable');
    }

    /**
     * Vuelve a cero (pista nueva).
     * @param {number} duracionUs
     */
    reiniciar(duracionUs) {
        this._duracionUs = duracionUs;
        this._tiempoTotal.text = formatearTiempo(duracionUs);
        this._tiempoActual.text = formatearTiempo(0);
        this._fraccion = 0;
        this._dibujar(false);
    }

    /**
     * Actualiza la posición.
     * @param {number} posicionUs
     * @param {boolean} [conAnimacion=true] - Avance suave (false para saltos).
     */
    establecerPosicion(posicionUs, conAnimacion = true) {
        if (!this._duracionUs)
            return;
        const nueva = Math.min(1, Math.max(0, posicionUs / this._duracionUs));
        // Un retroceso o un salto grande (cambio de canción, seek) no se anima.
        const salto = nueva < this._fraccion || nueva - this._fraccion > 0.05;
        this._fraccion = nueva;
        this._tiempoActual.text = formatearTiempo(posicionUs);
        this._dibujar(conAnimacion && !salto);
    }

    _alHacerClic(gesto) {
        if (!this._buscable || !this._duracionUs || !this._barra.has_allocation())
            return;

        // Coordenadas de pantalla del clic → posición dentro de la barra.
        const evento = gesto.get_point_event(0);
        if (!evento)
            return;
        const [xPantalla, yPantalla] = evento.get_coords();
        const [convertido, xLocal] = this._barra.transform_stage_point(xPantalla, yPantalla);
        if (!convertido)
            return;

        const ancho = this._barra.get_allocation_box().get_width();
        const fraccion = Math.min(1, Math.max(0, xLocal / ancho));

        // Se refleja enseguida; la siguiente consulta de posición lo confirma.
        this.establecerPosicion(fraccion * this._duracionUs, false);
        this._alBuscar?.(fraccion);
    }

    _dibujar(conAnimacion) {
        // Avance lineal durante el intervalo de consulta: se ve continuo.
        this._barra.establecerFraccion(this._fraccion, conAnimacion
            ? {duracionMs: INTERVALO_PROGRESO_MS, modo: Clutter.AnimationMode.LINEAR}
            : {});
    }
});

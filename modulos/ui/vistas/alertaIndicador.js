// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * AlertaIndicador — volumen / brillo en la isla (reemplaza el recuadro de GNOME).
 *
 *   [vol] ━━━━━━━━━━━━━━━━──────────  65
 *
 * La barra se desliza suave a cada pulsación de tecla. Con el volumen
 * amplificado (por encima de 100 %), la parte extra se pinta en naranja.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {TIPOS_INDICADOR} from '../../constantes.js';
import {aparecerConRebote} from '../animaciones.js';
import {BarraNivel} from '../componentes/barraNivel.js';

/** Duración del deslizamiento de la barra entre pulsaciones. */
const DURACION_BARRA_MS = 140;

export const AlertaIndicador = GObject.registerClass(
class AlertaIndicador extends St.BoxLayout {
    _init() {
        super._init({style_class: 'isla-alerta isla-alerta-indicador'});

        this._icono = new St.Icon({style_class: 'isla-indicador-osd-icono', y_align: Clutter.ActorAlign.CENTER});

        this._barra = new BarraNivel({
            estiloBarra: 'isla-indicador-osd-barra',
            estiloRelleno: 'isla-indicador-osd-relleno',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._porcentaje = new St.Label({style_class: 'isla-indicador-osd-porcentaje', y_align: Clutter.ActorAlign.CENTER});

        this.add_child(this._icono);
        this.add_child(this._barra);
        this.add_child(this._porcentaje);
    }

    /**
     * @param {object} datos - {tipo, gicon, nivel, maximo}
     */
    actualizar(datos) {
        this._icono.gicon = datos.gicon;
        this._porcentaje.text = `${Math.round(datos.nivel * 100)}`;

        // Volumen por encima del 100 % (amplificado): relleno naranja de aviso.
        const amplificado = datos.tipo === TIPOS_INDICADOR.VOLUMEN && datos.nivel > 1;
        if (amplificado)
            this._barra.relleno.add_style_class_name('amplificado');
        else
            this._barra.relleno.remove_style_class_name('amplificado');

        // La barra se desliza suave a cada pulsación de tecla.
        this._barra.establecerFraccion(datos.nivel / datos.maximo, {
            duracionMs: DURACION_BARRA_MS,
            modo: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    animarEntrada() {
        aparecerConRebote(this._icono, {retraso: 40, escalaInicial: 0.6});
    }

    /** Otra pulsación de tecla: solo se desliza la barra (ya lo hizo actualizar). */
    animarActualizacion() {}
});

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * AlertaTemporizador — "¡Tiempo cumplido!" cuando el temporizador llega a cero.
 *
 *   [⏱]  Temporizador                        [ Listo ]
 *        ¡Tiempo cumplido! · 5 min
 *
 * El icono se sacude como una alarma. Tocar la isla (o deslizarla) la descarta.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {icono, ICONOS} from '../iconos.js';
import {aparecerConRebote, deslizarEntrada} from '../animaciones.js';
import {animar} from '../movimiento.js';
import {formatearDuracionMin} from '../formato.js';

/** Sacudida de la alarma: ángulo y número de vaivenes. */
const ANGULO_SACUDIDA = 14;
const VAIVENES_SACUDIDA = 7;

export const AlertaTemporizador = GObject.registerClass(
class AlertaTemporizador extends St.BoxLayout {
    _init() {
        super._init({style_class: 'isla-alerta isla-alerta-temporizador'});

        this._icono = new St.Icon({gicon: icono(ICONOS.TEMPORIZADOR), style_class: 'isla-temporizador-alerta-icono'});
        this._cajaIcono = new St.Bin({
            style_class: 'isla-temporizador-icono-caja',
            y_align: Clutter.ActorAlign.CENTER,
            child: this._icono,
        });

        this._textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._textos.add_child(new St.Label({text: 'Temporizador', style_class: 'isla-alerta-titulo'}));
        this._detalle = new St.Label({style_class: 'isla-temporizador-alerta-detalle'});
        this._textos.add_child(this._detalle);

        // Indicación visual: toda la isla es el botón (tocar = listo).
        this._listo = new St.Label({
            text: 'Listo',
            style_class: 'isla-temporizador-listo',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.add_child(this._cajaIcono);
        this.add_child(this._textos);
        this.add_child(this._listo);

        this.connect('destroy', () => this._icono.remove_all_transitions());
    }

    /** @param {object} datos - {totalMs} */
    actualizar(datos) {
        const minutos = Math.round((datos.totalMs ?? 0) / 60000);
        this._detalle.text = minutos > 0
            ? `¡Tiempo cumplido! · ${formatearDuracionMin(minutos)}`
            : '¡Tiempo cumplido!';
    }

    animarEntrada() {
        aparecerConRebote(this._cajaIcono, {retraso: 60});
        deslizarEntrada(this._textos, {retraso: 120});
        this._sacudir();
    }

    /** El icono se sacude como una alarma sonando. */
    _sacudir() {
        this._icono.remove_transition('rotation-angle-z');
        this._icono.set_pivot_point(0.5, 0.5);
        this._icono.rotation_angle_z = -ANGULO_SACUDIDA;
        animar(this._icono, {
            rotation_angle_z: ANGULO_SACUDIDA,
            duration: 90,
            mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
            repeatCount: VAIVENES_SACUDIDA,
            autoReverse: true,
            delay: 200,
            onComplete: () => {
                this._icono.rotation_angle_z = 0;
            },
        });
    }
});

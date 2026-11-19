// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * BotonControl — botón redondo de multimedia (anterior, reproducir, siguiente)
 * con iconos propios y efecto de hundirse al pulsar.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {icono} from '../iconos.js';
import {agregarEfectoPulsacion} from '../animaciones.js';
import {protegido} from '../../registro.js';
import {animar} from '../movimiento.js';

export const BotonControl = GObject.registerClass(
class BotonControl extends St.Button {
    /**
     * @param {object} opciones
     * @param {string} opciones.nombreIcono - Uno de ICONOS.
     * @param {Function} opciones.alPulsar
     * @param {boolean} [opciones.principal=false] - Botón grande y destacado (play/pausa).
     */
    _init({nombreIcono, alPulsar, principal = false}) {
        super._init({
            style_class: principal ? 'isla-boton-control isla-boton-principal' : 'isla-boton-control',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._icono = new St.Icon({
            gicon: icono(nombreIcono),
            style_class: 'isla-icono-control',
        });
        this.set_child(this._icono);
        this._nombreIcono = nombreIcono;

        this.connect('clicked', protegido(`botón ${nombreIcono}`, () => alPulsar()));
        agregarEfectoPulsacion(this);
    }

    /**
     * Cambia el icono con un giro rápido (ej. reproducir ↔ pausa).
     * @param {string} nombreIcono - Uno de ICONOS.
     */
    establecerIcono(nombreIcono) {
        if (nombreIcono === this._nombreIcono)
            return;
        this._nombreIcono = nombreIcono;

        this._icono.set_pivot_point(0.5, 0.5);
        animar(this._icono, {
            scale_x: 0.2,
            scale_y: 0.2,
            opacity: 0,
            duration: 110,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                this._icono.gicon = icono(nombreIcono);
                animar(this._icono, {
                    scale_x: 1,
                    scale_y: 1,
                    opacity: 255,
                    duration: 260,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK,
                });
            },
        });
    }

    /**
     * Activa o desactiva el botón (se ve atenuado si el reproductor no lo permite).
     * @param {boolean} habilitado
     */
    establecerHabilitado(habilitado) {
        this.reactive = habilitado;
        this.can_focus = habilitado;
    }
});

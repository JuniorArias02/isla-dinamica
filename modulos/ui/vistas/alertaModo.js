// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * AlertaModo — aviso breve al activar o desactivar un modo del sistema.
 *
 *   [🌙]  No molestar          [✈]  Modo avión
 *         Activado                  Desactivado
 *
 * El círculo del icono toma el color del modo cuando se activa (morado para
 * "No molestar", naranja para el modo avión) y queda gris al desactivarse.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {MODOS} from '../../constantes.js';
import {icono, ICONOS} from '../iconos.js';
import {aparecerConRebote, deslizarEntrada} from '../animaciones.js';

/** Texto, icono y clase CSS de cada modo. */
const PRESENTACION = Object.freeze({
    [MODOS.NO_MOLESTAR]: {titulo: 'No molestar', icono: ICONOS.LUNA, clase: 'no-molestar'},
    [MODOS.AVION]: {titulo: 'Modo avión', icono: ICONOS.AVION, clase: 'avion'},
});

export const AlertaModo = GObject.registerClass(
class AlertaModo extends St.BoxLayout {
    _init() {
        super._init({style_class: 'isla-alerta isla-alerta-modo'});

        this._icono = new St.Icon({style_class: 'isla-modo-icono'});
        this._cajaIcono = new St.Bin({
            style_class: 'isla-modo-icono-caja',
            y_align: Clutter.ActorAlign.CENTER,
            child: this._icono,
        });

        this._textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._titulo = new St.Label({style_class: 'isla-alerta-titulo'});
        this._estado = new St.Label({style_class: 'isla-modo-estado'});
        this._textos.add_child(this._titulo);
        this._textos.add_child(this._estado);

        this.add_child(this._cajaIcono);
        this.add_child(this._textos);
        this._claseActual = null;
    }

    /** @param {object} datos - {modo, activo} */
    actualizar({modo, activo}) {
        const presentacion = PRESENTACION[modo] ?? PRESENTACION[MODOS.NO_MOLESTAR];
        this._icono.gicon = icono(presentacion.icono);
        this._titulo.text = presentacion.titulo;
        this._estado.text = activo ? 'Activado' : 'Desactivado';

        if (this._claseActual)
            this.remove_style_class_name(this._claseActual);
        this._claseActual = presentacion.clase;
        this.add_style_class_name(this._claseActual);
        if (activo)
            this.add_style_class_name('activo');
        else
            this.remove_style_class_name('activo');
    }

    /** El icono salta y el texto entra deslizándose. */
    animarEntrada() {
        aparecerConRebote(this._cajaIcono, {retraso: 60, escalaInicial: 0.3});
        deslizarEntrada(this._textos, {retraso: 100});
    }

    /** Se cambió otra vez el modo con la alerta visible: el icono vuelve a saltar. */
    animarActualizacion() {
        aparecerConRebote(this._cajaIcono, {escalaInicial: 0.6});
    }
});

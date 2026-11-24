// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * AlertaGrabacion — terminó una grabación de pantalla.
 *
 *   [grabar]  Grabación de pantalla guardada
 *             1:23 · toca para verla
 *
 * El título es el que da GNOME: si la grabación falló ("terminó inesperadamente",
 * "sin espacio en disco"), la isla lo dice tal cual.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {icono, ICONOS} from '../iconos.js';
import {aparecerConRebote, deslizarEntrada} from '../animaciones.js';
import {formatearTranscurrido} from '../formato.js';

/** Por debajo de esto no se muestra la duración (la grabación no llegó a empezar). */
const DURACION_MINIMA_MS = 1000;

export const AlertaGrabacion = GObject.registerClass(
class AlertaGrabacion extends St.BoxLayout {
    _init() {
        super._init({style_class: 'isla-alerta isla-alerta-grabacion'});

        this._cajaIcono = new St.Bin({
            style_class: 'isla-grabacion-alerta-caja',
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({gicon: icono(ICONOS.GRABAR), style_class: 'isla-grabacion-alerta-icono'}),
        });

        this._textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._titulo = new St.Label({style_class: 'isla-alerta-titulo'});
        this._detalle = new St.Label({style_class: 'isla-grabacion-alerta-detalle'});
        this._textos.add_child(this._titulo);
        this._textos.add_child(this._detalle);

        this.add_child(this._cajaIcono);
        this.add_child(this._textos);
    }

    /** @param {object} datos - {titulo, detalle, duracionMs, activar} */
    actualizar({titulo, detalle, duracionMs}) {
        this._titulo.text = titulo || 'Grabación de pantalla';
        this._detalle.text = duracionMs >= DURACION_MINIMA_MS
            ? `${formatearTranscurrido(duracionMs)} · toca para verla`
            : detalle ?? '';
        this._detalle.visible = Boolean(this._detalle.text);
    }

    animarEntrada() {
        aparecerConRebote(this._cajaIcono, {retraso: 60, escalaInicial: 0.4});
        deslizarEntrada(this._textos, {retraso: 100});
    }

    animarActualizacion() {
        aparecerConRebote(this._cajaIcono, {escalaInicial: 0.7});
    }
});

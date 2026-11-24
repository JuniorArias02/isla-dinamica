// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * AlertaCaptura — se hizo una captura de pantalla.
 *
 *   [miniatura]  Captura de pantalla
 *                Copiada al portapapeles · toca para abrirla
 *
 * La miniatura es la propia imagen que GNOME adjunta a su aviso (St.ImageContent).
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {icono, ICONOS} from '../iconos.js';
import {aparecerConRebote, deslizarEntrada} from '../animaciones.js';

/** Alto de la miniatura; el ancho sale de la proporción de la captura (con un máximo). */
const ALTO_MINIATURA_PX = 40;
const ANCHO_MAXIMO_MINIATURA_PX = 72;

/** @returns {boolean} true si el objeto se puede dibujar como imagen (Clutter.Content). */
function esContenidoDeImagen(objeto) {
    return Boolean(objeto) && GObject.type_is_a(objeto.constructor.$gtype, Clutter.Content.$gtype);
}

export const AlertaCaptura = GObject.registerClass(
class AlertaCaptura extends St.BoxLayout {
    _init() {
        super._init({style_class: 'isla-alerta isla-alerta-captura'});

        this._miniatura = new St.Bin({
            style_class: 'isla-captura-miniatura',
            height: ALTO_MINIATURA_PX,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._miniatura.content_gravity = Clutter.ContentGravity.RESIZE_ASPECT;
        // Sin imagen: icono de captura.
        this._iconoRespaldo = new St.Icon({gicon: icono(ICONOS.CAPTURA), style_class: 'isla-captura-respaldo'});

        this._textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._textos.add_child(new St.Label({text: 'Captura de pantalla', style_class: 'isla-alerta-titulo'}));
        this._textos.add_child(new St.Label({
            text: 'Copiada al portapapeles · toca para abrirla',
            style_class: 'isla-captura-detalle',
        }));

        this.add_child(this._miniatura);
        this.add_child(this._textos);
    }

    /** @param {object} datos - {miniatura (St.ImageContent o GIcon), activar} */
    actualizar({miniatura}) {
        if (esContenidoDeImagen(miniatura)) {
            this._miniatura.set_child(null);
            this._miniatura.set_content(miniatura);
            const [, ancho, alto] = miniatura.get_preferred_size();
            const proporcion = alto > 0 ? ancho / alto : 16 / 9;
            this._miniatura.width = Math.min(ANCHO_MAXIMO_MINIATURA_PX, Math.round(ALTO_MINIATURA_PX * proporcion));
            this._miniatura.remove_style_class_name('sin-imagen');
        } else {
            this._miniatura.set_content(null);
            this._miniatura.set_child(this._iconoRespaldo);
            this._miniatura.width = ALTO_MINIATURA_PX;
            this._miniatura.add_style_class_name('sin-imagen');
        }
    }

    /** La miniatura salta (como el flash de la captura) y el texto entra. */
    animarEntrada() {
        aparecerConRebote(this._miniatura, {retraso: 40, escalaInicial: 0.5});
        deslizarEntrada(this._textos, {retraso: 100});
    }

    animarActualizacion() {
        aparecerConRebote(this._miniatura, {escalaInicial: 0.7});
    }
});

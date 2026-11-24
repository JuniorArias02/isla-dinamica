// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Caratula — portada del álbum con esquinas redondeadas (o círculo).
 *
 * Usa la imagen como fondo CSS para que St la recorte con el border-radius.
 * Si no hay portada, muestra una nota musical sobre un degradado, o el icono
 * de la app si se le dio uno (audio de un chat: el logo de WhatsApp).
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {icono, ICONOS} from '../iconos.js';
import {animar} from '../movimiento.js';

export const Caratula = GObject.registerClass(
class Caratula extends St.Bin {
    /**
     * @param {object} opciones
     * @param {string} opciones.claseTamano - Clase CSS con el tamaño y la forma.
     */
    _init({claseTamano}) {
        super._init({
            style_class: `isla-caratula ${claseTamano}`,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._iconoRespaldo = new St.Icon({
            gicon: icono(ICONOS.NOTA),
            style_class: 'isla-caratula-respaldo',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        this.set_child(this._iconoRespaldo);

        this._url = undefined;
        this._cargando = false;
        this._iconoApp = null;
    }

    /**
     * Icono a mostrar en lugar de la nota cuando no hay portada (null = la nota).
     * @param {Gio.Icon|null} gicon - Icono a color de una app.
     */
    establecerIcono(gicon) {
        if (gicon === this._iconoApp)
            return;
        this._iconoApp = gicon;
        this._iconoRespaldo.gicon = gicon ?? icono(ICONOS.NOTA);
        if (gicon)
            this.add_style_class_name('con-icono-app');
        else
            this.remove_style_class_name('con-icono-app');
    }

    /**
     * Mientras carga la canción siguiente: hueco gris sin icono (esqueleto).
     * Al salir, la portada nueva entra con el fundido de establecer().
     * @param {boolean} cargando
     */
    establecerCargando(cargando) {
        if (cargando === this._cargando)
            return;
        this._cargando = cargando;
        if (cargando) {
            this.establecer(null);
            this.add_style_class_name('cargando');
            this._iconoRespaldo.hide();
        } else {
            this.remove_style_class_name('cargando');
            if (!this._url)
                this._iconoRespaldo.show();
        }
    }

    /**
     * Cambia la portada con un pequeño fundido.
     * @param {string|null} url - URL file:// de la imagen.
     */
    establecer(url) {
        if (url === this._url)
            return;
        const habiaPortada = this._url !== undefined;
        this._url = url;

        if (url) {
            this.style = `background-image: url("${url}");`;
            this.add_style_class_name('con-portada');
            this._iconoRespaldo.hide();
        } else {
            this.style = null;
            this.remove_style_class_name('con-portada');
            this._iconoRespaldo.show();
        }

        if (habiaPortada) {
            this.opacity = 0;
            animar(this, {opacity: 255, duration: 300, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        }
    }
});

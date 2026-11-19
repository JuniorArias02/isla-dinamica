/**
 * Caratula — portada del álbum con esquinas redondeadas (o círculo).
 *
 * Usa la imagen como fondo CSS para que St la recorte con el border-radius.
 * Si no hay portada, muestra una nota musical sobre un degradado.
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

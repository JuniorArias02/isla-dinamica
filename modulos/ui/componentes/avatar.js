// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Avatar — foto del contacto en círculo con la insignia de la app en la
 * esquina (como las notificaciones del iPhone).
 *
 *   Con foto:   [ foto circular ] + insignia pequeña de la app (WhatsApp, Telegram...)
 *   Sin foto:   icono de la app en grande, sin insignia.
 *   Sin nada:   campana sobre fondo naranja.
 *
 * Si la foto es un archivo, se usa como fondo CSS para que St la recorte en
 * círculo. Si llega como imagen en memoria, se muestra como icono.
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {icono, ICONOS} from '../iconos.js';

export const Avatar = GObject.registerClass(
class Avatar extends St.Widget {
    /**
     * @param {object} opciones
     * @param {number} opciones.tamano - Diámetro en píxeles.
     * @param {number} opciones.tamanoInsignia - Diámetro de la insignia.
     */
    _init({tamano, tamanoInsignia}) {
        // Sin layout manager: posiciones fijas (la insignia va en la esquina inferior derecha).
        super._init({
            style_class: 'isla-avatar',
            width: tamano,
            height: tamano,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._foto = new St.Bin({
            style_class: 'isla-avatar-foto',
            x: 0,
            y: 0,
            width: tamano,
            height: tamano,
        });
        this._iconoFoto = new St.Icon({
            icon_size: Math.round(tamano * 0.92),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._foto.set_child(this._iconoFoto);

        // La insignia sobresale un poco del círculo, como en iOS.
        const posicionInsignia = tamano - tamanoInsignia + 3;
        this._insignia = new St.Bin({
            style_class: 'isla-avatar-insignia',
            x: posicionInsignia,
            y: posicionInsignia,
            width: tamanoInsignia,
            height: tamanoInsignia,
            visible: false,
        });
        this._iconoInsignia = new St.Icon({
            icon_size: tamanoInsignia - 4,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._insignia.set_child(this._iconoInsignia);

        this.add_child(this._foto);
        this.add_child(this._insignia);
        this._tamano = tamano;
    }

    /**
     * @param {object} datos
     * @param {Gio.Icon|null} datos.imagen - Foto del contacto (o imagen de la notificación).
     * @param {Gio.Icon|null} datos.iconoApp - Icono de la app emisora.
     */
    establecer({imagen, iconoApp}) {
        const principal = imagen ?? iconoApp;
        this._foto.remove_style_class_name('con-foto');
        this._foto.remove_style_class_name('generico');
        this._foto.style = null;

        if (imagen instanceof Gio.FileIcon) {
            // Foto en archivo: fondo CSS recortado en círculo.
            this._foto.style = `background-image: url("${imagen.get_file().get_uri()}");`;
            this._foto.add_style_class_name('con-foto');
            this._iconoFoto.hide();
        } else if (principal) {
            this._iconoFoto.gicon = principal;
            this._iconoFoto.icon_size = Math.round(this._tamano * (imagen ? 1 : 0.92));
            this._iconoFoto.show();
        } else {
            this._iconoFoto.gicon = icono(ICONOS.CAMPANA);
            this._iconoFoto.icon_size = Math.round(this._tamano * 0.5);
            this._foto.add_style_class_name('generico');
            this._iconoFoto.show();
        }

        // La insignia solo tiene sentido si la foto es del contacto (no de la app).
        this._insignia.visible = Boolean(imagen && iconoApp);
        if (this._insignia.visible)
            this._iconoInsignia.gicon = iconoApp;
    }
});

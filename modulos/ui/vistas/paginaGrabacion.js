// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * PaginaGrabacion — la grabación de pantalla en curso.
 *
 *   ● Grabando la pantalla
 *     1:42                                   (⏹)
 *     Ctrl + Alt + Mayús + R también la detiene
 *
 * Solo existe mientras se graba (la primera página de la isla). El punto rojo
 * late únicamente mientras la página está a la vista.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {protegido} from '../../registro.js';
import {icono, ICONOS} from '../iconos.js';
import {agregarEfectoPulsacion, latir, detenerLatido} from '../animaciones.js';
import {formatearTranscurrido} from '../formato.js';

export const PaginaGrabacion = GObject.registerClass(
class PaginaGrabacion extends St.BoxLayout {
    /**
     * @param {object} opciones
     * @param {Function} opciones.alDetener - Detiene la grabación.
     */
    _init({alDetener}) {
        super._init({style_class: 'isla-pagina isla-pagina-grabacion'});
        this._activa = false;
        this._latiendo = false;

        const textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const encabezado = new St.BoxLayout({style_class: 'isla-grabacion-encabezado'});
        this._punto = new St.Widget({style_class: 'isla-grabacion-punto', y_align: Clutter.ActorAlign.CENTER});
        encabezado.add_child(this._punto);
        encabezado.add_child(new St.Label({
            text: 'Grabando la pantalla',
            style_class: 'isla-grabacion-titulo',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        this._tiempo = new St.Label({style_class: 'isla-grabacion-tiempo'});
        const pista = new St.Label({
            text: 'Ctrl + Alt + Mayús + R también la detiene',
            style_class: 'isla-grabacion-pista',
        });

        textos.add_child(encabezado);
        textos.add_child(this._tiempo);
        textos.add_child(pista);

        this._botonDetener = new St.Button({
            style_class: 'isla-grabacion-detener',
            child: new St.Icon({gicon: icono(ICONOS.DETENER), style_class: 'isla-grabacion-detener-icono'}),
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
            accessible_name: 'Detener la grabación',
        });
        this._botonDetener.connect('clicked', protegido('grabación: detener desde la isla', () => alDetener()));
        agregarEfectoPulsacion(this._botonDetener);

        this.add_child(textos);
        this.add_child(this._botonDetener);

        this.connect('destroy', () => this._sincronizarLatido(false));
    }

    /**
     * @param {{grabando: boolean, transcurridoMs: number}|null} grabacion
     */
    actualizar(grabacion) {
        this._tiempo.text = formatearTranscurrido(grabacion?.transcurridoMs ?? 0);
        this._sincronizarLatido(this._activa && Boolean(grabacion?.grabando));
    }

    /**
     * La página está (o deja de estar) a la vista.
     * @param {boolean} activa
     */
    establecerActiva(activa) {
        this._activa = activa;
        this._sincronizarLatido(activa);
    }

    _sincronizarLatido(debeLatir) {
        if (debeLatir === this._latiendo)
            return;
        this._latiendo = debeLatir;
        if (debeLatir)
            latir(this._punto);
        else
            detenerLatido(this._punto);
    }
});

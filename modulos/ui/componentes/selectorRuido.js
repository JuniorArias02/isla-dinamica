/**
 * SelectorRuido — tres botones para el modo de ruido de los AirPods:
 * Cancelación · Normal · Transparencia. El activo se resalta.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {MODOS_RUIDO} from '../../constantes.js';
import {protegido} from '../../registro.js';
import {icono, ICONOS} from '../iconos.js';
import {agregarEfectoPulsacion} from '../animaciones.js';

const OPCIONES = Object.freeze([
    {modo: MODOS_RUIDO.CANCELACION, icono: ICONOS.RUIDO_CANCELACION, texto: 'Cancelación'},
    {modo: MODOS_RUIDO.APAGADO, icono: ICONOS.RUIDO_APAGADO, texto: 'Normal'},
    {modo: MODOS_RUIDO.TRANSPARENCIA, icono: ICONOS.RUIDO_TRANSPARENCIA, texto: 'Transparencia'},
]);

export const SelectorRuido = GObject.registerClass(
class SelectorRuido extends St.BoxLayout {
    /**
     * @param {Function} alSeleccionar - Recibe el modo elegido (uno de MODOS_RUIDO).
     */
    _init(alSeleccionar) {
        super._init({style_class: 'isla-selector-ruido', x_expand: true});

        this._botones = OPCIONES.map(opcion => {
            const contenido = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                x_align: Clutter.ActorAlign.CENTER,
            });
            contenido.add_child(new St.Icon({
                gicon: icono(opcion.icono),
                style_class: 'isla-selector-ruido-icono',
                x_align: Clutter.ActorAlign.CENTER,
            }));
            contenido.add_child(new St.Label({
                text: opcion.texto,
                style_class: 'isla-selector-ruido-texto',
                x_align: Clutter.ActorAlign.CENTER,
            }));

            const boton = new St.Button({
                style_class: 'isla-selector-ruido-boton',
                child: contenido,
                x_expand: true,
                can_focus: true,
            });
            boton.connect('clicked', protegido(`modo de ruido ${opcion.texto}`, () => {
                this.establecerModo(opcion.modo);
                alSeleccionar(opcion.modo);
            }));
            agregarEfectoPulsacion(boton);
            this.add_child(boton);
            return {modo: opcion.modo, boton};
        });
    }

    /**
     * Resalta el modo activo.
     * @param {number|null} modo - null si aún no se sabe.
     */
    establecerModo(modo) {
        for (const {modo: modoBoton, boton} of this._botones) {
            if (modoBoton === modo)
                boton.add_style_class_name('activo');
            else
                boton.remove_style_class_name('activo');
        }
    }
});

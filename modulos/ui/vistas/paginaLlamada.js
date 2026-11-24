// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * PaginaLlamada — la llamada o videollamada en curso.
 *
 *   (tel) Google Meet
 *         12:34                              (mic)  (tel)
 *         En llamada · micrófono silenciado
 *
 *   (mic) silencia o reactiva el micrófono; (tel) lleva a la ventana de la llamada.
 *
 * Solo existe mientras hay una llamada (la primera página de la isla). Colgar se
 * hace en la app: la isla no puede colgar una llamada de una web.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {protegido} from '../../registro.js';
import {icono, ICONOS} from '../iconos.js';
import {agregarEfectoPulsacion} from '../animaciones.js';
import {formatearTranscurrido} from '../formato.js';

export const PaginaLlamada = GObject.registerClass(
class PaginaLlamada extends St.BoxLayout {
    /**
     * @param {object} opciones
     * @param {Function} opciones.alMostrar - Lleva a la ventana de la llamada.
     * @param {Function} opciones.alAlternarSilencio - Silencia o reactiva el micrófono.
     */
    _init({alMostrar, alAlternarSilencio}) {
        super._init({style_class: 'isla-pagina isla-pagina-llamada'});

        const textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const encabezado = new St.BoxLayout({style_class: 'isla-llamada-encabezado'});
        encabezado.add_child(new St.Icon({
            gicon: icono(ICONOS.TELEFONO),
            style_class: 'isla-llamada-encabezado-icono',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this._nombre = new St.Label({style_class: 'isla-llamada-nombre', y_align: Clutter.ActorAlign.CENTER});
        encabezado.add_child(this._nombre);

        this._tiempo = new St.Label({style_class: 'isla-llamada-tiempo'});
        this._estado = new St.Label({style_class: 'isla-llamada-estado'});

        textos.add_child(encabezado);
        textos.add_child(this._tiempo);
        textos.add_child(this._estado);

        this._botonSilencio = this._crearBoton(ICONOS.MICROFONO, 'isla-llamada-boton-silencio',
            'Silenciar el micrófono', alAlternarSilencio);
        this._botonMostrar = this._crearBoton(ICONOS.TELEFONO, 'isla-llamada-boton-mostrar',
            'Ir a la llamada', alMostrar);

        const botones = new St.BoxLayout({style_class: 'isla-llamada-botones', y_align: Clutter.ActorAlign.CENTER});
        botones.add_child(this._botonSilencio);
        botones.add_child(this._botonMostrar);

        this.add_child(textos);
        this.add_child(botones);
    }

    _crearBoton(nombreIcono, clase, nombreAccesible, alPulsar) {
        const boton = new St.Button({
            style_class: `isla-llamada-boton ${clase}`,
            child: new St.Icon({gicon: icono(nombreIcono), style_class: 'isla-llamada-boton-icono'}),
            can_focus: true,
            accessible_name: nombreAccesible,
        });
        boton.connect('clicked', protegido(`llamada: ${nombreAccesible.toLowerCase()}`, () => alPulsar()));
        agregarEfectoPulsacion(boton);
        return boton;
    }

    /**
     * @param {{enLlamada: boolean, nombre: string, transcurridoMs: number, silenciado: boolean}|null} llamada
     */
    actualizar(llamada) {
        this._nombre.text = llamada?.nombre || 'Llamada';
        this._tiempo.text = formatearTranscurrido(llamada?.transcurridoMs ?? 0);
        const silenciado = Boolean(llamada?.silenciado);
        this._estado.text = silenciado ? 'En llamada · micrófono silenciado' : 'En llamada';
        this._botonSilencio.child.gicon = icono(silenciado ? ICONOS.MICROFONO_SILENCIADO : ICONOS.MICROFONO);
        this._botonSilencio.accessible_name = silenciado ? 'Activar el micrófono' : 'Silenciar el micrófono';
        if (silenciado)
            this._botonSilencio.add_style_class_name('activo');
        else
            this._botonSilencio.remove_style_class_name('activo');
    }
});

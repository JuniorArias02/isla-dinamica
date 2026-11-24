// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * AlertaLlamada — está sonando una llamada.
 *
 *   [foto + insignia]  Juan Pérez                     (colgar)  (teléfono)
 *                      WhatsApp · Llamada de voz
 *
 * Botón verde: contesta con el botón del propio aviso si la app lo ofrece; si no,
 * abre la app (ahí se contesta). Botón rojo: rechaza con el botón del aviso si
 * existe; si no, solo quita la alerta (la llamada sigue sonando en la app).
 * Tocar el resto de la alerta abre la app.
 *
 * Mientras se ve, el teléfono del botón verde late. Los botones llevan la clase
 * `isla-captura-clic`: el clic en ellos no cuenta como toque en la alerta.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {protegido} from '../../registro.js';
import {aparecerConRebote, deslizarEntrada, agregarEfectoPulsacion, latir, detenerLatido} from '../animaciones.js';
import {Avatar} from '../componentes/avatar.js';
import {icono, ICONOS} from '../iconos.js';

export const AlertaLlamada = GObject.registerClass(
class AlertaLlamada extends St.BoxLayout {
    /**
     * @param {object} opciones
     * @param {Function} opciones.alContestar - Recibe los datos de la alerta.
     * @param {Function} opciones.alRechazar - Recibe los datos de la alerta.
     */
    _init({alContestar, alRechazar}) {
        super._init({style_class: 'isla-alerta isla-alerta-llamada'});
        this._datos = null;
        this._latiendo = false;

        this._avatar = new Avatar({tamano: 44, tamanoInsignia: 18});

        this._textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._titulo = new St.Label({style_class: 'isla-alerta-titulo'});
        this._detalle = new St.Label({style_class: 'isla-llamada-alerta-detalle'});
        this._textos.add_child(this._titulo);
        this._textos.add_child(this._detalle);

        this._botonRechazar = this._crearBoton(ICONOS.COLGAR, 'isla-llamada-rechazar', 'Rechazar',
            () => alRechazar(this._datos));
        this._botonContestar = this._crearBoton(ICONOS.TELEFONO, 'isla-llamada-contestar', 'Contestar',
            () => alContestar(this._datos));

        const botones = new St.BoxLayout({style_class: 'isla-llamada-alerta-botones', y_align: Clutter.ActorAlign.CENTER});
        botones.add_child(this._botonRechazar);
        botones.add_child(this._botonContestar);

        this.add_child(this._avatar);
        this.add_child(this._textos);
        this.add_child(botones);

        // El botón verde late solo mientras la alerta está a la vista.
        this.connect('notify::mapped', () => this._sincronizarLatido(this.mapped));
        this.connect('destroy', () => this._sincronizarLatido(false));
    }

    _crearBoton(nombreIcono, clase, nombreAccesible, alPulsar) {
        const boton = new St.Button({
            style_class: `isla-llamada-alerta-boton isla-captura-clic ${clase}`,
            child: new St.Icon({gicon: icono(nombreIcono), style_class: 'isla-llamada-alerta-boton-icono'}),
            can_focus: true,
            accessible_name: nombreAccesible,
        });
        boton.connect('clicked', protegido(`llamada: ${nombreAccesible.toLowerCase()}`, () => alPulsar()));
        agregarEfectoPulsacion(boton);
        return boton;
    }

    /**
     * @param {object} datos - Datos de la notificación (con `llamada`).
     */
    actualizar(datos) {
        this._datos = datos;
        const {llamada, aplicacion} = datos;
        this._titulo.text = datos.titulo || 'Llamada';
        const tipo = llamada?.esVideo ? 'Videollamada' : 'Llamada';
        this._detalle.text = aplicacion?.nombre ? `${aplicacion.nombre} · ${tipo}` : tipo;
        // Sin botón de rechazar en el aviso: el rojo solo quita la alerta.
        this._botonRechazar.accessible_name = llamada?.rechazar ? 'Rechazar' : 'Quitar el aviso';
        this._botonContestar.accessible_name = llamada?.contestar ? 'Contestar' : `Abrir ${aplicacion?.nombre ?? 'la app'}`;
        this._botonContestar.child.gicon = icono(llamada?.esVideo ? ICONOS.CAMARA : ICONOS.TELEFONO);
        this._avatar.establecer({imagen: datos.imagen ?? null, iconoApp: datos.iconoApp ?? null});
    }

    animarEntrada() {
        aparecerConRebote(this._avatar, {retraso: 60, escalaInicial: 0.4});
        deslizarEntrada(this._textos, {retraso: 100});
        aparecerConRebote(this._botonRechazar, {retraso: 140, escalaInicial: 0.3});
        aparecerConRebote(this._botonContestar, {retraso: 180, escalaInicial: 0.3});
    }

    animarActualizacion() {
        aparecerConRebote(this._avatar, {escalaInicial: 0.7});
    }

    _sincronizarLatido(debeLatir) {
        if (debeLatir === this._latiendo)
            return;
        this._latiendo = debeLatir;
        // Late el icono (el botón usa su propia opacidad al aparecer con rebote).
        if (debeLatir)
            latir(this._botonContestar.child);
        else
            detenerLatido(this._botonContestar.child);
    }
});

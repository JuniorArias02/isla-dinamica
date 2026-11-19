// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * AlertaNotificacion — contenido de la tarjeta al llegar una notificación.
 *
 *   [foto + insignia]  Juan Pérez               WhatsApp · ahora
 *                      3 mensajes nuevos
 *                      Hola!                                  (anteriores, más tenues)
 *                      ¿Viste lo de la isla?
 *                      Quedó brutal la animación 🔥          (el último)
 *
 * Con un solo mensaje se muestra en hasta 2 líneas.
 *
 * Si llegan más mensajes del mismo chat, la alerta se actualiza con un
 * pequeño rebote en lugar de aparecer otra (animarActualizacion).
 * En modo privado no se muestra el texto del mensaje.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {MENSAJES_EN_ALERTA} from '../../constantes.js';
import {ajuste, AJUSTES} from '../../ajustes.js';
import {aparecerConRebote, deslizarEntrada} from '../animaciones.js';
import {formatearHace, textoMensajesNuevos} from '../formato.js';
import {Avatar} from '../componentes/avatar.js';
import {icono, ICONOS} from '../iconos.js';

/**
 * Texto a mostrar respetando el modo privado.
 * @param {object} datos - Datos de la notificación (con `cantidad`).
 * @returns {string}
 */
export function textoVisible(datos) {
    if (!ajuste(AJUSTES.NOTIFICACIONES_PRIVADAS))
        return datos.detalle || '';
    if (datos.aplicacion?.esChat)
        return datos.cantidad > 1 ? textoMensajesNuevos(datos.cantidad) : 'Nuevo mensaje';
    return 'Nueva notificación';
}

export const AlertaNotificacion = GObject.registerClass(
class AlertaNotificacion extends St.BoxLayout {
    _init() {
        super._init({style_class: 'isla-alerta isla-alerta-notificacion'});

        this._avatar = new Avatar({tamano: 44, tamanoInsignia: 18});

        this._textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        const cabecera = new St.BoxLayout({style_class: 'isla-alerta-cabecera'});
        this._titulo = new St.Label({style_class: 'isla-alerta-titulo', x_expand: true});
        this._meta = new St.Label({style_class: 'isla-alerta-hora', y_align: Clutter.ActorAlign.CENTER});
        // Luna: la notificación llegó con "No molestar" (la isla avisa en silencio).
        this._luna = new St.Icon({
            gicon: icono(ICONOS.LUNA),
            style_class: 'isla-alerta-luna',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        cabecera.add_child(this._titulo);
        cabecera.add_child(this._luna);
        cabecera.add_child(this._meta);

        this._contador = new St.Label({style_class: 'isla-alerta-contador'});

        this._cuerpo = new St.Label({style_class: 'isla-alerta-cuerpo'});
        const texto = this._cuerpo.clutter_text;
        texto.line_wrap = true;
        texto.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        texto.ellipsize = Pango.EllipsizeMode.END;

        // Varios mensajes del mismo chat: una línea por mensaje.
        this._lineas = new St.BoxLayout({
            style_class: 'isla-alerta-lineas',
            orientation: Clutter.Orientation.VERTICAL,
        });
        this._etiquetasLineas = Array.from({length: MENSAJES_EN_ALERTA}, () => {
            const etiqueta = new St.Label({style_class: 'isla-alerta-linea'});
            this._lineas.add_child(etiqueta);
            return etiqueta;
        });

        this._textos.add_child(cabecera);
        this._textos.add_child(this._contador);
        this._textos.add_child(this._cuerpo);
        this._textos.add_child(this._lineas);

        this.add_child(this._avatar);
        this.add_child(this._textos);
    }

    /**
     * @param {object} datos - {titulo, detalle, aplicacion, imagen, iconoApp, marcaTiempoMs, cantidad}
     */
    actualizar(datos) {
        this._titulo.text = datos.titulo;

        const nombreApp = datos.aplicacion?.nombre ?? '';
        const hace = formatearHace(datos.marcaTiempoMs ?? Date.now());
        this._meta.text = nombreApp ? `${nombreApp} · ${hace}` : hace;
        this._luna.visible = Boolean(datos.silenciosa);

        // "3 mensajes nuevos" (en modo privado ya va en el cuerpo).
        const privado = ajuste(AJUSTES.NOTIFICACIONES_PRIVADAS);
        const varios = datos.aplicacion?.esChat && datos.cantidad > 1 && !privado;
        this._contador.text = varios ? textoMensajesNuevos(datos.cantidad) : '';
        this._contador.visible = varios;

        // Varios mensajes (y no es modo privado): uno por línea; el último resaltado.
        const mensajes = privado ? [] : (datos.mensajes ?? []);
        const variasLineas = mensajes.length > 1;
        this._lineas.visible = variasLineas;
        this._etiquetasLineas.forEach((etiqueta, indice) => {
            const texto = mensajes[indice];
            etiqueta.visible = variasLineas && Boolean(texto);
            etiqueta.text = texto ?? '';
            if (indice === mensajes.length - 1)
                etiqueta.add_style_class_name('ultima');
            else
                etiqueta.remove_style_class_name('ultima');
        });

        this._cuerpo.text = textoVisible(datos);
        this._cuerpo.visible = !variasLineas && Boolean(this._cuerpo.text);

        this._avatar.establecer({imagen: datos.imagen ?? null, iconoApp: datos.iconoApp ?? null});
    }

    /** Animación de entrada: la foto salta y el texto se desliza. */
    animarEntrada() {
        aparecerConRebote(this._avatar, {retraso: 60});
        deslizarEntrada(this._textos, {retraso: 120});
    }

    /** Llegó otro mensaje del mismo chat: pequeño rebote y el texto nuevo entra. */
    animarActualizacion() {
        aparecerConRebote(this._avatar, {escalaInicial: 0.82});
        // El mensaje nuevo (última línea visible, o el cuerpo) entra deslizándose.
        const ultima = this._etiquetasLineas.filter(e => e.visible).pop();
        deslizarEntrada(ultima ?? this._cuerpo, {desde: 10});
    }
});

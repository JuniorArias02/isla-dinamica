// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * AlertaPortapapeles — "Copiado ✓" breve al copiar algo.
 *
 *   [✓]  Copiado
 *        Texto · desde Brave
 *
 * Nunca muestra el contenido copiado (podría ser una contraseña).
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {TIPOS_COPIA} from '../../constantes.js';
import {icono, ICONOS} from '../iconos.js';
import {aparecerConRebote, deslizarEntrada} from '../animaciones.js';

const NOMBRES_TIPO = Object.freeze({
    [TIPOS_COPIA.TEXTO]: 'Texto',
    [TIPOS_COPIA.IMAGEN]: 'Imagen',
    [TIPOS_COPIA.ARCHIVOS]: 'Archivos',
    [TIPOS_COPIA.OTRO]: 'Contenido',
});

export const AlertaPortapapeles = GObject.registerClass(
class AlertaPortapapeles extends St.BoxLayout {
    _init() {
        super._init({style_class: 'isla-alerta isla-alerta-portapapeles'});

        this._cajaIcono = new St.Bin({
            style_class: 'isla-portapapeles-icono-caja',
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({gicon: icono(ICONOS.CHECK), style_class: 'isla-portapapeles-icono'}),
        });

        this._textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._textos.add_child(new St.Label({text: 'Copiado', style_class: 'isla-alerta-titulo'}));
        this._detalle = new St.Label({style_class: 'isla-portapapeles-detalle'});
        this._textos.add_child(this._detalle);

        this.add_child(this._cajaIcono);
        this.add_child(this._textos);
    }

    /** @param {object} datos - {tipo, aplicacion} */
    actualizar(datos) {
        const tipo = NOMBRES_TIPO[datos.tipo] ?? NOMBRES_TIPO[TIPOS_COPIA.OTRO];
        this._detalle.text = datos.aplicacion ? `${tipo} · desde ${datos.aplicacion}` : tipo;
    }

    /** El check "salta" con rebote, como una confirmación. */
    animarEntrada() {
        aparecerConRebote(this._cajaIcono, {retraso: 60, escalaInicial: 0.2});
        deslizarEntrada(this._textos, {retraso: 100});
    }

    /** Otra copia seguida: el check vuelve a saltar. */
    animarActualizacion() {
        aparecerConRebote(this._cajaIcono, {escalaInicial: 0.5});
    }
});

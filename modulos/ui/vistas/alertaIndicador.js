/**
 * AlertaIndicador — volumen / brillo en la isla (reemplaza el recuadro de GNOME).
 *
 *   [🔊]  ━━━━━━━━━━━━━━━━──────────  65
 *
 * La barra se desliza suave a cada pulsación de tecla. Con el volumen
 * amplificado (por encima de 100 %), la parte extra se pinta en naranja.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {TIPOS_INDICADOR} from '../../constantes.js';
import {aparecerConRebote} from '../animaciones.js';
import {animar} from '../movimiento.js';

/** Duración del deslizamiento de la barra entre pulsaciones. */
const DURACION_BARRA_MS = 140;

export const AlertaIndicador = GObject.registerClass(
class AlertaIndicador extends St.BoxLayout {
    _init() {
        super._init({style_class: 'isla-alerta isla-alerta-indicador'});

        this._icono = new St.Icon({style_class: 'isla-indicador-osd-icono', y_align: Clutter.ActorAlign.CENTER});

        this._barra = new St.Widget({
            style_class: 'isla-indicador-osd-barra',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._relleno = new St.Widget({style_class: 'isla-indicador-osd-relleno'});
        this._barra.add_child(this._relleno);
        this._barra.connect('notify::width', () => this._dibujar(false));

        this._porcentaje = new St.Label({style_class: 'isla-indicador-osd-porcentaje', y_align: Clutter.ActorAlign.CENTER});

        this.add_child(this._icono);
        this.add_child(this._barra);
        this.add_child(this._porcentaje);

        this._fraccion = 0;
    }

    /**
     * @param {object} datos - {tipo, gicon, nivel, maximo}
     */
    actualizar(datos) {
        this._icono.gicon = datos.gicon;
        this._fraccion = Math.min(1, Math.max(0, datos.nivel / datos.maximo));
        this._porcentaje.text = `${Math.round(datos.nivel * 100)}`;

        // Volumen por encima del 100 % (amplificado): relleno naranja de aviso.
        const amplificado = datos.tipo === TIPOS_INDICADOR.VOLUMEN && datos.nivel > 1;
        if (amplificado)
            this._relleno.add_style_class_name('amplificado');
        else
            this._relleno.remove_style_class_name('amplificado');

        this._dibujar(true);
    }

    animarEntrada() {
        aparecerConRebote(this._icono, {retraso: 40, escalaInicial: 0.6});
    }

    /** Otra pulsación de tecla: solo se desliza la barra (ya lo hizo actualizar). */
    animarActualizacion() {}

    _dibujar(conAnimacion) {
        if (!this._barra.has_allocation())
            return;
        const ancho = Math.round(this._barra.get_allocation_box().get_width() * this._fraccion);
        this._relleno.remove_transition('width');
        if (conAnimacion) {
            animar(this._relleno, {
                width: ancho,
                duration: DURACION_BARRA_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._relleno.width = ancho;
        }
    }
});

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * RuedaSelector — columna de números que gira como un cilindro (estilo iPhone).
 *
 *        58          ← más pequeño y apagado
 *        59
 *      [ 00 ]        ← valor elegido (en la banda central)
 *        01
 *        02
 *
 * - Circular: después del último valor vuelve el primero.
 * - Arrastrar con el ratón (con inercia), dos dedos en el touchpad o la rueda
 *   del ratón la hacen girar; clic en un número cercano la lleva a él. Al soltar,
 *   siempre se asienta en un número.
 * - La posición es una propiedad GObject (`posicion`, en filas) animada con
 *   animarPropiedad(): todo el movimiento lo hace el compositor.
 * - Solo existen 7 filas: al girar cambian su texto, desplazamiento, escala
 *   y opacidad (transformaciones: no piden recalcular tamaños).
 * - Lleva la clase `isla-captura-vertical`: el gesto de la isla para cerrarse
 *   arrastrando no se activa sobre ella (ver GestorInteraccion).
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
    ALTO_FILA_RUEDA_PX,
    ANGULO_FILA_RUEDA,
    ALTO_RUEDA_PX,
    ANCHO_RUEDA_PX,
    INERCIA_RUEDA_MS,
    FILAS_POR_UNIDAD_SCROLL,
    ESPERA_ASENTAR_RUEDA_MS,
    DURACION_ASENTAR_RUEDA_MS,
    DURACION_MAXIMA_GIRO_RUEDA_MS,
} from '../../constantes.js';
import {protegido} from '../../registro.js';
import {animarPropiedad} from '../movimiento.js';

/** Etiquetas en el cilindro: la central y 3 a cada lado. */
const ETIQUETAS = 7;
const MITAD = Math.floor(ETIQUETAS / 2);

/** Opacidad que se pierde por cada fila de distancia al centro (1 fila: 62 %, 2 filas: 24 %). */
const CAIDA_OPACIDAD = 0.38;

/** Radio del cilindro: cerca del centro, una fila mide ALTO_FILA_RUEDA_PX. */
const RADIO = ALTO_FILA_RUEDA_PX / ANGULO_FILA_RUEDA;

/** Resto siempre positivo (−1 mod 60 = 59). */
function modulo(valor, cantidad) {
    return ((valor % cantidad) + cantidad) % cantidad;
}

export const RuedaSelector = GObject.registerClass({
    Properties: {
        'posicion': GObject.ParamSpec.double(
            'posicion', null, null,
            GObject.ParamFlags.READWRITE,
            -1e6, 1e6, 0),
    },
}, class RuedaSelector extends St.Widget {
    /**
     * @param {object} opciones
     * @param {number} opciones.cantidad - Cantidad de valores (24 horas, 60 minutos...).
     * @param {number} [opciones.valor=0] - Valor inicial.
     * @param {Function} [opciones.alCambiar] - Recibe el valor cada vez que cambia el número central.
     */
    _init({cantidad, valor = 0, alCambiar = null}) {
        super._init({
            style_class: 'isla-rueda isla-captura-vertical',
            width: ANCHO_RUEDA_PX,
            height: ALTO_RUEDA_PX,
            reactive: true,
            clip_to_allocation: true,
        });

        this._cantidad = cantidad;
        this._alCambiar = alCambiar;
        this._posicion = valor;
        this._valor = valor;
        this._inicioArrastre = 0;
        this._idAsentar = 0;

        const centroY = (ALTO_RUEDA_PX - ALTO_FILA_RUEDA_PX) / 2;
        // Cada fila es una caja de tamaño fijo que centra su número; al girar solo se
        // transforma la caja (desplazamiento, escala, opacidad).
        this._filas = Array.from({length: ETIQUETAS}, () => {
            const etiqueta = new St.Label({
                style_class: 'isla-rueda-numero',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const fila = new St.Bin({
                child: etiqueta,
                width: ANCHO_RUEDA_PX,
                height: ALTO_FILA_RUEDA_PX,
                y: centroY,
            });
            fila.set_pivot_point(0.5, 0.5);
            this.add_child(fila);
            return {fila, etiqueta};
        });

        this._conectarGestos();
        this.connect('destroy', () => {
            this._cancelarAsentar();
            this.remove_all_transitions();
            this._alCambiar = null;
        });
        this._redibujar();
    }

    // ───────────────────────── Propiedad animable ─────────────────────────

    /** @returns {number} Posición continua, en filas (puede ser negativa o mayor que la cantidad). */
    get posicion() {
        return this._posicion;
    }

    set posicion(valor) {
        if (valor === this._posicion)
            return;
        this._posicion = valor;
        this.notify('posicion');
        this._redibujar();
    }

    // ───────────────────────── API ─────────────────────────

    /** @returns {number} Valor elegido (0 … cantidad − 1). */
    get valor() {
        return this._valor;
    }

    /**
     * Gira hasta un valor por el camino más corto.
     * @param {number} valor
     * @param {boolean} [conAnimacion=true]
     */
    establecerValor(valor, conAnimacion = true) {
        const actual = Math.round(this._posicion);
        let diferencia = modulo(valor - actual, this._cantidad);
        if (diferencia > this._cantidad / 2)
            diferencia -= this._cantidad;
        this._irA(actual + diferencia, conAnimacion);
    }

    // ───────────────────────── Dibujo ─────────────────────────

    /** Coloca las 7 etiquetas sobre el cilindro según la posición actual. */
    _redibujar() {
        const base = Math.round(this._posicion);
        this._filas.forEach(({fila, etiqueta}, i) => {
            const indice = base + i - MITAD;
            const distancia = indice - this._posicion;
            const angulo = distancia * ANGULO_FILA_RUEDA;
            if (Math.abs(angulo) >= Math.PI / 2) {
                fila.opacity = 0;
                return;
            }
            const texto = String(modulo(indice, this._cantidad)).padStart(2, '0');
            if (etiqueta.text !== texto)
                etiqueta.text = texto;
            // Proyección de un cilindro visto de frente: sube con el seno y se aplasta con el coseno.
            fila.translation_y = RADIO * Math.sin(angulo);
            fila.scale_y = Math.cos(angulo);
            // Más lejos del centro, más tenue: la segunda fila apenas se insinúa.
            fila.opacity = Math.round(255 * Math.max(0, 1 - CAIDA_OPACIDAD * Math.abs(distancia)));
        });

        const valor = modulo(base, this._cantidad);
        if (valor !== this._valor) {
            this._valor = valor;
            this._alCambiar?.(valor);
        }
    }

    // ───────────────────────── Movimiento ─────────────────────────

    /**
     * Lleva la rueda a una fila exacta.
     * @param {number} destino - Fila (entera).
     * @param {boolean} conAnimacion
     * @param {number} [duracion]
     */
    _irA(destino, conAnimacion, duracion = DURACION_ASENTAR_RUEDA_MS) {
        this._cancelarAsentar();
        this.remove_transition('posicion');
        if (!conAnimacion) {
            this.posicion = destino;
            return;
        }
        animarPropiedad(this, 'posicion', destino, {
            duration: duracion,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }

    /** Se asienta en el número más cercano. */
    _asentar() {
        this._irA(Math.round(this._posicion), true);
    }

    _cancelarAsentar() {
        if (this._idAsentar) {
            GLib.source_remove(this._idAsentar);
            this._idAsentar = 0;
        }
    }

    // ───────────────────────── Gestos ─────────────────────────

    _conectarGestos() {
        // Arrastrar con el ratón (o un dedo en pantalla táctil).
        this._gestoArrastre = new Clutter.PanGesture({pan_axis: Clutter.PanAxis.Y});
        // 'recognize': el arrastre superó el umbral y empieza (en GNOME 50 no hay 'pan-begin').
        this._gestoArrastre.connect('recognize', protegido('rueda: empezar arrastre', () => {
            this._cancelarAsentar();
            this.remove_transition('posicion');
            this._inicioArrastre = this._posicion;
        }));
        this._gestoArrastre.connect('pan-update', protegido('rueda: arrastrando', () => {
            const desplazamiento = this._gestoArrastre.get_accumulated_delta().get_y();
            this.posicion = this._inicioArrastre - desplazamiento / ALTO_FILA_RUEDA_PX;
        }));
        this._gestoArrastre.connect('end', protegido('rueda: soltar', () => this._alSoltar()));
        this._gestoArrastre.connect('cancel', protegido('rueda: arrastre cancelado', () => this._asentar()));
        this.add_action(this._gestoArrastre);

        // Clic en un número cercano: la rueda va a él.
        this._gestoClic = new Clutter.ClickGesture({required_button: Clutter.BUTTON_PRIMARY});
        this._gestoClic.connect('recognize', protegido('rueda: clic en un número', () => this._alHacerClic()));
        this.add_action(this._gestoClic);

        // Dos dedos (touchpad) o rueda del ratón.
        this.connect('scroll-event', protegido('rueda: desplazamiento',
            (_actor, evento) => this._alDesplazar(evento), Clutter.EVENT_PROPAGATE));
    }

    /** Al soltar, la rueda sigue un poco según la velocidad y se asienta. */
    _alSoltar() {
        const velocidad = this._gestoArrastre.get_velocity().get_y();
        const destino = Math.round(this._posicion - (velocidad * INERCIA_RUEDA_MS) / ALTO_FILA_RUEDA_PX);
        const filas = Math.abs(destino - this._posicion);
        const duracion = Math.min(DURACION_MAXIMA_GIRO_RUEDA_MS, DURACION_ASENTAR_RUEDA_MS + filas * 40);
        this._irA(destino, true, duracion);
    }

    _alHacerClic() {
        const evento = this._gestoClic.get_point_event(0);
        if (!evento)
            return;
        const [xPantalla, yPantalla] = evento.get_coords();
        const [convertido, , yLocal] = this.transform_stage_point(xPantalla, yPantalla);
        if (!convertido)
            return;
        const desdeElCentro = (yLocal - ALTO_RUEDA_PX / 2) / RADIO;
        const angulo = Math.asin(Math.max(-1, Math.min(1, desdeElCentro)));
        const filas = Math.round(angulo / ANGULO_FILA_RUEDA);
        if (filas !== 0)
            this._irA(Math.round(this._posicion) + filas, true);
    }

    /**
     * Desplazamiento vertical: mueve la rueda (y no llega a la isla, que se cerraría).
     * El horizontal sigue su camino (cambiar de página).
     */
    _alDesplazar(evento) {
        const direccion = evento.get_scroll_direction();
        if (direccion === Clutter.ScrollDirection.UP || direccion === Clutter.ScrollDirection.DOWN) {
            const paso = direccion === Clutter.ScrollDirection.DOWN ? 1 : -1;
            this._irA(Math.round(this._posicion) + paso, true);
            return Clutter.EVENT_STOP;
        }
        if (direccion !== Clutter.ScrollDirection.SMOOTH)
            return Clutter.EVENT_PROPAGATE;

        const [dx, dy] = evento.get_scroll_delta();
        if (Math.abs(dx) > Math.abs(dy))
            return Clutter.EVENT_PROPAGATE;

        this.remove_transition('posicion');
        this.posicion = this._posicion + dy * FILAS_POR_UNIDAD_SCROLL;

        // Al levantar los dedos (o tras una pausa) se asienta en el número más cercano.
        const terminado = (evento.get_scroll_finish_flags() & Clutter.ScrollFinishFlags.VERTICAL) !== 0;
        this._cancelarAsentar();
        if (terminado) {
            this._asentar();
        } else {
            this._idAsentar = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ESPERA_ASENTAR_RUEDA_MS, () => {
                this._idAsentar = 0;
                protegido('rueda: asentar tras desplazar', () => this._asentar())();
                return GLib.SOURCE_REMOVE;
            });
        }
        return Clutter.EVENT_STOP;
    }
});

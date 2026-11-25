// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Asomo — asomarse a la vista de al lado arrastrando la cápsula.
 *
 *   progreso 0      [ 10:42 p. m. ]  ( )
 *   progreso 0,4    [ 10:42 ]  [ ♪ Canc ]
 *   progreso 1      (10:42)  [ ♪ Canción ∿ ]
 *
 * Dos "ventanas" con forma de cápsula: la vista actual (A) se encoge hasta un
 * círculo y la de al lado (V) crece desde el círculo de la derecha (o desde nada)
 * hasta su ancho completo. Cada ventana recorta una cápsula de vista previa dibujada
 * a su ancho natural: al crecer, el contenido se va descubriendo, sin cortarse
 * con "…". En el círculo de la vista actual queda su contenido en pequeño: la
 * portada si es música (va a la izquierda, ya cabe), o la hora/cuenta atrás
 * centrada y reducida.
 *
 * Todo depende de `progreso`, que sigue al puntero mientras se arrastra:
 *   - el arrastre de ida y vuelta sin soltar deja todo como estaba;
 *   - confirmar() lo lleva a 1 y hace desaparecer el círculo de la vista anterior
 *     (propiedad `salida`); al terminar, BotonPanel vuelve a mostrar la cápsula real;
 *   - cancelar() lo devuelve a 0 con un resorte.
 *
 * Los anchos se calculan DENTRO de la asignación de tamaño (como BarraNivel), a
 * partir de las propiedades, para no pedir otro cálculo en medio del actual.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
    RESORTES,
    EXCESO_MAXIMO_ASOMO,
    OPACIDAD_ACTUAL_ASOMO,
    ESCALA_ACTUAL_ASOMO,
    DURACION_SALIDA_ASOMO_MS,
} from '../../constantes.js';
import {animarPropiedad, animarPropiedadConResorte} from '../movimiento.js';
import {Pildora} from './pildora.js';
import {Vidrio} from './vidrio.js';

/** Fases del asomo. */
export const FASES_ASOMO = Object.freeze({
    INACTIVO: 'inactivo',
    SIGUIENDO: 'siguiendo',
    CONFIRMANDO: 'confirmando',
    CANCELANDO: 'cancelando',
});

const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));
const mezclar = (desde, hasta, t) => desde + (hasta - desde) * t;

/**
 * Ventana con forma de cápsula que recorta una cápsula de vista previa.
 * La previa se dibuja siempre a su ancho natural (sin "…") y la ventana muestra
 * solo lo que cabe.
 */
const VentanaAsomo = GObject.registerClass(
class VentanaAsomo extends St.Widget {
    _init() {
        super._init({style_class: 'isla-asomo-ventana', layout_manager: new Clutter.BinLayout()});
        // Liquid Glass: vidrio de verdad debajo y el tinte (borde de luz, brillo) encima.
        this.vidrio = new Vidrio();
        this.vidrio.visible = false;
        this.add_child(this.vidrio);
        this.add_child(new St.Widget({style_class: 'isla-asomo-tinte', x_expand: true, y_expand: true}));
        // Sin gestor de distribución: la previa ocupa su tamaño natural desde la izquierda.
        const recorte = new St.Widget({clip_to_allocation: true, x_expand: true, y_expand: true});
        this.previa = new Pildora({previa: true});
        this.previa.set_pivot_point(0.5, 0.5);
        recorte.add_child(this.previa);
        this.add_child(recorte);
    }

    /** @returns {number} Ancho natural de la previa (sin el borde de la ventana). */
    get anchoPrevia() {
        return this.previa.get_preferred_width(-1)[1];
    }

    /** @returns {number} Ancho natural (la previa completa más el borde). */
    get anchoNatural() {
        return this.get_preferred_width(-1)[1];
    }
});

export const Asomo = GObject.registerClass({
    Properties: {
        'progreso': GObject.ParamSpec.double(
            'progreso', null, null,
            GObject.ParamFlags.READWRITE,
            -1, 2, 0),
        'salida': GObject.ParamSpec.double(
            'salida', null, null,
            GObject.ParamFlags.READWRITE,
            0, 1, 0),
    },
}, class Asomo extends St.Widget {
    _init() {
        super._init({
            style_class: 'isla-asomo',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._progreso = 0;
        this._salida = 0;
        this._fase = FASES_ASOMO.INACTIVO;
        this._inicio = {anchoActual: 0, anchoVecina: 0, espacio: 0, espacioInicial: 0};
        this._principal = null;
        this._objetivo = null;

        this._actual = new VentanaAsomo();
        this._vecina = new VentanaAsomo();
        this.add_child(this._actual);
        this.add_child(this._vecina);

        this.connect('destroy', () => this.remove_all_transitions());
    }

    /** @returns {string} Valor de FASES_ASOMO. */
    get fase() {
        return this._fase;
    }

    /** @returns {boolean} true si se está viendo (siguiendo, confirmando o cancelando). */
    get activo() {
        return this._fase !== FASES_ASOMO.INACTIVO;
    }

    /** @returns {string|null} La actividad a la que se asoma. */
    get objetivo() {
        return this._objetivo;
    }

    get progreso() {
        return this._progreso;
    }

    set progreso(valor) {
        const limitado = limitar(valor, -1, 1 + EXCESO_MAXIMO_ASOMO);
        if (limitado === this._progreso)
            return;
        this._progreso = limitado;
        this._aplicarContenido();
        this.notify('progreso');
        this.queue_relayout();
    }

    get salida() {
        return this._salida;
    }

    set salida(valor) {
        const limitado = limitar(valor, 0, 1);
        if (limitado === this._salida)
            return;
        this._salida = limitado;
        this._aplicarContenido();
        this.notify('salida');
        this.queue_relayout();
    }

    /** @returns {number} Ancho que tiene ahora la vista de al lado (para que la cápsula real siga desde ahí). */
    get anchoVecinaActual() {
        return this._anchos().vecina;
    }

    /**
     * Empieza a asomarse: la ventana actual copia la cápsula y la vecina el círculo.
     * @param {object} opciones
     * @param {object} opciones.datos - La parte de la vista que dibuja el panel.
     * @param {string} opciones.principal - Actividad que muestra la cápsula.
     * @param {string} opciones.objetivo - Actividad a la que se asoma.
     * @param {number} opciones.anchoActual - Ancho actual de la cápsula real.
     * @param {number} opciones.anchoVecina - Ancho del círculo de la derecha (0 si no hay).
     * @param {number} opciones.espacio - Separación entre cápsula y círculo.
     */
    preparar({datos, principal, objetivo, anchoActual, anchoVecina, espacio}) {
        this.remove_all_transitions();
        this._principal = principal;
        this._objetivo = objetivo;
        this._inicio = {
            anchoActual,
            anchoVecina,
            espacio,
            espacioInicial: anchoVecina > 0 ? espacio : 0,
        };
        this._fase = FASES_ASOMO.SIGUIENDO;
        this._progreso = 0;
        this._salida = 0;
        this._actual.opacity = 255;
        this.actualizarDatos(datos);
        this._aplicarContenido();
        this.queue_relayout();
        this.show();
    }

    /**
     * Llegaron datos nuevos (la cuenta atrás avanza, cambió la canción...).
     * Al confirmar ya no se tocan: el controlador ya pasó a la vista nueva.
     * @param {object} datos
     */
    actualizarDatos({pista, audio, reloj, temporizador, grabacion}) {
        if (this._fase !== FASES_ASOMO.SIGUIENDO)
            return;
        this._actual.previa.actualizar(pista, reloj, temporizador, this._principal, grabacion ?? null, null, audio ?? null);
        this._vecina.previa.actualizar(pista, reloj, temporizador, this._objetivo, grabacion ?? null, null, audio ?? null);
        this._aplicarContenido();
        this.queue_relayout();
    }

    /**
     * Soltó lo bastante lejos: la vista de al lado se queda.
     * @param {Function} alTerminar - Cuando el círculo de la vista anterior desapareció.
     */
    confirmar(alTerminar) {
        this._fase = FASES_ASOMO.CONFIRMANDO;
        this.remove_all_transitions();
        animarPropiedadConResorte(this, 'progreso', 1, {resorte: RESORTES.FLORECER});
        animarPropiedad(this, 'salida', 1, {
            duration: DURACION_SALIDA_ASOMO_MS,
            mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
            onComplete: alTerminar,
        });
    }

    /**
     * Soltó antes de tiempo (o se volvió): todo vuelve a su sitio.
     * @param {Function} alTerminar
     */
    cancelar(alTerminar) {
        this._fase = FASES_ASOMO.CANCELANDO;
        this.remove_all_transitions();
        animarPropiedadConResorte(this, 'progreso', 0, {resorte: RESORTES.CAPSULA, alTerminar});
    }

    /**
     * Liquid Glass: vidrio de verdad en las dos ventanas.
     * @param {boolean} activo
     */
    establecerCristal(activo) {
        this._actual.vidrio.visible = activo;
        this._vecina.vidrio.visible = activo;
    }

    /** Se esconde y deja las vistas previas en reposo (sin animaciones corriendo). */
    terminar() {
        this.remove_all_transitions();
        this._fase = FASES_ASOMO.INACTIVO;
        this._objetivo = null;
        this._principal = null;
        this.hide();
        for (const ventana of [this._actual, this._vecina]) {
            ventana.previa.actualizar(null, null, null, null);
            ventana.previa.set({opacity: 255, scale_x: 1, scale_y: 1, translation_x: 0});
        }
    }

    /**
     * Anchos de las dos ventanas y del hueco entre ellas para el progreso actual.
     * @returns {{actual: number, espacio: number, vecina: number}}
     */
    _anchos() {
        const {anchoActual, anchoVecina, espacio, espacioInicial} = this._inicio;
        const diametro = this._actual.get_preferred_height(-1)[1];
        const progreso = this._progreso;
        const queda = 1 - this._salida;
        return {
            actual: Math.max(0, mezclar(anchoActual, diametro, Math.min(progreso, 1))) * queda,
            espacio: Math.max(0, mezclar(espacioInicial, espacio, limitar(progreso, 0, 1))) * queda,
            vecina: Math.max(0, mezclar(anchoVecina, this._vecina.anchoNatural, progreso)),
        };
    }

    /**
     * La vista actual se apaga al encogerse; la de al lado se enciende al crecer
     * (si ya estaba en el círculo, se ve entera desde el principio).
     * Sin música, el contenido de la vista actual se centra y se reduce para caber en el círculo.
     */
    _aplicarContenido() {
        const progreso = limitar(this._progreso, 0, 1);
        const queda = 1 - this._salida;
        this._actual.opacity = Math.round(255 * queda);

        const previaActual = this._actual.previa;
        previaActual.opacity = Math.round(255 * mezclar(1, OPACIDAD_ACTUAL_ASOMO, progreso));
        const centrar = previaActual.modo !== 'musica';
        const escala = centrar ? mezclar(1, ESCALA_ACTUAL_ASOMO, progreso) : 1;
        previaActual.set_scale(escala, escala);
        // El borde de la ventana (1 px a cada lado) no cuenta para centrar dentro del recorte.
        const hueco = this._anchos().actual - (this._actual.anchoNatural - this._actual.anchoPrevia);
        previaActual.translation_x = centrar ? Math.round((hueco - this._actual.anchoPrevia) / 2) : 0;

        const desdeCirculo = this._inicio.anchoVecina > 0;
        this._vecina.previa.opacity = desdeCirculo ? 255 : Math.round(255 * Math.min(1, 0.25 + progreso * 1.2));
    }

    vfunc_get_preferred_width(_alto) {
        const {actual, espacio, vecina} = this._anchos();
        const total = actual + espacio + vecina;
        return [total, total];
    }

    vfunc_get_preferred_height(_ancho) {
        const alto = Math.max(this._actual.get_preferred_height(-1)[1], this._vecina.get_preferred_height(-1)[1]);
        return [alto, alto];
    }

    vfunc_allocate(caja) {
        this.set_allocation(caja);
        const {actual, espacio, vecina} = this._anchos();
        const altoDisponible = caja.get_height();
        let x = 0;
        for (const [ventana, ancho] of [[this._actual, actual], [this._vecina, vecina]]) {
            const alto = ventana.get_preferred_height(-1)[1];
            const y = Math.round((altoDisponible - alto) / 2);
            const hijo = new Clutter.ActorBox();
            hijo.set_origin(Math.round(x), y);
            hijo.set_size(Math.round(ancho), alto);
            ventana.allocate(hijo);
            x += ancho + espacio;
        }
    }
});

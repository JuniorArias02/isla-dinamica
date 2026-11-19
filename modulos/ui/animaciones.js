// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Efectos reutilizables de la Isla Dinámica (alto nivel).
 *
 * Se apoyan en ui/movimiento.js, que decide el forzado de animaciones,
 * los resortes físicos y el desenfoque. Aquí solo se describen efectos:
 * "saltar", "deslizar", "aplastar al tocar", "aterrizar"...
 */

import Clutter from 'gi://Clutter';

import {DURACION_APARICION_MS, RESORTES, ESCALA_PULSACION} from '../constantes.js';
import {animar, animarConResorte} from './movimiento.js';

/**
 * Hace "saltar" un actor desde pequeño hasta su tamaño (efecto rebote).
 * @param {Clutter.Actor} actor
 * @param {object} [opciones]
 * @param {number} [opciones.retraso=0] - Milisegundos antes de empezar.
 * @param {number} [opciones.escalaInicial=0.4]
 */
export function aparecerConRebote(actor, {retraso = 0, escalaInicial = 0.4} = {}) {
    for (const propiedad of ['scale-x', 'scale-y', 'opacity'])
        actor.remove_transition(propiedad);
    actor.set_pivot_point(0.5, 0.5);
    actor.set({scale_x: escalaInicial, scale_y: escalaInicial, opacity: 0});

    animar(actor, {
        opacity: 255,
        delay: retraso,
        duration: DURACION_APARICION_MS * 0.6,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
    animarConResorte(actor, {scale_x: 1, scale_y: 1}, {resorte: RESORTES.REBOTE, retraso});
}

/**
 * Hace entrar un actor deslizándose horizontalmente mientras aparece.
 * @param {Clutter.Actor} actor
 * @param {object} [opciones]
 * @param {number} [opciones.desde=-14] - Desplazamiento inicial en píxeles.
 * @param {number} [opciones.retraso=0]
 */
export function deslizarEntrada(actor, {desde = -14, retraso = 0} = {}) {
    actor.remove_transition('translation-x');
    actor.remove_transition('opacity');
    actor.set({translation_x: desde, opacity: 0});
    animar(actor, {
        translation_x: 0,
        opacity: 255,
        delay: retraso,
        duration: DURACION_APARICION_MS,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
    });
}

/**
 * Pequeño empujón lateral (feedback al cambiar de canción deslizando).
 * @param {Clutter.Actor} actor
 * @param {number} direccion - 1 hacia la derecha, -1 hacia la izquierda.
 */
export function empujar(actor, direccion) {
    actor.remove_transition('translation-x');
    actor.translation_x = 10 * direccion;
    animarConResorte(actor, {translation_x: 0}, {resorte: RESORTES.REBOTE});
}

/**
 * La isla se "aplasta" al tocarla y rebota (como al pulsar la Dynamic Island).
 * @param {Clutter.Actor} actor
 */
export function aplastar(actor) {
    actor.set_pivot_point(0.5, 0.5);
    animar(actor, {
        scale_x: ESCALA_PULSACION,
        scale_y: ESCALA_PULSACION,
        duration: 90,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => animarConResorte(actor, {scale_x: 1, scale_y: 1}, {resorte: RESORTES.REBOTE}),
    });
}

/**
 * La cápsula recibe a la isla que se cierra: se hincha un poco y se asienta.
 * @param {Clutter.Actor} actor
 */
export function aterrizar(actor) {
    actor.set_pivot_point(0.5, 0.5);
    actor.set({scale_x: 1.07, scale_y: 1.07});
    animarConResorte(actor, {scale_x: 1, scale_y: 1}, {resorte: RESORTES.REBOTE});
}

/**
 * Hace que un St.Button se hunda al presionarlo y rebote al soltarlo.
 * @param {St.Button} boton
 */
export function agregarEfectoPulsacion(boton) {
    boton.set_pivot_point(0.5, 0.5);
    boton.connect('notify::pressed', () => {
        if (boton.pressed) {
            animar(boton, {
                scale_x: 0.84,
                scale_y: 0.84,
                duration: 90,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            animarConResorte(boton, {scale_x: 1, scale_y: 1}, {resorte: RESORTES.REBOTE});
        }
    });
}

/**
 * Hace que un actor crezca un poco con el puntero encima.
 * @param {St.Widget} actor - Debe tener `track_hover: true`.
 * @param {number} [escala=1.05]
 */
export function agregarEfectoHover(actor, escala = 1.05) {
    actor.set_pivot_point(0.5, 0.5);
    actor.connect('notify::hover', () => {
        const destino = actor.hover ? escala : 1;
        animarConResorte(actor, {scale_x: destino, scale_y: destino}, {resorte: RESORTES.REBOTE});
    });
}

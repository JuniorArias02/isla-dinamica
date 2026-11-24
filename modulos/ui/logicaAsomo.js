// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Cuentas del gesto de asomarse a la vista de al lado (sin GNOME: se prueban con gjs).
 *
 *   arrastrar → progreso que sigue al puntero (0 = como estaba, 1 = la vista de al lado entera)
 *   volver sin soltar → el progreso baja hasta 0 (y no pasa al otro lado)
 *   soltar → se confirma si llegó a la mitad, o si se lanzó rápido hacia delante
 *
 * Con el ajuste "Cambiar al instante" no hay asomo: al soltar, direccionCambioDirecto()
 * dice si se cambia de vista (como en la versión 1.0).
 */

import {
    UMBRAL_INICIO_ASOMO_PX,
    DISTANCIA_ASOMO_PX,
    UMBRAL_CONFIRMAR_ASOMO,
    PROGRESO_MINIMO_LANZAR_ASOMO,
    UMBRAL_ARRASTRE_VISTA_PX,
    EXCESO_MAXIMO_ASOMO,
    VELOCIDAD_LANZAR,
} from '../constantes.js';

/**
 * Hacia dónde empezó el arrastre. El sentido queda fijo hasta soltar.
 * @param {number} desplazamiento - Píxeles en horizontal desde que se presionó.
 * @returns {number} +1 (hacia la derecha), -1 (hacia la izquierda) o 0 (aún no se movió lo suficiente).
 */
export function sentidoDeArrastre(desplazamiento) {
    if (Math.abs(desplazamiento) < UMBRAL_INICIO_ASOMO_PX)
        return 0;
    return desplazamiento > 0 ? 1 : -1;
}

/**
 * Vista a la que se asoma cada sentido: de izquierda a derecha, la siguiente;
 * de derecha a izquierda, la anterior (la lista es circular, ver controlador.vistaVecina).
 * @param {number} sentido - +1 o -1.
 * @returns {number} +1 (siguiente) o -1 (anterior).
 */
export function direccionDeSentido(sentido) {
    return sentido > 0 ? 1 : -1;
}

/**
 * Progreso del asomo para un desplazamiento, en el sentido en que empezó.
 * Volver hacia atrás lo reduce hasta 0; pasado el final crece poco (como una goma).
 * @param {number} desplazamiento - Píxeles en horizontal desde que se presionó.
 * @param {number} sentido - +1 o -1.
 * @returns {number} Entre 0 y 1 + EXCESO_MAXIMO_ASOMO.
 */
export function progresoDeArrastre(desplazamiento, sentido) {
    const avance = Math.max(0, desplazamiento * sentido) / DISTANCIA_ASOMO_PX;
    if (avance <= 1)
        return avance;
    const exceso = avance - 1;
    return 1 + EXCESO_MAXIMO_ASOMO * (exceso / (exceso + 1));
}

/**
 * "Cambiar al instante": al soltar, ¿se cambia de vista y hacia dónde?
 * De derecha a izquierda → la siguiente; de izquierda a derecha → la anterior (sin dar la vuelta).
 * @param {number} desplazamiento - Píxeles en horizontal desde que se presionó.
 * @param {number} velocidad - Velocidad horizontal (px/ms) al soltar.
 * @returns {number} +1, -1 o 0 (arrastre corto: no cambia).
 */
export function direccionCambioDirecto(desplazamiento, velocidad) {
    const suficiente = Math.abs(desplazamiento) > UMBRAL_ARRASTRE_VISTA_PX ||
        Math.abs(velocidad) > VELOCIDAD_LANZAR;
    if (!suficiente || desplazamiento === 0)
        return 0;
    return desplazamiento < 0 ? 1 : -1;
}

/**
 * Al soltar: ¿se queda la vista de al lado?
 * @param {number} progreso - Progreso en el momento de soltar.
 * @param {number} velocidad - Velocidad (px/ms) en el sentido del asomo (negativa = volviendo).
 * @returns {boolean}
 */
export function debeConfirmarAsomo(progreso, velocidad) {
    if (velocidad > VELOCIDAD_LANZAR)
        return progreso >= PROGRESO_MINIMO_LANZAR_ASOMO;
    if (velocidad < -VELOCIDAD_LANZAR)
        return false;
    return progreso >= UMBRAL_CONFIRMAR_ASOMO;
}

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Estilos de la isla: qué trae cada diseño. Solo datos.
 *
 * Cada estilo es un paquete:
 *   clase            → clase CSS que se pone en las raíces (cápsula y tarjeta).
 *                      Todas las reglas del estilo cuelgan de ella.
 *   hoja             → su hoja de estilos en recursos/estilos/ (null = solo la base,
 *                      stylesheet.css).
 *   vidrio           → muestra el vidrio de verdad (componentes/vidrio.js).
 *   colorDeLaPortada → la isla se tiñe con el color de la carátula de la canción.
 *   luzQueSigue      → el canto del vidrio brilla cerca del puntero (componentes/luzVidrio.js).
 *
 * Para añadir un estilo: su valor en ESTILOS_ISLA (ajustes.js) y en el esquema, su
 * entrada aquí, su hoja en recursos/estilos/ y su opción en prefs.js.
 */

import {ESTILOS_ISLA} from '../../ajustes.js';

/**
 * @typedef {object} DefinicionEstilo
 * @property {string} nombre
 * @property {string|null} clase
 * @property {string|null} hoja
 * @property {boolean} vidrio
 * @property {boolean} colorDeLaPortada
 * @property {boolean} luzQueSigue
 */

/** @type {Object<string, DefinicionEstilo>} */
export const DEFINICIONES_ESTILOS = Object.freeze({
    [ESTILOS_ISLA.CRISTAL]: Object.freeze({
        nombre: 'Liquid Glass',
        clase: 'isla-cristal',
        hoja: 'cristal.css',
        vidrio: true,
        colorDeLaPortada: true,
        luzQueSigue: true,
    }),
    [ESTILOS_ISLA.CLASICO]: Object.freeze({
        nombre: 'Negro clásico',
        clase: null,
        hoja: null,
        vidrio: false,
        colorDeLaPortada: false,
        luzQueSigue: false,
    }),
});

/** El estilo que se usa si el ajuste tiene un valor desconocido. */
export const ESTILO_POR_DEFECTO = ESTILOS_ISLA.CRISTAL;

/**
 * @param {string} estilo - Valor de ESTILOS_ISLA.
 * @returns {DefinicionEstilo}
 */
export function definicionDe(estilo) {
    return DEFINICIONES_ESTILOS[estilo] ?? DEFINICIONES_ESTILOS[ESTILO_POR_DEFECTO];
}

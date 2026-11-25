// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Tinte — código PURO (sin GNOME, se prueba con gjs). Convierte el color de una
 * carátula en colores que siempre se ven bien en la isla:
 *
 *   colorDeTinte()   → para teñir el vidrio: ni muy oscuro (se perdería) ni muy
 *                      claro (el texto blanco no se leería), y con algo de color
 *                      aunque la carátula sea casi gris.
 *   colorDeAcento()  → para la onda y la barra de progreso: más claro y vivo, para
 *                      que destaque sobre el vidrio teñido.
 *   cssRgba()        → el color en CSS de St.
 */

/** Límites de saturación y luz (0–1) de cada uso. */
const LIMITES_TINTE = Object.freeze({saturacionMinima: 0.30, saturacionMaxima: 0.80, luzMinima: 0.30, luzMaxima: 0.48});
const LIMITES_ACENTO = Object.freeze({saturacionMinima: 0.45, saturacionMaxima: 0.95, luzMinima: 0.62, luzMaxima: 0.74});

const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));

/**
 * @param {{r: number, g: number, b: number}} color - 0–255.
 * @returns {{h: number, s: number, l: number}} h en grados, s y l de 0 a 1.
 */
export function aHsl({r, g, b}) {
    const [rr, gg, bb] = [r / 255, g / 255, b / 255];
    const maximo = Math.max(rr, gg, bb);
    const minimo = Math.min(rr, gg, bb);
    const l = (maximo + minimo) / 2;
    const d = maximo - minimo;
    if (d === 0)
        return {h: 0, s: 0, l};
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (maximo === rr)
        h = ((gg - bb) / d) % 6;
    else if (maximo === gg)
        h = (bb - rr) / d + 2;
    else
        h = (rr - gg) / d + 4;
    return {h: (h * 60 + 360) % 360, s, l};
}

/**
 * @param {{h: number, s: number, l: number}} color
 * @returns {{r: number, g: number, b: number}} 0–255.
 */
export function deHsl({h, s, l}) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    const tramo = Math.floor(h / 60) % 6;
    const [rr, gg, bb] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][tramo];
    return {r: Math.round((rr + m) * 255), g: Math.round((gg + m) * 255), b: Math.round((bb + m) * 255)};
}

function ajustar(color, {saturacionMinima, saturacionMaxima, luzMinima, luzMaxima}) {
    const {h, s, l} = aHsl(color);
    // Un gris puro (sin tono) se queda gris: subirle la saturación inventaría un rojo.
    const saturacion = s === 0 ? 0 : limitar(s, saturacionMinima, saturacionMaxima);
    return deHsl({h, s: saturacion, l: limitar(l, luzMinima, luzMaxima)});
}

/**
 * Color para teñir el vidrio.
 * @param {{r: number, g: number, b: number}|null} color - Color de la carátula.
 * @returns {{r: number, g: number, b: number}|null}
 */
export function colorDeTinte(color) {
    return color ? ajustar(color, LIMITES_TINTE) : null;
}

/**
 * Color de acento (onda, barra de progreso).
 * @param {{r: number, g: number, b: number}|null} color - Color de la carátula.
 * @returns {{r: number, g: number, b: number}|null}
 */
export function colorDeAcento(color) {
    return color ? ajustar(color, LIMITES_ACENTO) : null;
}

/**
 * @param {{r: number, g: number, b: number}} color
 * @param {number} [alfa=1]
 * @returns {string} Ej. "rgba(120, 80, 40, 0.5)".
 */
export function cssRgba({r, g, b}, alfa = 1) {
    return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/**
 * Mezcla de dos colores (t = 0 → a, t = 1 → b). De rojo a azul pasa por violeta.
 * @param {{r: number, g: number, b: number}} a
 * @param {{r: number, g: number, b: number}} b
 * @param {number} t - 0–1.
 * @returns {{r: number, g: number, b: number}}
 */
export function mezclarColores(a, b, t) {
    const mezcla = (x, y) => Math.round(x + (y - x) * t);
    return {r: mezcla(a.r, b.r), g: mezcla(a.g, b.g), b: mezcla(a.b, b.b)};
}

/**
 * ¿Son el mismo color? (null cuenta como "sin color").
 * @param {{r: number, g: number, b: number}|null} a
 * @param {{r: number, g: number, b: number}|null} b
 * @returns {boolean}
 */
export function mismoColor(a, b) {
    if (!a || !b)
        return a === b;
    return a.r === b.r && a.g === b.g && a.b === b.b;
}

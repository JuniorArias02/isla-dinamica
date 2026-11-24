// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Esqueleto — barra gris redondeada que ocupa el lugar de un texto mientras carga.
 *
 *   ▬▬▬▬▬▬▬▬▬▬     (título)
 *   ▬▬▬▬▬▬         (artista)
 *
 * El latido lo controla quien lo usa (latir / detenerLatido de animaciones.js),
 * para que solo anime mientras se ve.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';

/**
 * @param {number} ancho - px.
 * @param {number} alto - px.
 * @returns {St.Widget}
 */
export function crearEsqueleto(ancho, alto) {
    return new St.Widget({
        style_class: 'isla-esqueleto',
        width: ancho,
        height: alto,
        y_align: Clutter.ActorAlign.CENTER,
        visible: false,
    });
}

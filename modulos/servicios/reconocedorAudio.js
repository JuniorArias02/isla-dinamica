// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Reconocedor de audio — código PURO (sin GNOME, se puede probar con gjs).
 *
 * ¿Lo que suena es música o un audio de un chat (una nota de voz de WhatsApp)?
 *
 * Los navegadores (Chrome, Brave...) publican todo lo que suena por MPRIS. Una web
 * de música (YouTube, Spotify) da título y artista. Cuando la web no da datos, el
 * navegador pone como título la web de origen y deja el artista vacío. Así llega
 * un audio de WhatsApp Web: título "web.whatsapp.com", sin artista.
 * Si esa web es de un chat conocido (reconocedorApps), es un audio de chat.
 */

import {TIPOS_PISTA} from '../constantes.js';
import {reconocerApp} from './notificaciones/reconocedorApps.js';

/** Un título que solo es una web (ej. "web.whatsapp.com"). */
const PATRON_WEB = /^(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/?$/i;

/**
 * @param {object} pista
 * @param {string} [pista.titulo] - xesam:title
 * @param {string} [pista.artista] - xesam:artist (unidos)
 * @returns {{tipo: string, app: {id: string, nombre: string, entradasEscritorio: string[]}|null}}
 *   tipo: un valor de TIPOS_PISTA. app: el chat del audio (null si es música).
 */
export function clasificarAudio({titulo = '', artista = ''}) {
    const web = titulo.trim().match(PATRON_WEB);
    if (!web || artista.trim())
        return {tipo: TIPOS_PISTA.MUSICA, app: null};
    const app = reconocerApp({origen: web[1].toLowerCase()});
    if (!app?.esChat)
        return {tipo: TIPOS_PISTA.MUSICA, app: null};
    return {
        tipo: TIPOS_PISTA.AUDIO,
        app: {id: app.id, nombre: app.nombre, entradasEscritorio: [...app.entradasEscritorio]},
    };
}

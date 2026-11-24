// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Catálogo de iconos de la Isla Dinámica.
 *
 * Los iconos propios viven en `recursos/iconos/*-symbolic.svg`. Al llevar el
 * sufijo "-symbolic", GNOME los recolorea con el `color` del CSS, así un mismo
 * archivo sirve en blanco, verde o rojo.
 *
 * También resuelve el icono a color de una aplicación (Brave, Spotify...)
 * para mostrarlo junto a la música o las notificaciones.
 */

import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

/**
 * Nombres de los iconos propios disponibles.
 * @enum {string}
 */
export const ICONOS = Object.freeze({
    REPRODUCIR: 'reproducir',
    PAUSA: 'pausa',
    SIGUIENTE: 'siguiente',
    ANTERIOR: 'anterior',
    AURICULARES: 'auriculares',
    NOTA: 'nota',
    CAMPANA: 'campana',
    RAYO: 'rayo',
    ESTUCHE: 'estuche',
    RUIDO_APAGADO: 'ruido-apagado',
    RUIDO_CANCELACION: 'ruido-cancelacion',
    RUIDO_TRANSPARENCIA: 'ruido-transparencia',
    LUNA: 'luna',
    TEMPORIZADOR: 'temporizador',
    CHECK: 'check',
    BATERIA: 'bateria',
    AVION: 'avion',
    GRABAR: 'grabar',
    DETENER: 'detener',
    CAPTURA: 'captura',
    TELEFONO: 'telefono',
    COLGAR: 'colgar',
    MICROFONO: 'microfono',
    MICROFONO_SILENCIADO: 'microfono-silenciado',
    CAMARA: 'camara',
});

let rutaIconos = null;
const cache = new Map();

/**
 * Indica dónde está la carpeta de recursos. Se llama en enable().
 * @param {string} rutaExtension - `this.path` de la extensión.
 */
export function configurarIconos(rutaExtension) {
    rutaIconos = `${rutaExtension}/recursos/iconos`;
    cache.clear();
}

/** Olvida la ruta y la caché. Se llama en disable(). */
export function liberarIconos() {
    rutaIconos = null;
    cache.clear();
}

/**
 * Devuelve un icono propio listo para St.Icon.gicon.
 * @param {string} nombre - Uno de ICONOS.
 * @returns {Gio.Icon}
 */
export function icono(nombre) {
    if (!cache.has(nombre)) {
        const archivo = Gio.File.new_for_path(`${rutaIconos}/${nombre}-symbolic.svg`);
        cache.set(nombre, new Gio.FileIcon({file: archivo}));
    }
    return cache.get(nombre);
}

/**
 * Icono a color de la app de un audio de chat (ej. la app "WhatsApp Web" de Brave).
 * @param {{nombre: string, entradasEscritorio: string[]}|null} app
 * @returns {Gio.Icon|null}
 */
export function iconoDeAppDeAudio(app) {
    if (!app)
        return null;
    for (const entrada of app.entradasEscritorio ?? []) {
        const encontrado = iconoDeAplicacion(null, entrada);
        if (encontrado)
            return encontrado;
    }
    return iconoDeAplicacion(app.nombre);
}

/**
 * Busca el icono a color de una aplicación instalada.
 * @param {string} [nombreVisible] - Nombre que reporta la app (ej. "Brave").
 * @param {string} [entradaEscritorio] - Nombre del .desktop sin extensión, si se conoce.
 * @returns {Gio.Icon|null}
 */
export function iconoDeAplicacion(nombreVisible, entradaEscritorio) {
    const sistema = Shell.AppSystem.get_default();

    let app = entradaEscritorio ? sistema.lookup_app(`${entradaEscritorio}.desktop`) : null;
    if (!app && nombreVisible) {
        const resultados = Shell.AppSystem.search(nombreVisible);
        const primerId = resultados?.[0]?.[0];
        app = primerId ? sistema.lookup_app(primerId) : null;
    }
    return app?.get_icon() ?? null;
}

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas de los estilos: definiciones, color dominante de una carátula y tinte.
 */

import GLib from 'gi://GLib';

import {ejecutar, prueba, igual, verdadero} from '../utilidades.js';
import {ESTILOS_ISLA} from '../../modulos/ajustes.js';
import {DEFINICIONES_ESTILOS, definicionDe} from '../../modulos/ui/estilos/estilos.js';
import {aHsl, colorDeTinte, colorDeAcento, cssRgba, mismoColor, mezclarColores} from '../../modulos/ui/estilos/tinte.js';
import {colorDominante} from '../../modulos/servicios/colorPortada.js';

/** Imagen RGB de ancho×alto con los colores dados (uno por píxel, en orden, repetidos). */
function imagen(colores, ancho = 4, alto = 4) {
    const pixeles = new Uint8Array(ancho * alto * 3);
    for (let i = 0; i < ancho * alto; i++)
        pixeles.set(colores[i % colores.length], i * 3);
    return {pixeles, forma: {ancho, alto, canales: 3}};
}

ejecutar('Estilos', async () => {
    await prueba('cada estilo del ajuste tiene su definición, y su hoja existe', () => {
        for (const estilo of Object.values(ESTILOS_ISLA)) {
            const definicion = DEFINICIONES_ESTILOS[estilo];
            verdadero(Boolean(definicion), `falta la definición de "${estilo}"`);
            if (definicion.hoja) {
                const ruta = GLib.filename_from_uri(GLib.Uri.resolve_relative(import.meta.url,
                    `../../recursos/estilos/${definicion.hoja}`, GLib.UriFlags.NONE))[0];
                verdadero(GLib.file_test(ruta, GLib.FileTest.EXISTS), `no existe ${definicion.hoja}`);
            }
        }
        igual(definicionDe('desconocido').nombre, 'Liquid Glass', 'un valor raro usa el estilo por defecto');
        verdadero(definicionDe(ESTILOS_ISLA.CRISTAL).colorDeLaPortada, 'Liquid Glass usa el color de la portada');
        verdadero(!definicionDe(ESTILOS_ISLA.CLASICO).colorDeLaPortada && !definicionDe(ESTILOS_ISLA.CLASICO).vidrio,
            'el negro clásico no usa vidrio ni color');
    });

    await prueba('el color dominante prefiere el color vivo al gris, al blanco y al negro', () => {
        const {pixeles, forma} = imagen([[20, 20, 20], [240, 240, 240], [128, 128, 128], [200, 90, 30]]);
        const {r, g, b} = colorDominante(pixeles, forma);
        verdadero(r > g && g > b, `debería tirar a naranja: ${r},${g},${b}`);
    });

    await prueba('una imagen transparente no tiene color', () => {
        const pixeles = new Uint8Array(4 * 4 * 4); // RGBA todo a 0 (transparente)
        igual(colorDominante(pixeles, {ancho: 4, alto: 4, canales: 4}), null);
    });

    await prueba('el tinte nunca es tan oscuro ni tan claro que no se vea o no deje leer', () => {
        for (const color of [{r: 5, g: 5, b: 40}, {r: 250, g: 240, b: 200}, {r: 200, g: 90, b: 30}]) {
            const {l} = aHsl(colorDeTinte(color));
            verdadero(l >= 0.29 && l <= 0.49, `luz del tinte fuera de rango: ${l}`);
            const acento = aHsl(colorDeAcento(color));
            verdadero(acento.l >= 0.61 && acento.l <= 0.75, `luz del acento fuera de rango: ${acento.l}`);
        }
    });

    await prueba('un gris se queda gris (no se inventa un color)', () => {
        const {s} = aHsl(colorDeTinte({r: 128, g: 128, b: 128}));
        igual(s, 0);
    });

    await prueba('el cambio de color pasa suave de uno a otro (de rojo a azul, por violeta)', () => {
        const rojo = {r: 255, g: 0, b: 0};
        const azul = {r: 0, g: 0, b: 255};
        igual(mezclarColores(rojo, azul, 0), rojo);
        igual(mezclarColores(rojo, azul, 1), azul);
        igual(mezclarColores(rojo, azul, 0.5), {r: 128, g: 0, b: 128});
    });

    await prueba('sin color no hay tinte, y los colores se comparan bien', () => {
        igual(colorDeTinte(null), null);
        igual(colorDeAcento(null), null);
        igual(cssRgba({r: 1, g: 2, b: 3}, 0.5), 'rgba(1, 2, 3, 0.5)');
        verdadero(mismoColor(null, null) && mismoColor({r: 1, g: 2, b: 3}, {r: 1, g: 2, b: 3}) && !mismoColor(null, {r: 0, g: 0, b: 0}), 'mismoColor');
    });
});

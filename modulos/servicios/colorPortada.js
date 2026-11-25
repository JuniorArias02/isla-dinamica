// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Color de la portada — Capa 3 (servicio). El color dominante de la carátula de
 * la canción, para que la interfaz pueda teñirse con él.
 *
 *   colorDominante()  → código PURO (se prueba con gjs): de una cuadrícula de
 *                       píxeles saca el color que más "manda", dando más peso a
 *                       los colores vivos que a los grises, blancos y negros.
 *   esMismaImagen()   → código PURO: ¿dos miniaturas muestran lo mismo?
 *   ExtractorColor    → lee la imagen en pequeño (24×24) sin bloquear el Shell y
 *                       guarda el resultado por URL (cada portada se mira una vez).
 *
 * Imagen de relleno: cuando un navegador no tiene la portada (al pasar de canción,
 * mientras la descarga, o una web sin portada), publica SU LOGO como carátula
 * (Brave: el león naranja). No es la portada de la canción: no da color. Se
 * reconoce comparándola con el icono del propio reproductor, que busca la función
 * `cargarIcono` (iconoApp.js; se recibe desde fuera para no depender del Shell).
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';

import {LADO_MUESTRA_COLOR_PX, MAXIMO_COLORES_EN_CACHE, DIFERENCIA_MAXIMA_RELLENO} from '../constantes.js';
import {registrarDepuracion} from '../registro.js';

/**
 * Color dominante de una imagen.
 * @param {Uint8Array|number[]} pixeles - Bytes RGB(A), fila a fila.
 * @param {object} forma
 * @param {number} forma.ancho
 * @param {number} forma.alto
 * @param {number} forma.canales - 3 (RGB) o 4 (RGBA).
 * @param {number} [forma.salto] - Bytes por fila (por defecto ancho × canales).
 * @returns {{r: number, g: number, b: number}|null} null si la imagen está vacía o es transparente.
 */
export function colorDominante(pixeles, {ancho, alto, canales, salto = ancho * canales}) {
    let suma = 0;
    let r = 0, g = 0, b = 0;
    for (let y = 0; y < alto; y++) {
        for (let x = 0; x < ancho; x++) {
            const i = y * salto + x * canales;
            if (canales === 4 && pixeles[i + 3] < 128)
                continue;
            const [pr, pg, pb] = [pixeles[i], pixeles[i + 1], pixeles[i + 2]];
            const maximo = Math.max(pr, pg, pb);
            const minimo = Math.min(pr, pg, pb);
            const saturacion = maximo === 0 ? 0 : (maximo - minimo) / maximo;
            const luz = (maximo + minimo) / 510;
            // Los colores vivos y de luz media mandan; grises, blancos y negros cuentan poco.
            const peso = 0.05 + saturacion * saturacion * (1 - Math.abs(luz - 0.5));
            r += pr * peso;
            g += pg * peso;
            b += pb * peso;
            suma += peso;
        }
    }
    if (suma === 0)
        return null;
    return {r: Math.round(r / suma), g: Math.round(g / suma), b: Math.round(b / suma)};
}

/**
 * ¿Muestran lo mismo dos miniaturas del mismo tamaño? Lo transparente cuenta como
 * negro (el navegador pinta su logo sobre negro).
 * @param {{pixeles: Uint8Array, ancho: number, alto: number, canales: number, salto: number}} a
 * @param {{pixeles: Uint8Array, ancho: number, alto: number, canales: number, salto: number}} b
 * @returns {boolean}
 */
export function esMismaImagen(a, b) {
    if (a.ancho !== b.ancho || a.alto !== b.alto)
        return false;
    const componente = (imagen, x, y, c) => {
        const i = y * imagen.salto + x * imagen.canales;
        const alfa = imagen.canales === 4 ? imagen.pixeles[i + 3] / 255 : 1;
        return imagen.pixeles[i + c] * alfa;
    };
    let diferencia = 0;
    for (let y = 0; y < a.alto; y++) {
        for (let x = 0; x < a.ancho; x++) {
            for (let c = 0; c < 3; c++)
                diferencia += Math.abs(componente(a, x, y, c) - componente(b, x, y, c));
        }
    }
    return diferencia / (a.ancho * a.alto * 3) <= DIFERENCIA_MAXIMA_RELLENO;
}

/**
 * @param {GdkPixbuf.Pixbuf} imagen
 * @returns {{pixeles: Uint8Array, ancho: number, alto: number, canales: number, salto: number}}
 */
function muestraDe(imagen) {
    return {
        pixeles: imagen.get_pixels(),
        ancho: imagen.get_width(),
        alto: imagen.get_height(),
        canales: imagen.get_n_channels(),
        salto: imagen.get_rowstride(),
    };
}

/**
 * @typedef {object} InfoPortada
 * @property {{r: number, g: number, b: number}|null} color - Color dominante (null si no hay).
 * @property {boolean} relleno - Es el logo del reproductor, no una portada.
 * @property {boolean} pendiente - Aún se está leyendo.
 */

/** Lee carátulas en pequeño y recuerda su color (y si son el logo de relleno). */
export class ExtractorColor {
    /**
     * @param {object} opciones
     * @param {Function} opciones.alListo - Se llama cuando una carátula termina de leerse.
     * @param {Function} [opciones.cargarIcono] - (entradaEscritorio, lado, cancelable) →
     *   Promise<GdkPixbuf.Pixbuf|null>: el icono del reproductor. Sin ella no se reconoce el logo.
     */
    constructor({alListo, cargarIcono = null}) {
        this._alListo = alListo;
        this._cargarIcono = cargarIcono;
        /** @type {Map<string, {color: object|null, relleno: boolean}>} url → resultado. */
        this._cache = new Map();
        this._pendientes = new Set();
        /** @type {Map<string, Promise<object|null>>} entrada del escritorio → miniatura de su icono. */
        this._iconos = new Map();
        this._cancelable = new Gio.Cancellable();
    }

    /**
     * Qué se sabe de una carátula. Si aún no se leyó, empieza a leerla (pendiente) y,
     * cuando termine, avisa con `alListo`.
     * @param {string|null} url - URL file:// de la carátula.
     * @param {string|null} [entradaEscritorio] - .desktop del reproductor (para reconocer su logo).
     * @returns {InfoPortada}
     */
    infoDe(url, entradaEscritorio = null) {
        if (!url)
            return {color: null, relleno: false, pendiente: false};
        const conocida = this._cache.get(url);
        if (conocida)
            return {...conocida, pendiente: false};
        if (!this._pendientes.has(url)) {
            this._pendientes.add(url);
            this._leer(url, entradaEscritorio).catch(error => {
                // Lo normal: el navegador ya borró el archivo temporal. Sin color, sin más.
                if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    registrarDepuracion(`Color de la portada: no se pudo leer (${error.message}).`);
                this._guardar(url, {color: null, relleno: false});
            });
        }
        return {color: null, relleno: false, pendiente: true};
    }

    destruir() {
        this._cancelable.cancel();
        this._cache.clear();
        this._pendientes.clear();
        this._iconos.clear();
        this._alListo = null;
    }

    async _leer(url, entradaEscritorio) {
        const flujo = await new Promise((resolver, rechazar) => {
            Gio.File.new_for_uri(url).read_async(GLib.PRIORITY_LOW, this._cancelable, (archivo, resultado) => {
                try {
                    resolver(archivo.read_finish(resultado));
                } catch (error) {
                    rechazar(error);
                }
            });
        });
        const imagen = await new Promise((resolver, rechazar) => {
            GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(flujo, LADO_MUESTRA_COLOR_PX, LADO_MUESTRA_COLOR_PX,
                false, this._cancelable, (_origen, resultado) => {
                    try {
                        resolver(GdkPixbuf.Pixbuf.new_from_stream_finish(resultado));
                    } catch (error) {
                        rechazar(error);
                    }
                });
        });
        flujo.close(null);

        const muestra = muestraDe(imagen);
        const icono = await this._iconoDe(entradaEscritorio);
        if (icono && esMismaImagen(muestra, icono)) {
            registrarDepuracion('Color de la portada: es el logo del reproductor (sin portada todavía).');
            this._guardar(url, {color: null, relleno: true});
        } else {
            this._guardar(url, {color: colorDominante(muestra.pixeles, muestra), relleno: false});
        }
        this._alListo?.();
    }

    /**
     * Miniatura del icono de un reproductor (se busca una vez por app).
     * @param {string|null} entradaEscritorio
     * @returns {Promise<object|null>}
     */
    _iconoDe(entradaEscritorio) {
        if (!entradaEscritorio || !this._cargarIcono)
            return Promise.resolve(null);
        if (!this._iconos.has(entradaEscritorio))
            this._iconos.set(entradaEscritorio, this._cargarIconoDe(entradaEscritorio).catch(() => null));
        return this._iconos.get(entradaEscritorio);
    }

    async _cargarIconoDe(entradaEscritorio) {
        const imagen = await this._cargarIcono(entradaEscritorio, LADO_MUESTRA_COLOR_PX, this._cancelable);
        if (!imagen)
            return null;
        // El tema puede devolverlo a otro tamaño: se ajusta al de la muestra.
        const ajustada = imagen.get_width() === LADO_MUESTRA_COLOR_PX && imagen.get_height() === LADO_MUESTRA_COLOR_PX
            ? imagen
            : imagen.scale_simple(LADO_MUESTRA_COLOR_PX, LADO_MUESTRA_COLOR_PX, GdkPixbuf.InterpType.BILINEAR);
        return muestraDe(ajustada);
    }

    _guardar(url, resultado) {
        this._pendientes.delete(url);
        this._cache.set(url, resultado);
        // Solo se recuerdan las últimas portadas (cada una es un color: casi no ocupa).
        while (this._cache.size > MAXIMO_COLORES_EN_CACHE)
            this._cache.delete(this._cache.keys().next().value);
    }
}

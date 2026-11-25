// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * GestorEstilos — aplica el estilo elegido (estilos.js) a la isla.
 *
 *   - Carga las hojas de estilos de todos los estilos al empezar y las quita al
 *     terminar. Sus reglas cuelgan de la clase de cada estilo, así que tenerlas
 *     cargadas no cambia nada hasta que se aplica el estilo. (Si el usuario cambia
 *     el tema de GNOME, GNOME conserva las hojas cargadas por las extensiones.)
 *   - aplicar(): pone la clase del estilo en las raíces (cápsula y tarjeta) y les
 *     dice si deben mostrar el vidrio de verdad y la luz que sigue al puntero.
 *   - adaptarVista(): lo que el estilo no usa no llega a la interfaz (ej. sin
 *     "color de la portada", la pista llega sin color y nada se tiñe).
 */

import Gio from 'gi://Gio';
import St from 'gi://St';

import {registrarError, registrarInfo} from '../../registro.js';
import {DEFINICIONES_ESTILOS, definicionDe} from './estilos.js';

export class GestorEstilos {
    /**
     * @param {object} opciones
     * @param {string} opciones.rutaExtension - `this.path` de la extensión.
     * @param {Array<St.Widget>} opciones.raices - Actores que reciben la clase del estilo;
     *   cada uno tiene `establecerVidrio(activo)` y `establecerLuz(activa)`.
     */
    constructor({rutaExtension, raices}) {
        this._raices = raices;
        this._definicion = null;
        /** @type {Gio.File[]} */
        this._hojas = [];

        const tema = St.ThemeContext.get_for_stage(global.stage).get_theme();
        for (const {hoja} of Object.values(DEFINICIONES_ESTILOS)) {
            if (!hoja)
                continue;
            const archivo = Gio.File.new_for_path(`${rutaExtension}/recursos/estilos/${hoja}`);
            try {
                tema.load_stylesheet(archivo);
                this._hojas.push(archivo);
            } catch (error) {
                registrarError(`estilos: cargar ${hoja}`, error);
            }
        }
    }

    /** @returns {import('./estilos.js').DefinicionEstilo|null} El estilo aplicado. */
    get definicion() {
        return this._definicion;
    }

    /**
     * @param {string} estilo - Valor de ESTILOS_ISLA.
     */
    aplicar(estilo) {
        const definicion = definicionDe(estilo);
        if (definicion === this._definicion)
            return;
        this._definicion = definicion;
        for (const raiz of this._raices) {
            for (const {clase} of Object.values(DEFINICIONES_ESTILOS)) {
                if (clase)
                    raiz.remove_style_class_name(clase);
            }
            if (definicion.clase)
                raiz.add_style_class_name(definicion.clase);
            raiz.establecerVidrio(definicion.vidrio);
            raiz.establecerLuz(definicion.luzQueSigue);
        }
        registrarInfo(`Estilo de la isla: ${definicion.nombre}.`);
    }

    /**
     * Quita de la vista lo que el estilo no usa.
     * @param {import('../../controlador.js').Vista} vista
     * @returns {import('../../controlador.js').Vista}
     */
    adaptarVista(vista) {
        if (this._definicion?.colorDeLaPortada || !vista.pista?.colorPortada)
            return vista;
        return {...vista, pista: {...vista.pista, colorPortada: null}};
    }

    /** Quita las hojas de estilos (se llama en disable()). */
    destruir() {
        // El tema puede haber cambiado desde que se cargaron: se quitan del actual.
        const tema = St.ThemeContext.get_for_stage(global.stage).get_theme();
        for (const archivo of this._hojas)
            tema.unload_stylesheet(archivo);
        this._hojas = [];
        this._raices = [];
    }
}

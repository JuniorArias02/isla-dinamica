// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Utilidades mínimas para las pruebas unitarias (se ejecutan con `gjs -m`, fuera del Shell).
 *
 *   import {ejecutar, prueba, igual, verdadero} from '../utilidades.js';
 *
 *   ejecutar('Controlador', async () => {
 *       prueba('una alerta se muestra', () => {
 *           igual(controlador.alertaActual.tipo, 'notificacion');
 *       });
 *   });
 *
 * Cada archivo termina con código 0 si todo pasó y 1 si algo falló.
 */

import GLib from 'gi://GLib';
import System from 'system';

let aciertos = 0;
let fallos = 0;

/**
 * Error de una comprobación fallida.
 */
class FalloDePrueba extends Error {}

/**
 * Comprueba que dos valores sean iguales (comparación profunda vía JSON).
 * @param {*} real
 * @param {*} esperado
 * @param {string} [detalle]
 */
export function igual(real, esperado, detalle = '') {
    const textoReal = JSON.stringify(real);
    const textoEsperado = JSON.stringify(esperado);
    if (textoReal !== textoEsperado)
        throw new FalloDePrueba(`${detalle ? `${detalle}: ` : ''}se obtuvo ${textoReal}, se esperaba ${textoEsperado}`);
}

/**
 * Comprueba que una condición se cumpla.
 * @param {boolean} condicion
 * @param {string} detalle
 */
export function verdadero(condicion, detalle) {
    if (!condicion)
        throw new FalloDePrueba(detalle);
}

/**
 * Ejecuta un caso de prueba y anota el resultado.
 * @param {string} nombre
 * @param {Function} cuerpo - Puede ser asíncrono.
 */
export async function prueba(nombre, cuerpo) {
    try {
        await cuerpo();
        aciertos++;
        print(`  ✔ ${nombre}`);
    } catch (error) {
        fallos++;
        print(`  ✘ ${nombre}`);
        print(`      ${error instanceof FalloDePrueba ? error.message : `${error}\n${error.stack}`}`);
    }
}

/**
 * Espera sin bloquear el bucle principal (para temporizadores).
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function esperar(ms) {
    return new Promise(resolver => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolver();
            return GLib.SOURCE_REMOVE;
        });
    });
}

/**
 * Ejecuta un grupo de pruebas con un bucle principal de GLib y sale con el código adecuado.
 * @param {string} titulo
 * @param {Function} cuerpo - Función asíncrona que llama a prueba().
 */
export function ejecutar(titulo, cuerpo) {
    print(`\n${titulo}`);
    const bucle = new GLib.MainLoop(null, false);
    cuerpo()
        .catch(error => {
            fallos++;
            print(`  ✘ Error inesperado: ${error}\n${error.stack}`);
        })
        .finally(() => bucle.quit());
    bucle.run();

    print(`  ${aciertos} correctas, ${fallos} fallidas`);
    System.exit(fallos > 0 ? 1 : 0);
}

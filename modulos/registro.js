// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Registro — único punto por donde pasan los mensajes y errores de la isla.
 *
 * Cada mensaje va a dos sitios:
 *   1. El journal de GNOME Shell (journalctl), con el prefijo [isla-dinamica].
 *   2. Un archivo propio: ~/.cache/isla-dinamica/registro.log
 *      (solo avisos y errores, más los arranques/paradas, para que sea fácil de compartir).
 *
 * La escritura al archivo es asíncrona y agrupada, para no bloquear nunca
 * el hilo del compositor. El archivo se rota al superar TAMANO_MAXIMO_BYTES.
 *
 * `protegido()` envuelve callbacks (señales, D-Bus, temporizadores) para que
 * un error en uno de ellos quede registrado con su contexto y no rompa el resto.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {PREFIJO_LOG} from './constantes.js';

const CARPETA = GLib.build_filenamev([GLib.get_user_cache_dir(), 'isla-dinamica']);
const RUTA_ARCHIVO = GLib.build_filenamev([CARPETA, 'registro.log']);
const RUTA_ANTERIOR = GLib.build_filenamev([CARPETA, 'registro.anterior.log']);
const TAMANO_MAXIMO_BYTES = 512 * 1024;

const codificador = new TextEncoder();
let pendientes = [];
let escribiendo = false;
let activo = false;

/** Prepara la carpeta y rota el archivo si creció demasiado. Se llama en enable(). */
export function iniciarRegistro() {
    activo = true;
    try {
        GLib.mkdir_with_parents(CARPETA, 0o755);
        const archivo = Gio.File.new_for_path(RUTA_ARCHIVO);
        if (archivo.query_exists(null)) {
            const info = archivo.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
            if (info.get_size() > TAMANO_MAXIMO_BYTES)
                archivo.move(Gio.File.new_for_path(RUTA_ANTERIOR), Gio.FileCopyFlags.OVERWRITE, null, null);
        }
    } catch (error) {
        console.warn(`${PREFIJO_LOG} No se pudo preparar el archivo de registro: ${error.message}`);
    }
}

/** Deja de escribir al archivo (lo pendiente se intenta guardar igual). Se llama en disable(). */
export function detenerRegistro() {
    activo = false;
}

/** @returns {string} Ruta del archivo de registro (para mostrarla en mensajes). */
export function rutaRegistro() {
    return RUTA_ARCHIVO;
}

/**
 * Mensaje informativo. Solo va al journal, salvo `alArchivo`.
 * @param {string} mensaje
 * @param {boolean} [alArchivo=false]
 */
export function registrarInfo(mensaje, alArchivo = false) {
    console.log(`${PREFIJO_LOG} ${mensaje}`);
    if (alArchivo)
        guardar('INFO', mensaje);
}

/**
 * Mensaje de depuración (solo visible con G_MESSAGES_DEBUG). No va al archivo.
 * @param {string} mensaje
 */
export function registrarDepuracion(mensaje) {
    console.debug(`${PREFIJO_LOG} ${mensaje}`);
}

/**
 * Algo inesperado pero no grave (ej. un reproductor que no responde).
 * @param {string} mensaje
 */
export function registrarAviso(mensaje) {
    console.warn(`${PREFIJO_LOG} ${mensaje}`);
    guardar('AVISO', mensaje);
}

/**
 * Error con su contexto y pila de llamadas completa.
 * @param {string} contexto - Dónde ocurrió (ej. "bluetooth: PropertiesChanged").
 * @param {*} error - Excepción capturada (o cualquier valor lanzado).
 */
export function registrarError(contexto, error) {
    const mensaje = error?.message ?? String(error);
    const pila = error?.stack ? `\n${error.stack.trim()}` : '';
    console.error(`${PREFIJO_LOG} ERROR en ${contexto}: ${mensaje}${pila}`);
    guardar('ERROR', `${contexto}: ${mensaje}${pila}`);
}

/**
 * Envuelve una función para que cualquier excepción quede registrada
 * con su contexto en lugar de propagarse y romper la isla.
 * Si la función devuelve una promesa, también se registra su rechazo.
 *
 * @param {string} contexto
 * @param {Function} funcion
 * @param {*} [valorSiFalla] - Lo que devuelve si falla (ej. Clutter.EVENT_PROPAGATE).
 * @returns {Function}
 */
export function protegido(contexto, funcion, valorSiFalla = undefined) {
    return (...argumentos) => {
        try {
            const resultado = funcion(...argumentos);
            if (resultado instanceof Promise)
                resultado.catch(error => registrarError(contexto, error));
            return resultado;
        } catch (error) {
            registrarError(contexto, error);
            return valorSiFalla;
        }
    };
}

/**
 * Ejecuta un paso de limpieza sin que su fallo impida los siguientes.
 * @param {string} contexto
 * @param {Function} paso
 */
export function intentar(contexto, paso) {
    try {
        paso();
    } catch (error) {
        registrarError(contexto, error);
    }
}

// ───────────────────────── Escritura al archivo ─────────────────────────

function guardar(nivel, mensaje) {
    if (!activo)
        return;
    const fecha = GLib.DateTime.new_now_local().format('%Y-%m-%d %H:%M:%S');
    pendientes.push(`[${fecha}] ${nivel.padEnd(5)} ${mensaje}\n`);
    if (!escribiendo)
        vaciarPendientes();
}

/** Escribe en bloque todo lo acumulado, de forma asíncrona y sin bloquear. */
function vaciarPendientes() {
    if (pendientes.length === 0) {
        escribiendo = false;
        return;
    }
    escribiendo = true;
    const texto = pendientes.join('');
    pendientes = [];

    const archivo = Gio.File.new_for_path(RUTA_ARCHIVO);
    archivo.append_to_async(Gio.FileCreateFlags.NONE, GLib.PRIORITY_LOW, null, (_archivo, resultado) => {
        let flujo;
        try {
            flujo = archivo.append_to_finish(resultado);
        } catch (error) {
            console.warn(`${PREFIJO_LOG} No se pudo abrir ${RUTA_ARCHIVO}: ${error.message}`);
            escribiendo = false;
            return;
        }

        const bytes = new GLib.Bytes(codificador.encode(texto));
        flujo.write_bytes_async(bytes, GLib.PRIORITY_LOW, null, (_flujo, resultadoEscritura) => {
            try {
                flujo.write_bytes_finish(resultadoEscritura);
            } catch (error) {
                console.warn(`${PREFIJO_LOG} No se pudo escribir el registro: ${error.message}`);
            }
            flujo.close_async(GLib.PRIORITY_LOW, null, () => vaciarPendientes());
        });
    });
}

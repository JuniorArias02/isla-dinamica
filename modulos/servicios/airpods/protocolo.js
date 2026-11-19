// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Protocolo AAP (Apple Accessory Protocol) de los AirPods — código PURO.
 *
 * Traduce los paquetes que envían los AirPods (y los clones que lo imitan)
 * por el canal L2CAP de Apple a objetos simples, y construye los paquetes
 * que la isla les envía. No abre conexiones ni depende de GNOME: se puede
 * probar con gjs sin audífonos.
 *
 * Formato general (bytes):
 *   04 00 04 00 | OP OP | datos...
 *   cabecera      código de operación (16 bits, little-endian)
 *
 * Basado en la documentación pública de la comunidad (proyecto LibrePods).
 * Los clones pueden implementar solo una parte: todo se interpreta de forma
 * defensiva y lo desconocido se devuelve como {tipo: 'desconocido'}.
 */

import {MODOS_RUIDO} from '../../constantes.js';

export {MODOS_RUIDO};

/** UUID del servicio AAP que anuncian los AirPods. */
export const UUID_AAP = '74ec2172-0bad-4d01-8f77-997b2be0722a';

/** Canal L2CAP (PSM) del protocolo AAP. */
export const PSM_AAP = 0x1001;

const CABECERA = [0x04, 0x00, 0x04, 0x00];

/** Códigos de operación conocidos. */
const OPERACIONES = Object.freeze({
    BATERIA: 0x0004,
    OIDO: 0x0006,
    CONTROL: 0x0009,
});

/** Dentro de CONTROL (0x09): ajuste de modo de escucha / ruido. */
const AJUSTE_MODO_RUIDO = 0x0D;

/**
 * Dónde está cada auricular.
 * @enum {string}
 */
export const POSICIONES = Object.freeze({
    EN_OIDO: 'en_oido',
    FUERA: 'fuera',
    EN_ESTUCHE: 'en_estuche',
    DESCONOCIDA: 'desconocida',
});

const COMPONENTES = Object.freeze({
    0x01: 'unico',
    0x02: 'derecho',
    0x04: 'izquierdo',
    0x08: 'estuche',
});

const ESTADO_CARGANDO = 0x01;
const ESTADO_DESCONECTADO = 0x04;

/** Paquetes que la isla envía al conectar, en este orden. */
export const PAQUETES_INICIO = Object.freeze([
    // Saludo: abre la sesión AAP.
    Uint8Array.from([0x00, 0x00, 0x04, 0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    // Activa funciones extra (necesario en algunos modelos para recibir todo).
    Uint8Array.from([...CABECERA, 0x4D, 0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    // Pide que nos avisen de batería, oído y modo de ruido.
    Uint8Array.from([...CABECERA, 0x0F, 0x00, 0xFF, 0xFF, 0xFF, 0xFF]),
]);

/**
 * Paquete para cambiar el modo de ruido.
 * @param {number} modo - Uno de MODOS_RUIDO.
 * @returns {Uint8Array}
 */
export function paqueteModoRuido(modo) {
    if (!Object.values(MODOS_RUIDO).includes(modo))
        throw new Error(`Modo de ruido inválido: ${modo}`);
    return Uint8Array.from([...CABECERA, OPERACIONES.CONTROL, 0x00, AJUSTE_MODO_RUIDO, modo, 0x00, 0x00, 0x00]);
}

/**
 * Bytes en hexadecimal legible (para el registro).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function aHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(' ');
}

/**
 * Interpreta un paquete recibido.
 * @param {Uint8Array} bytes
 * @returns {object} Uno de:
 *   {tipo: 'bateria', componentes: {izquierdo?, derecho?, estuche?, unico?}}
 *       cada componente = {nivel: 0–100, cargando: bool}
 *   {tipo: 'modoRuido', modo}
 *   {tipo: 'oido', primario, secundario}  (valores de POSICIONES)
 *   {tipo: 'desconocido', operacion}
 */
export function interpretarPaquete(bytes) {
    if (bytes.length < 6 || !CABECERA.every((b, i) => bytes[i] === b))
        return {tipo: 'desconocido', operacion: null};

    const operacion = bytes[4] | (bytes[5] << 8);

    switch (operacion) {
    case OPERACIONES.BATERIA:
        return interpretarBateria(bytes) ?? {tipo: 'desconocido', operacion};
    case OPERACIONES.OIDO:
        return interpretarOido(bytes) ?? {tipo: 'desconocido', operacion};
    case OPERACIONES.CONTROL:
        return interpretarControl(bytes) ?? {tipo: 'desconocido', operacion};
    default:
        return {tipo: 'desconocido', operacion};
    }
}

// ───────────────────────── Interpretación por tipo ─────────────────────────

/**
 * 04 00 04 00 04 00 | N | N × [componente, 01, nivel, estado, 01]
 */
function interpretarBateria(bytes) {
    const cantidad = bytes[6];
    if (cantidad === undefined || bytes.length < 7 + cantidad * 5)
        return null;

    const componentes = {};
    for (let i = 0; i < cantidad; i++) {
        const inicio = 7 + i * 5;
        const nombre = COMPONENTES[bytes[inicio]];
        const nivel = bytes[inicio + 2];
        const estado = bytes[inicio + 3];
        if (!nombre || estado === ESTADO_DESCONECTADO || nivel > 100)
            continue;
        componentes[nombre] = {nivel, cargando: estado === ESTADO_CARGANDO};
    }
    return {tipo: 'bateria', componentes};
}

/**
 * 04 00 04 00 06 00 | primario | secundario   (00 en oído, 01 fuera, 02 en estuche)
 */
function interpretarOido(bytes) {
    if (bytes.length < 8)
        return null;
    const traducir = valor => ({
        0x00: POSICIONES.EN_OIDO,
        0x01: POSICIONES.FUERA,
        0x02: POSICIONES.EN_ESTUCHE,
    })[valor] ?? POSICIONES.DESCONOCIDA;
    return {tipo: 'oido', primario: traducir(bytes[6]), secundario: traducir(bytes[7])};
}

/**
 * 04 00 04 00 09 00 | ajuste | valor ...
 */
function interpretarControl(bytes) {
    if (bytes.length < 8)
        return null;
    if (bytes[6] === AJUSTE_MODO_RUIDO && Object.values(MODOS_RUIDO).includes(bytes[7]))
        return {tipo: 'modoRuido', modo: bytes[7]};
    return null;
}

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Utilidades de formato de texto para la interfaz (sin actores).
 */

/**
 * Tiempo relativo en español: "ahora", "hace 3 min", "hace 2 h", "ayer".
 * Se recalcula cada vez que la isla se redibuja (al menos una vez por minuto,
 * porque el reloj actualiza la vista).
 *
 * @param {number} marcaTiempoMs - Momento en milisegundos (Date.now()).
 * @returns {string}
 */
export function formatearHace(marcaTiempoMs) {
    const segundos = Math.max(0, Math.floor((Date.now() - marcaTiempoMs) / 1000));
    if (segundos < 60)
        return 'ahora';
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60)
        return `hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24)
        return `hace ${horas} h`;
    return horas < 48 ? 'ayer' : `hace ${Math.floor(horas / 24)} días`;
}

/**
 * Texto de un contador de mensajes: "1 mensaje nuevo", "3 mensajes nuevos".
 * @param {number} cantidad
 * @returns {string}
 */
export function textoMensajesNuevos(cantidad) {
    return cantidad === 1 ? '1 mensaje nuevo' : `${cantidad} mensajes nuevos`;
}

/**
 * Cuenta atrás: "4:32", "1:04:32". Redondea hacia arriba (como los relojes:
 * se ve "0:01" hasta el último instante, nunca "0:00" antes de tiempo).
 * @param {number} milisegundos
 * @returns {string}
 */
export function formatearCuentaAtras(milisegundos) {
    const total = Math.max(0, Math.ceil(milisegundos / 1000));
    const horas = Math.floor(total / 3600);
    const minutos = Math.floor((total % 3600) / 60);
    const segundos = String(total % 60).padStart(2, '0');
    if (horas > 0)
        return `${horas}:${String(minutos).padStart(2, '0')}:${segundos}`;
    return `${minutos}:${segundos}`;
}

/**
 * Duración legible: "45 min", "1 h", "1 h 20 min".
 * @param {number} minutos
 * @returns {string}
 */
export function formatearDuracionMin(minutos) {
    const horas = Math.floor(minutos / 60);
    const resto = Math.round(minutos % 60);
    if (horas === 0)
        return `${resto} min`;
    return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

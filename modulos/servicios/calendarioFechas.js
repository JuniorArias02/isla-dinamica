// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Cálculos de fechas del calendario. Puro: sin GNOME, se prueba con gjs.
 */

/** Días que muestra la cuadrícula de GNOME (6 semanas). */
const DIAS_CUADRICULA = 42;

const MS_POR_HORA = 60 * 60 * 1000;
const MS_POR_DIA = 24 * MS_POR_HORA;

/**
 * Inicio y fin de la cuadrícula de 6 semanas del mes de `fecha`, con la misma
 * regla de relleno que el calendario de GNOME (ui/calendar.js · _rebuildCalendar).
 * Pedir exactamente este rango evita descuadrar el calendario del panel.
 * @param {Date} fecha
 * @param {number} inicioSemana - 0 = domingo … 6 = sábado.
 * @returns {{inicio: Date, fin: Date}}
 */
export function rangoCuadricula(fecha, inicioSemana) {
    const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
    const diasHastaInicio = (7 + inicio.getDay() - inicioSemana) % 7;
    const relleno = diasHastaInicio === 0 ? 7 : 0;
    inicio.setDate(inicio.getDate() - (relleno + diasHastaInicio));
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + DIAS_CUADRICULA);
    return {inicio, fin};
}

/**
 * ¿Ocupa días enteros? (empieza y termina a medianoche). Se admite una hora de
 * margen por los cambios de horario de verano.
 * @param {Date} inicio
 * @param {Date} fin
 * @returns {boolean}
 */
export function esTodoElDia(inicio, fin) {
    const aMedianoche = fecha => fecha.getHours() === 0 && fecha.getMinutes() === 0 && fecha.getSeconds() === 0;
    return aMedianoche(inicio) && aMedianoche(fin) && fin - inicio >= MS_POR_DIA - MS_POR_HORA;
}

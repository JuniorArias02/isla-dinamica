// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas de los cálculos de fechas del calendario.
 */

import {ejecutar, prueba, igual, verdadero} from '../utilidades.js';
import {rangoCuadricula, esTodoElDia} from '../../modulos/servicios/calendarioFechas.js';

const LUNES = 1;
const DOMINGO = 0;
const dia = fecha => `${fecha.getFullYear()}-${fecha.getMonth() + 1}-${fecha.getDate()}`;

ejecutar('Calendario', async () => {
    await prueba('noviembre 2026 (empieza en domingo, semana desde el lunes)', () => {
        const {inicio, fin} = rangoCuadricula(new Date(2026, 10, 19), LUNES);
        igual(dia(inicio), '2026-10-26');
        igual(dia(fin), '2026-12-7');
    });

    await prueba('un mes que empieza justo en el primer día de la semana se rellena una semana antes', () => {
        // 1 de junio de 2026 es lunes.
        const {inicio} = rangoCuadricula(new Date(2026, 5, 10), LUNES);
        igual(dia(inicio), '2026-5-25');
    });

    await prueba('con la semana desde el domingo', () => {
        // 1 de noviembre de 2026 es domingo → relleno de una semana.
        const {inicio} = rangoCuadricula(new Date(2026, 10, 19), DOMINGO);
        igual(dia(inicio), '2026-10-25');
    });

    await prueba('la cuadrícula siempre tiene 6 semanas y contiene todo el mes', () => {
        for (let mes = 0; mes < 12; mes++) {
            const {inicio, fin} = rangoCuadricula(new Date(2027, mes, 15), LUNES);
            const dias = Math.round((fin - inicio) / (24 * 60 * 60 * 1000));
            verdadero(dias === 42 || dias === 41 || dias === 43, `mes ${mes + 1}: ${dias} días`);
            verdadero(inicio <= new Date(2027, mes, 1) && fin > new Date(2027, mes + 1, 0), `mes ${mes + 1} completo`);
        }
    });

    await prueba('eventos de todo el día', () => {
        verdadero(esTodoElDia(new Date(2026, 10, 20), new Date(2026, 10, 21)), 'un día');
        verdadero(esTodoElDia(new Date(2026, 10, 20), new Date(2026, 10, 23)), 'varios días');
        verdadero(!esTodoElDia(new Date(2026, 10, 20, 9, 30), new Date(2026, 10, 20, 10, 30)), 'con hora');
        verdadero(!esTodoElDia(new Date(2026, 10, 20), new Date(2026, 10, 20, 12)), 'medio día');
    });
});

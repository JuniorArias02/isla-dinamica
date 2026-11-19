// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas del temporizador propio de la isla (con tiempos reales cortos).
 */

import {ejecutar, prueba, igual, verdadero, esperar} from '../utilidades.js';
import {Temporizador} from '../../modulos/servicios/temporizador.js';
import {ESTADOS_TEMPORIZADOR} from '../../modulos/constantes.js';

// Fuera del Shell no existe `global`: se simula el reproductor de sonidos.
let sonidos = 0;
globalThis.global = {display: {get_sound_player: () => ({play_from_theme: () => sonidos++})}};

ejecutar('Temporizador', async () => {
    await prueba('cuenta atrás y termina con sonido', async () => {
        const estados = [];
        const temporizador = new Temporizador(resumen => estados.push(resumen.estado));
        temporizador.iniciar(1000);
        igual(temporizador.resumen.estado, ESTADOS_TEMPORIZADOR.CORRIENDO);
        await esperar(1400);
        igual(temporizador.resumen.estado, ESTADOS_TEMPORIZADOR.TERMINADO);
        igual(sonidos, 1, 'sonidos');
        temporizador.destruir();
    });

    await prueba('el tiempo en pausa no cuenta', async () => {
        const temporizador = new Temporizador(() => {});
        temporizador.iniciar(5000);
        temporizador.pausar();
        const antes = temporizador.resumen.restanteMs;
        await esperar(600);
        igual(temporizador.resumen.restanteMs, antes, 'restante en pausa');
        igual(temporizador.resumen.estado, ESTADOS_TEMPORIZADOR.PAUSADO);
        temporizador.reanudar();
        igual(temporizador.resumen.estado, ESTADOS_TEMPORIZADOR.CORRIENDO);
        temporizador.destruir();
    });

    await prueba('sumar tiempo alarga la cuenta y el total', () => {
        const temporizador = new Temporizador(() => {});
        temporizador.iniciar(5000);
        temporizador.sumar(60000);
        igual(temporizador.resumen.totalMs, 65000);
        verdadero(temporizador.resumen.restanteMs > 60000, 'debe quedar más de 1 min');
        temporizador.destruir();
    });

    await prueba('cancelar lo deja inactivo', () => {
        const temporizador = new Temporizador(() => {});
        temporizador.iniciar(5000);
        temporizador.cancelar();
        igual(temporizador.resumen.estado, ESTADOS_TEMPORIZADOR.INACTIVO);
        temporizador.destruir();
    });

    await prueba('una duración inválida no arranca nada', () => {
        const temporizador = new Temporizador(() => {});
        temporizador.iniciar(0);
        temporizador.iniciar(-5);
        igual(temporizador.resumen.estado, ESTADOS_TEMPORIZADOR.INACTIVO);
        temporizador.destruir();
    });
});

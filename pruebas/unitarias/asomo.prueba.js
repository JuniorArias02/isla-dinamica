// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas de las cuentas del gesto de asomarse a la vista de al lado.
 */

import {ejecutar, prueba, igual, verdadero} from '../utilidades.js';
import {
    sentidoDeArrastre,
    direccionDeSentido,
    progresoDeArrastre,
    debeConfirmarAsomo,
    direccionCambioDirecto,
} from '../../modulos/ui/logicaAsomo.js';
import {
    DISTANCIA_ASOMO_PX,
    EXCESO_MAXIMO_ASOMO,
    UMBRAL_INICIO_ASOMO_PX,
    UMBRAL_ARRASTRE_VISTA_PX,
} from '../../modulos/constantes.js';

ejecutar('Asomo', async () => {
    await prueba('un movimiento mínimo no empieza el asomo', () => {
        igual(sentidoDeArrastre(UMBRAL_INICIO_ASOMO_PX - 1), 0);
        igual(sentidoDeArrastre(UMBRAL_INICIO_ASOMO_PX), 1);
        igual(sentidoDeArrastre(-UMBRAL_INICIO_ASOMO_PX), -1);
    });

    await prueba('de izquierda a derecha se asoma a la siguiente; al revés, a la anterior', () => {
        igual(direccionDeSentido(1), 1);
        igual(direccionDeSentido(-1), -1);
    });

    await prueba('el progreso sigue al puntero y vuelve a 0 al regresar sin soltar', () => {
        igual(progresoDeArrastre(0, 1), 0);
        igual(progresoDeArrastre(DISTANCIA_ASOMO_PX / 2, 1), 0.5);
        igual(progresoDeArrastre(DISTANCIA_ASOMO_PX, 1), 1);
        igual(progresoDeArrastre(-DISTANCIA_ASOMO_PX / 4, -1), 0.25, 'hacia la izquierda también cuenta');
        // Ida →→→ y vuelta ←←← hasta pasarse del punto de partida: queda como estaba.
        igual(progresoDeArrastre(-30, 1), 0);
    });

    await prueba('pasado el final, crece poco y nunca más del máximo', () => {
        const pasado = progresoDeArrastre(DISTANCIA_ASOMO_PX * 2, 1);
        verdadero(pasado > 1 && pasado < 1 + EXCESO_MAXIMO_ASOMO, `progreso pasado el final: ${pasado}`);
        verdadero(progresoDeArrastre(DISTANCIA_ASOMO_PX * 50, 1) < 1 + EXCESO_MAXIMO_ASOMO, 'con un arrastre enorme');
    });

    await prueba('al soltar: se queda desde la mitad, o con un gesto rápido hacia delante', () => {
        verdadero(!debeConfirmarAsomo(0.3, 0), 'soltar en un 30 % sin velocidad vuelve');
        verdadero(debeConfirmarAsomo(0.6, 0), 'soltar pasada la mitad se queda');
        verdadero(debeConfirmarAsomo(0.2, 1.2), 'un gesto rápido hacia delante se queda');
        verdadero(!debeConfirmarAsomo(0.05, 1.2), 'un roce rápido no basta');
        verdadero(!debeConfirmarAsomo(0.8, -1.2), 'volviendo rápido hacia atrás no se queda');
    });

    await prueba('"Cambiar al instante": como en la 1.0, de derecha a izquierda avanza y un arrastre corto no cambia', () => {
        igual(direccionCambioDirecto(-(UMBRAL_ARRASTRE_VISTA_PX + 1), 0), 1);
        igual(direccionCambioDirecto(UMBRAL_ARRASTRE_VISTA_PX + 1, 0), -1);
        igual(direccionCambioDirecto(10, 0), 0, 'arrastre corto y lento');
        igual(direccionCambioDirecto(-10, -1.2), 1, 'arrastre corto pero rápido');
    });
});

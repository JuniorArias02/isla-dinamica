// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas del protocolo AAP de los AirPods: interpretación y construcción de paquetes.
 */

import {ejecutar, prueba, igual, verdadero} from '../utilidades.js';
import {
    interpretarPaquete,
    paqueteModoRuido,
    aHex,
    POSICIONES,
    MODOS_RUIDO,
} from '../../modulos/servicios/airpods/protocolo.js';

const paquete = (...bytes) => Uint8Array.from(bytes);

ejecutar('Protocolo AirPods (AAP)', async () => {
    await prueba('batería: izquierdo, derecho y estuche', () => {
        const resultado = interpretarPaquete(paquete(
            0x04, 0x00, 0x04, 0x00, 0x04, 0x00, 0x03,
            0x04, 0x01, 50, 0x02, 0x01,     // izquierdo 50 %, descargando
            0x02, 0x01, 24, 0x02, 0x01,     // derecho 24 %, descargando
            0x08, 0x01, 100, 0x01, 0x01));  // estuche 100 %, cargando
        igual(resultado, {
            tipo: 'bateria',
            componentes: {
                izquierdo: {nivel: 50, cargando: false},
                derecho: {nivel: 24, cargando: false},
                estuche: {nivel: 100, cargando: true},
            },
        });
    });

    await prueba('batería: se ignoran las piezas desconectadas', () => {
        const resultado = interpretarPaquete(paquete(
            0x04, 0x00, 0x04, 0x00, 0x04, 0x00, 0x02,
            0x04, 0x01, 80, 0x02, 0x01,
            0x08, 0x01, 0, 0x04, 0x01));    // estuche desconectado
        igual(Object.keys(resultado.componentes), ['izquierdo']);
    });

    await prueba('batería: un paquete cortado no rompe nada', () => {
        igual(interpretarPaquete(paquete(0x04, 0x00, 0x04, 0x00, 0x04, 0x00, 0x03, 0x04)).tipo, 'desconocido');
    });

    await prueba('detección de oído', () => {
        igual(interpretarPaquete(paquete(0x04, 0x00, 0x04, 0x00, 0x06, 0x00, 0x00, 0x02)),
            {tipo: 'oido', primario: POSICIONES.EN_OIDO, secundario: POSICIONES.EN_ESTUCHE});
    });

    await prueba('modo de ruido recibido', () => {
        igual(interpretarPaquete(paquete(0x04, 0x00, 0x04, 0x00, 0x09, 0x00, 0x0D, MODOS_RUIDO.CANCELACION, 0, 0, 0)),
            {tipo: 'modoRuido', modo: MODOS_RUIDO.CANCELACION});
    });

    await prueba('paquete para cambiar el modo de ruido', () => {
        igual(aHex(paqueteModoRuido(MODOS_RUIDO.TRANSPARENCIA)), '04 00 04 00 09 00 0d 03 00 00 00');
    });

    await prueba('un modo de ruido inválido se rechaza', () => {
        let rechazado = false;
        try {
            paqueteModoRuido(0x99);
        } catch {
            rechazado = true;
        }
        verdadero(rechazado, 'debe lanzar un error');
    });

    await prueba('cabecera desconocida', () => {
        igual(interpretarPaquete(paquete(0x01, 0x02, 0x03)), {tipo: 'desconocido', operacion: null});
    });
});

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas del reconocedor de apps de las notificaciones.
 */

import {ejecutar, prueba, igual} from '../utilidades.js';
import {reconocerApp, separarOrigen} from '../../modulos/servicios/notificaciones/reconocedorApps.js';

const nombre = pistas => reconocerApp(pistas)?.nombre ?? null;

ejecutar('Reconocedor de apps', async () => {
    await prueba('WhatsApp Web por el id de la app de Brave', () => {
        igual(nombre({nombreApp: 'Brave', idApp: 'brave-hnpfjngllnobngcgfapefoaidbinmjnm-Default.desktop'}), 'WhatsApp');
    });

    await prueba('WhatsApp Web por el nombre', () => {
        igual(nombre({nombreApp: 'WhatsApp Web'}), 'WhatsApp');
    });

    await prueba('WhatsApp Web por la web de origen', () => {
        const {origen} = separarOrigen('web.whatsapp.com\nHola, ¿cómo vas?');
        igual(nombre({nombreApp: 'Brave', origen}), 'WhatsApp');
    });

    await prueba('Telegram Web', () => {
        igual(nombre({nombreApp: 'Brave', idApp: 'brave-ibblmnobmgdmpoeblocemifbpglakpoi-Default.desktop'}), 'Telegram');
    });

    await prueba('una app del sistema no se reconoce como chat', () => {
        igual(nombre({nombreApp: 'Configuración'}), null);
    });

    await prueba('sin pistas no se reconoce nada', () => {
        igual(nombre({}), null);
    });

    await prueba('separar la web de origen del texto', () => {
        igual(separarOrigen('web.whatsapp.com\nHola\nTodo bien'), {origen: 'web.whatsapp.com', texto: 'Hola Todo bien'});
    });

    await prueba('un mensaje que solo es una web no pierde el texto', () => {
        igual(separarOrigen('google.com'), {origen: null, texto: 'google.com'});
    });
});

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas del reconocedor de llamadas: avisos de llamada y llamada en curso.
 */

import {ejecutar, prueba, igual, verdadero} from '../utilidades.js';
import {
    reconocerLlamadaEntrante,
    clasificarFlujo,
    detectarLlamada,
} from '../../modulos/servicios/llamadas/reconocedorLlamadas.js';

const CHROME = {idApp: '', nombre: 'Google Chrome', icono: 'google-chrome'};
const BRAVE = {idApp: '', nombre: 'Brave', icono: 'brave-browser'};

ejecutar('Llamadas', async () => {
    await prueba('una llamada de WhatsApp con botones se reconoce y sabe cuál contesta', () => {
        const llamada = reconocerLlamadaEntrante({
            titulo: 'Ana', texto: 'Llamada de voz entrante', botones: ['Rechazar', 'Contestar'],
        });
        igual(llamada, {esVideo: false, contestar: 1, rechazar: 0});
    });

    await prueba('el aviso real de WhatsApp Web en Brave (crítico, con "Aceptar" y "Rechazar") se reconoce', () => {
        // Tal como lo manda Brave: la web en la primera línea, una línea vacía y "Llamada entrante".
        const llamada = reconocerLlamadaEntrante({
            titulo: 'Ana Ruiz', texto: 'Llamada entrante', botones: ['Aceptar', 'Rechazar', 'Configuración'],
        });
        igual(llamada, {esVideo: false, contestar: 0, rechazar: 1});
    });

    await prueba('una videollamada sin botones se reconoce (se contestará abriendo la app)', () => {
        igual(reconocerLlamadaEntrante({titulo: 'Luis', texto: 'Videollamada entrante'}),
            {esVideo: true, contestar: -1, rechazar: -1});
        verdadero(reconocerLlamadaEntrante({titulo: 'Meet', texto: 'Luis is calling you'}), 'en inglés');
    });

    await prueba('una llamada perdida o un mensaje normal no son llamadas sonando', () => {
        igual(reconocerLlamadaEntrante({titulo: 'Ana', texto: 'Llamada perdida'}), null);
        igual(reconocerLlamadaEntrante({titulo: 'Ana', texto: 'Hola, ¿cómo estás?'}), null);
        igual(reconocerLlamadaEntrante({titulo: 'Ana', texto: 'Mañana te llamo', botones: ['Responder']}), null,
            'un botón de responder un mensaje no es una llamada');
    });

    await prueba('el micrófono: navegadores y apps de llamadas', () => {
        igual(clasificarFlujo(CHROME), {tipo: 'navegador'});
        igual(clasificarFlujo(BRAVE), {tipo: 'navegador'});
        igual(clasificarFlujo({nombre: 'Firefox'}), {tipo: 'navegador'});
        igual(clasificarFlujo({idApp: 'us.zoom.Zoom', nombre: 'ZOOM VoiceEngine'}), {tipo: 'app', id: 'zoom', nombre: 'Zoom'});
        igual(clasificarFlujo({nombre: 'Grabadora de sonido', idApp: 'org.gnome.SoundRecorder'}), null);
    });

    await prueba('Meet en Chrome o en Brave es una llamada', () => {
        const ventanas = [{titulo: 'Bandeja de entrada - Gmail - Google Chrome'}, {titulo: 'Meet - abc-defg-hij - Google Chrome'}];
        igual(detectarLlamada({flujos: [CHROME], ventanas}), {id: 'meet', nombre: 'Google Meet', ventana: 1});
        igual(detectarLlamada({flujos: [BRAVE], ventanas: [{titulo: 'Meet - xyz - Brave'}]})?.id, 'meet');
    });

    await prueba('WhatsApp Web solo es llamada si sonó una o el título lo dice (no una nota de voz)', () => {
        const ventanas = [{titulo: 'WhatsApp', idApp: 'brave-hnpfjngllnobngcgfapefoaidbinmjnm-Default.desktop'}];
        igual(detectarLlamada({flujos: [BRAVE], ventanas}), null, 'grabando una nota de voz');
        igual(detectarLlamada({flujos: [BRAVE], ventanas, entrante: {id: 'whatsapp', nombre: 'WhatsApp', hace: 5000}}),
            {id: 'whatsapp', nombre: 'WhatsApp', ventana: 0});
        igual(detectarLlamada({flujos: [BRAVE], ventanas, entrante: {id: 'whatsapp', nombre: 'WhatsApp', hace: 600000}}),
            null, 'una llamada que sonó hace 10 minutos ya no cuenta');
        igual(detectarLlamada({flujos: [CHROME], ventanas: [{titulo: 'Llamada de voz - WhatsApp - Google Chrome'}]})?.id,
            'whatsapp');
    });

    await prueba('sin micrófono en uso, o con un programa que no llama, no hay llamada', () => {
        igual(detectarLlamada({flujos: [], ventanas: [{titulo: 'Meet - abc'}]}), null);
        igual(detectarLlamada({flujos: [{nombre: 'Audacity'}], ventanas: [{titulo: 'Meet - abc'}]}), null);
        igual(detectarLlamada({flujos: [CHROME], ventanas: [{titulo: 'YouTube - Google Chrome'}]}), null,
            'el navegador usando el micrófono en otra web (dictado, búsqueda por voz)');
    });

    await prueba('una app de llamadas cuenta aunque no se vea su ventana', () => {
        igual(detectarLlamada({flujos: [{idApp: 'com.discordapp.Discord', nombre: 'Discord'}], ventanas: []}),
            {id: 'discord', nombre: 'Discord', ventana: -1});
    });
});

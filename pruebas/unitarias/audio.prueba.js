// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas del reconocedor de audio: música o audio de un chat.
 */

import {ejecutar, prueba, igual} from '../utilidades.js';
import {clasificarAudio} from '../../modulos/servicios/reconocedorAudio.js';

const tipo = pista => clasificarAudio(pista).tipo;

ejecutar('Audio', async () => {
    await prueba('un audio de WhatsApp Web (como lo manda Brave: la web de título, sin artista)', () => {
        const {tipo: clase, app} = clasificarAudio({titulo: 'web.whatsapp.com', artista: ''});
        igual(clase, 'audio');
        igual(app.id, 'whatsapp');
        igual(app.nombre, 'WhatsApp');
    });

    await prueba('Telegram Web también es un audio de chat', () => {
        igual(tipo({titulo: 'web.telegram.org', artista: ''}), 'audio');
    });

    await prueba('una canción es música, aunque venga de una web', () => {
        igual(tipo({titulo: 'Blank Space', artista: 'Taylor Swift'}), 'musica');
        igual(tipo({titulo: 'music.youtube.com', artista: ''}), 'musica', 'una web que no es un chat');
        igual(tipo({titulo: 'web.whatsapp.com', artista: 'Alguien'}), 'musica', 'con artista, no es el título genérico');
    });

    await prueba('sin datos no se rompe', () => {
        igual(tipo({}), 'musica');
    });
});

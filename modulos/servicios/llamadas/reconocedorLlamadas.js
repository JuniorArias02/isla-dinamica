// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Reconocedor de llamadas — código PURO (sin GNOME, se puede probar con gjs).
 *
 * Responde a dos preguntas:
 *
 *   1. ¿Esta notificación es una llamada que está sonando? (WhatsApp, Meet,
 *      Telegram, Teams...). Se mira el texto y los botones que trae. Los botones
 *      de "Contestar" / "Rechazar", si existen, se pueden pulsar desde la isla.
 *
 *   2. ¿Hay una llamada en curso? Se mira quién usa el micrófono:
 *      - una app de llamadas (Zoom, Teams, Discord...) → sí;
 *      - un navegador (Chrome, Brave, Firefox, Edge...) → sí, si alguna de sus
 *        ventanas es una llamada (Meet, Zoom, Teams, Jitsi... por el título), o si
 *        acaba de sonar una llamada de una app web (WhatsApp, Telegram...).
 *      Usar el micrófono para otra cosa (una nota de voz, dictar) no cuenta.
 *
 * Para añadir una app o una web nueva basta con agregarla a las listas.
 */

/** Palabras de una llamada entrante (español, inglés y portugués). */
const PATRON_LLAMADA = /\b(?:llamada|videollamada|llamando|te est[aá] llamando|incoming (?:voice |video )?call|is calling|calling you|video call|voice call|chamada|ligando|appel)\b/i;

/** Avisos que hablan de una llamada pero no están sonando. */
const PATRON_NO_SONANDO = /perdida|perdidas|missed|no contestada|não atendida|terminad|finalizad|ended|devolver/i;

/** Palabras de videollamada. */
const PATRON_VIDEO = /video/i;

/** Texto de los botones que contestan o rechazan. */
const PATRON_CONTESTAR = /^(?:contestar|responder|aceptar|atender|unirse|unirme|answer|accept|join|pick up|atender chamada)/i;
const PATRON_RECHAZAR = /^(?:rechazar|colgar|declinar|ignorar|decline|reject|ignore|hang up|recusar)/i;

/**
 * Navegadores: si usan el micrófono, hay que mirar sus ventanas para saber si es una llamada.
 * Se reconocen por el id de la app, el nombre del flujo de audio o la clase de la ventana.
 */
const PATRON_NAVEGADOR = /chrome|chromium|brave|firefox|mozilla|edge|msedge|opera|vivaldi|epiphany|webkit|librewolf|zen/i;

/**
 * Apps de escritorio que usan el micrófono para llamar.
 * `patron` coincide con el id de la app, el nombre del flujo o la clase de la ventana.
 */
export const APPS_DE_LLAMADA = Object.freeze([
    {id: 'zoom', nombre: 'Zoom', patron: /zoom/i},
    {id: 'teams', nombre: 'Teams', patron: /teams/i},
    {id: 'discord', nombre: 'Discord', patron: /discord|vesktop/i},
    {id: 'slack', nombre: 'Slack', patron: /slack/i},
    {id: 'skype', nombre: 'Skype', patron: /skype/i},
    {id: 'telegram', nombre: 'Telegram', patron: /telegram/i},
    {id: 'signal', nombre: 'Signal', patron: /signal/i},
    {id: 'whatsapp', nombre: 'WhatsApp', patron: /whatsapp|zapzap/i},
    {id: 'webex', nombre: 'Webex', patron: /webex/i},
    {id: 'jitsi', nombre: 'Jitsi Meet', patron: /jitsi/i},
]);

/**
 * Webs de llamadas, por el título de la ventana del navegador (Chromium pone el de
 * la pestaña visible, ej. "Meet - abc-defg-hij - Google Chrome").
 * `conPalabraLlamada`: la web también se usa para otras cosas (chatear): solo cuenta
 * si el título habla de una llamada o si acaba de sonar una llamada suya.
 */
export const WEBS_DE_LLAMADA = Object.freeze([
    {id: 'meet', nombre: 'Google Meet', patron: /^meet\b|google meet|meet\.google\.com/i},
    {id: 'zoom', nombre: 'Zoom', patron: /\bzoom\b/i},
    {id: 'teams', nombre: 'Teams', patron: /microsoft teams|\bteams\b.*\b(?:llamada|reunión|call|meeting)\b/i},
    {id: 'jitsi', nombre: 'Jitsi Meet', patron: /jitsi/i},
    {id: 'webex', nombre: 'Webex', patron: /webex/i},
    {id: 'discord', nombre: 'Discord', patron: /discord/i},
    {id: 'whatsapp', nombre: 'WhatsApp', patron: /whatsapp/i, conPalabraLlamada: true},
    {id: 'telegram', nombre: 'Telegram', patron: /telegram/i, conPalabraLlamada: true},
    {id: 'messenger', nombre: 'Messenger', patron: /messenger|facebook/i, conPalabraLlamada: true},
    {id: 'slack', nombre: 'Slack', patron: /slack.*\b(?:huddle|llamada|call)\b/i},
]);

/** Si sonó una llamada de una app web hace menos de esto, el micrófono del navegador es esa llamada. */
export const VENTANA_LLAMADA_ENTRANTE_MS = 90000;

/**
 * ¿La notificación es una llamada sonando?
 * @param {object} notificacion
 * @param {string} [notificacion.titulo]
 * @param {string} [notificacion.texto]
 * @param {string[]} [notificacion.botones] - Texto de sus botones.
 * @returns {{esVideo: boolean, contestar: number, rechazar: number}|null}
 *   null si no es una llamada. `contestar` / `rechazar`: posición del botón, o -1.
 */
export function reconocerLlamadaEntrante({titulo = '', texto = '', botones = []}) {
    const contenido = `${titulo}\n${texto}`;
    const contestar = botones.findIndex(boton => PATRON_CONTESTAR.test(boton.trim()));
    const rechazar = botones.findIndex(boton => PATRON_RECHAZAR.test(boton.trim()));
    const hablaDeLlamada = PATRON_LLAMADA.test(contenido);

    if (PATRON_NO_SONANDO.test(contenido))
        return null;
    // Un botón de "Contestar" solo cuenta junto a la palabra llamada o a un "Rechazar".
    if (!hablaDeLlamada && !(contestar >= 0 && rechazar >= 0))
        return null;
    return {esVideo: PATRON_VIDEO.test(contenido), contestar, rechazar};
}

/**
 * ¿Quién usa el micrófono? (un flujo de grabación de audio).
 * @param {{idApp?: string, nombre?: string, icono?: string}} flujo
 * @returns {{tipo: 'app', id: string, nombre: string}|{tipo: 'navegador'}|null}
 */
export function clasificarFlujo({idApp = '', nombre = '', icono = ''}) {
    const pistas = `${idApp} ${nombre} ${icono}`;
    const app = APPS_DE_LLAMADA.find(conocida => conocida.patron.test(pistas));
    // Una web instalada como app (WhatsApp Web de Brave) es el navegador: se decide por sus ventanas.
    if (app && !PATRON_NAVEGADOR.test(pistas))
        return {tipo: 'app', id: app.id, nombre: app.nombre};
    if (PATRON_NAVEGADOR.test(pistas))
        return {tipo: 'navegador'};
    return null;
}

/**
 * ¿Hay una llamada en curso?
 * @param {object} estado
 * @param {Array<{idApp?: string, nombre?: string, icono?: string}>} estado.flujos - Quién graba audio.
 * @param {Array<{titulo?: string, idApp?: string, clase?: string}>} estado.ventanas - Ventanas abiertas.
 * @param {{id: string, nombre: string, hace: number}|null} [estado.entrante] - Última llamada que sonó (hace = ms).
 * @returns {{id: string, nombre: string, ventana: number}|null}
 *   La llamada y la posición de su ventana en `ventanas` (o -1 si no se sabe).
 */
export function detectarLlamada({flujos, ventanas, entrante = null}) {
    const tipos = flujos.map(clasificarFlujo).filter(Boolean);

    // 1. Una app de llamadas usa el micrófono.
    const app = tipos.find(tipo => tipo.tipo === 'app');
    if (app) {
        const conocida = APPS_DE_LLAMADA.find(a => a.id === app.id);
        const ventana = ventanas.findIndex(v => conocida.patron.test(`${v.idApp ?? ''} ${v.clase ?? ''} ${v.titulo ?? ''}`));
        return {id: app.id, nombre: app.nombre, ventana};
    }

    if (!tipos.some(tipo => tipo.tipo === 'navegador'))
        return null;

    // 2. Un navegador usa el micrófono: ¿alguna ventana es una llamada?
    const sonoHacePoco = entrante && entrante.hace < VENTANA_LLAMADA_ENTRANTE_MS ? entrante : null;
    for (const web of WEBS_DE_LLAMADA) {
        const ventana = ventanas.findIndex(v => {
            const titulo = v.titulo ?? '';
            if (!web.patron.test(titulo) && !web.patron.test(`${v.idApp ?? ''} ${v.clase ?? ''}`))
                return false;
            if (!web.conPalabraLlamada)
                return web.patron.test(titulo);
            return PATRON_LLAMADA.test(titulo) || sonoHacePoco?.id === web.id;
        });
        if (ventana >= 0)
            return {id: web.id, nombre: web.nombre, ventana};
    }

    // 3. Acaba de sonar una llamada (ej. de WhatsApp Web) y el navegador empezó a usar el micrófono.
    if (sonoHacePoco) {
        const web = WEBS_DE_LLAMADA.find(w => w.id === sonoHacePoco.id);
        const ventana = web ? ventanas.findIndex(v => web.patron.test(`${v.titulo ?? ''} ${v.idApp ?? ''} ${v.clase ?? ''}`)) : -1;
        return {id: sonoHacePoco.id, nombre: sonoHacePoco.nombre, ventana};
    }
    return null;
}

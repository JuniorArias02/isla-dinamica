/**
 * Reconocedor de apps — código PURO (sin GNOME, se puede probar con gjs).
 *
 * Las notificaciones de WhatsApp Web, Telegram Web, etc. llegan a GNOME como
 * si fueran de "Brave". Aquí se decide de qué app vienen realmente, usando
 * varias pistas a la vez:
 *   - el nombre que manda la app (ej. "WhatsApp Web"),
 *   - el id del .desktop (las apps de Brave usan "brave-<id>-Default"),
 *   - la web de origen si aparece en el texto (ej. "web.whatsapp.com").
 *
 * Para añadir una app nueva basta con agregarla a APPS_CONOCIDAS.
 */

/**
 * @typedef {object} AppConocida
 * @property {string} id - Identificador interno (ej. 'whatsapp').
 * @property {string} nombre - Nombre a mostrar.
 * @property {string[]} entradasEscritorio - .desktop (sin extensión) donde buscar su icono real.
 * @property {RegExp} patron - Coincide con nombre de app, id o web de origen.
 * @property {boolean} esChat - Si sus notificaciones son mensajes (se agrupan por chat).
 */

/** @type {AppConocida[]} */
export const APPS_CONOCIDAS = Object.freeze([
    {
        id: 'whatsapp',
        nombre: 'WhatsApp',
        // App de Brave/Chrome para web.whatsapp.com, y clientes nativos conocidos.
        entradasEscritorio: [
            'brave-hnpfjngllnobngcgfapefoaidbinmjnm-Default',
            'chrome-hnpfjngllnobngcgfapefoaidbinmjnm-Default',
            'com.rtosta.zapzap',
            'io.github.mimbrero.WhatsAppDesktop',
            'whatsapp-for-linux',
        ],
        patron: /whatsapp|hnpfjngllnobngcgfapefoaidbinmjnm|zapzap/i,
        esChat: true,
    },
    {
        id: 'telegram',
        nombre: 'Telegram',
        entradasEscritorio: [
            'brave-ibblmnobmgdmpoeblocemifbpglakpoi-Default',
            'org.telegram.desktop',
            'telegramdesktop',
        ],
        patron: /telegram|ibblmnobmgdmpoeblocemifbpglakpoi/i,
        esChat: true,
    },
    {
        id: 'discord',
        nombre: 'Discord',
        entradasEscritorio: ['discord', 'com.discordapp.Discord'],
        patron: /discord/i,
        esChat: true,
    },
    {
        id: 'slack',
        nombre: 'Slack',
        entradasEscritorio: ['slack', 'com.slack.Slack'],
        patron: /slack/i,
        esChat: true,
    },
    {
        id: 'gmail',
        nombre: 'Gmail',
        entradasEscritorio: [],
        patron: /mail\.google\.com|gmail/i,
        esChat: false,
    },
]);

/** Webs que el navegador puede poner como primera línea del texto. */
const PATRON_WEB = /^(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/?$/i;

/**
 * Separa la web de origen del texto, si el navegador la incluyó en una línea aparte.
 * @param {string} texto - Cuerpo de la notificación (ya sin marcado).
 * @returns {{origen: string|null, texto: string}}
 */
export function separarOrigen(texto) {
    const lineas = (texto ?? '').split('\n').map(l => l.trim()).filter(Boolean);
    // Solo cuenta como origen la PRIMERA línea y si hay más texto después
    // (así un mensaje que solo dice "google.com" no se pierde).
    const coincidencia = lineas.length > 1 ? lineas[0].match(PATRON_WEB) : null;
    if (coincidencia)
        return {origen: coincidencia[1].toLowerCase(), texto: lineas.slice(1).join(' ')};
    return {origen: null, texto: lineas.join(' ')};
}

/**
 * Decide de qué app conocida viene una notificación.
 * @param {object} pistas
 * @param {string} [pistas.nombreApp] - Nombre que mandó la app (ej. "Brave", "WhatsApp Web").
 * @param {string} [pistas.idApp] - Id del .desktop (ej. "brave-hnpf...-Default.desktop").
 * @param {string} [pistas.origen] - Web de origen (ej. "web.whatsapp.com").
 * @returns {AppConocida|null}
 */
export function reconocerApp({nombreApp, idApp, origen}) {
    const pistas = [nombreApp, idApp, origen].filter(Boolean).join(' ');
    if (!pistas)
        return null;
    return APPS_CONOCIDAS.find(app => app.patron.test(pistas)) ?? null;
}

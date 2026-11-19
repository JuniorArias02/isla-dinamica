// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Ajustes — único punto de acceso a las opciones del usuario (GSettings).
 *
 * Las opciones viven en schemas/org.gnome.shell.extensions.isla-dinamica.gschema.xml
 * y se editan desde la ventana de ajustes (prefs.js). Cada parte de la isla las
 * LEE EN EL MOMENTO DE USARLAS (ajuste(clave)), así un cambio se aplica al
 * instante sin reiniciar nada. Lo que necesita reaccionar enseguida (ej. volver a
 * mostrar el reloj de Ubuntu) se suscribe con alCambiarAjuste().
 *
 * Como registro.js, lo pueden importar todas las capas. Solo depende de Gio,
 * así que también sirve en prefs.js (que corre en otro proceso, sin Shell).
 */

/**
 * Claves de las opciones (deben coincidir con el esquema).
 * @enum {string}
 */
export const AJUSTES = Object.freeze({
    NOTIFICACIONES_PRIVADAS: 'notificaciones-privadas',
    NOTIFICAR_EN_NO_MOLESTAR: 'notificar-en-no-molestar',
    DURACION_NOTIFICACIONES_MS: 'duracion-notificaciones-ms',
    ABRIR_CON_PUNTERO: 'abrir-con-puntero',
    TIEMPO_CIERRE_MS: 'tiempo-cierre-ms',
    OCULTAR_RELOJ_GNOME: 'ocultar-reloj-gnome',
    FORZAR_ANIMACIONES: 'forzar-animaciones',
    MOSTRAR_VOLUMEN_BRILLO: 'mostrar-volumen-brillo',
    AVISAR_CARGADOR: 'avisar-cargador',
    AVISAR_COPIADO: 'avisar-copiado',
    MOSTRAR_PRIVACIDAD: 'mostrar-privacidad',
});

/**
 * Valores por defecto si aún no hay GSettings (ej. pruebas fuera del Shell).
 * Deben coincidir con los <default> del esquema.
 */
const POR_DEFECTO = Object.freeze({
    [AJUSTES.NOTIFICACIONES_PRIVADAS]: false,
    [AJUSTES.NOTIFICAR_EN_NO_MOLESTAR]: true,
    [AJUSTES.DURACION_NOTIFICACIONES_MS]: 4500,
    [AJUSTES.ABRIR_CON_PUNTERO]: false,
    [AJUSTES.TIEMPO_CIERRE_MS]: 3000,
    [AJUSTES.OCULTAR_RELOJ_GNOME]: true,
    [AJUSTES.FORZAR_ANIMACIONES]: true,
    [AJUSTES.MOSTRAR_VOLUMEN_BRILLO]: true,
    [AJUSTES.AVISAR_CARGADOR]: true,
    [AJUSTES.AVISAR_COPIADO]: true,
    [AJUSTES.MOSTRAR_PRIVACIDAD]: true,
});

/** @type {Gio.Settings|null} */
let ajustes = null;

/**
 * Conecta con GSettings. Se llama en enable() con `this.getSettings()`.
 * @param {Gio.Settings} configuracion
 */
export function configurarAjustes(configuracion) {
    ajustes = configuracion;
}

/** Suelta GSettings y todas las suscripciones. Se llama en disable(). */
export function liberarAjustes() {
    ajustes = null;
}

/**
 * Valor actual de una opción.
 * @param {string} clave - Una de AJUSTES.
 * @returns {boolean|number}
 */
export function ajuste(clave) {
    if (!ajustes)
        return POR_DEFECTO[clave];
    return ajustes.get_value(clave).deepUnpack();
}

/**
 * Avisa cuando una opción cambia (para lo que debe reaccionar al instante).
 * @param {string} clave - Una de AJUSTES.
 * @param {Function} alCambiar - Recibe el valor nuevo.
 * @param {object} dueno - Objeto para desconectar luego con dejarDeEscucharAjustes(dueno).
 */
export function alCambiarAjuste(clave, alCambiar, dueno) {
    ajustes?.connectObject(`changed::${clave}`, () => alCambiar(ajuste(clave)), dueno);
}

/**
 * Avisa ante CUALQUIER cambio de opciones (ej. para redibujar la isla).
 * @param {Function} alCambiar - Recibe la clave que cambió.
 * @param {object} dueno
 */
export function alCambiarCualquierAjuste(alCambiar, dueno) {
    ajustes?.connectObject('changed', (_ajustes, clave) => alCambiar(clave), dueno);
}

/**
 * Desconecta todas las suscripciones de un dueño.
 * @param {object} dueno
 */
export function dejarDeEscucharAjustes(dueno) {
    ajustes?.disconnectObject(dueno);
}

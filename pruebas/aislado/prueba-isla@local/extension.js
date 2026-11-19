// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Extensión SOLO DE PRUEBA. La carga aislado.sh junto a la Isla Dinámica en un
 * GNOME Shell sin pantalla y comprueba que la isla se activa, funciona y se
 * desactiva sin dejar nada atrás. Escribe sus resultados con el prefijo [prueba].
 */

import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const UUID_ISLA = 'isla-dinamica@juniorarias02';
const ESTADO_ACTIVA = 1;

const esperar = ms => new Promise(resolver => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolver();
        return GLib.SOURCE_REMOVE;
    });
});

/**
 * GNOME reinicia esta extensión cuando la prueba desactiva y reactiva la isla
 * (reinicia las que se activaron después). La prueba debe correr una sola vez.
 */
let yaEjecutada = false;

const anotar = mensaje => console.log(`[prueba] ${mensaje}`);
const comprobar = (condicion, descripcion) => anotar(`${condicion ? '✔' : '✘'} ${descripcion}`);

/** Actores de la isla que siguen en pantalla (por su clase CSS). */
function actoresDeLaIsla() {
    const encontrados = [];
    const recorrer = actor => {
        if (actor.style_class?.split(' ').some(clase => clase.startsWith('isla-')))
            encontrados.push(actor.style_class);
        actor.get_children().forEach(recorrer);
    };
    recorrer(global.stage);
    return encontrados;
}

export default class PruebaIsla extends Extension {
    enable() {
        if (yaEjecutada)
            return;
        yaEjecutada = true;
        this._ejecutar()
            .catch(error => anotar(`✘ Error inesperado: ${error}\n${error.stack}`))
            .finally(() => anotar('FIN'));
    }

    disable() {}

    async _ejecutar() {
        await esperar(2500);
        const relojGnome = Main.panel.statusArea.dateMenu._clockDisplay;

        // ───── Activación ─────
        const info = Main.extensionManager.lookup(UUID_ISLA);
        comprobar(info?.state === ESTADO_ACTIVA, 'la isla se activa');
        const isla = info.stateObj;
        comprobar(Boolean(Main.panel.statusArea[UUID_ISLA]), 'la cápsula está en el panel');
        comprobar(!relojGnome.visible, 'el texto del reloj de Ubuntu está oculto');

        // ───── Funcionamiento ─────
        isla._controlador.agregarAlerta({
            tipo: 'notificacion',
            clave: 'prueba',
            duracionMs: 5000,
            datos: {titulo: 'Prueba', detalle: 'Mensaje de prueba', aplicacion: null},
        });
        await esperar(800);
        comprobar(isla._isla._tarjeta.visible, 'una alerta abre la tarjeta flotante');
        isla._controlador.descartarAlerta('prueba');
        await esperar(1000);

        isla._controlador.actualizarPrivacidad({microfono: true, camara: false, pantalla: false});
        await esperar(300);
        comprobar(isla._isla._boton.pildora._puntosPrivacidad.microfono.visible, 'se ve el punto del micrófono');

        // ───── Desactivación: no debe quedar nada ─────
        Main.extensionManager.disableExtension(UUID_ISLA);
        await esperar(800);
        comprobar(!Main.panel.statusArea[UUID_ISLA], 'al desactivar, la cápsula sale del panel');
        comprobar(relojGnome.visible, 'al desactivar, el reloj de Ubuntu vuelve');
        comprobar(!Object.prototype.hasOwnProperty.call(Main.messageTray, '_showNotification'),
            'al desactivar, las notificaciones vuelven a GNOME');
        comprobar(!Object.prototype.hasOwnProperty.call(Main.osdWindowManager, 'show') &&
            !Object.prototype.hasOwnProperty.call(Main.osdWindowManager, 'showAll'),
        'al desactivar, el volumen y el brillo vuelven a GNOME');
        const restos = actoresDeLaIsla();
        comprobar(restos.length === 0, `al desactivar no quedan actores de la isla${restos.length ? `: ${restos.join(', ')}` : ''}`);

        // ───── Reactivación ─────
        Main.extensionManager.enableExtension(UUID_ISLA);
        await esperar(1000);
        comprobar(Main.extensionManager.lookup(UUID_ISLA)?.state === ESTADO_ACTIVA, 'se vuelve a activar sin errores');
    }
}

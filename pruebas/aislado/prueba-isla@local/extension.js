// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Extensión SOLO DE PRUEBA. La carga aislado.sh junto a la Isla Dinámica en un
 * GNOME Shell sin pantalla y comprueba que la isla se activa, funciona y se
 * desactiva sin dejar nada atrás. Escribe sus resultados con el prefijo [prueba].
 */

import Gio from 'gi://Gio';
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

        // Morfosis con contenido que cambia de tamaño: volumen y la página de música.
        // aislado.sh revisa después que GNOME no avise de actores sin tamaño válido.
        isla._controlador.agregarAlerta({
            tipo: 'indicador',
            clave: 'indicador',
            duracionMs: 1500,
            sinCola: true,
            datos: {tipo: 'volumen', gicon: new Gio.ThemedIcon({name: 'audio-volume-high-symbolic'}), nivel: 0.6, maximo: 1},
        });
        await esperar(2500);
        comprobar(!isla._isla._tarjeta.visible, 'la alerta de volumen se abre y se cierra');

        isla._controlador.actualizarPista({
            titulo: 'Canción de prueba', artista: 'Artista', album: '', aplicacion: 'Reproductor',
            reproduciendo: true, duracionUs: 200_000_000, puedeBuscar: true, puedeAlternar: true,
            puedeSiguiente: true, puedeAnterior: true, puedeMostrar: false, urlCaratula: null,
            nombreBus: 'org.mpris.MediaPlayer2.prueba', entradaEscritorio: null,
        });
        isla._controlador.establecerActividadPreferida('musica');
        isla._controlador.establecerExpandido(true);
        await esperar(1500);
        isla._controlador.establecerExpandido(false);
        await esperar(1500);
        comprobar(!isla._isla._tarjeta.visible, 'la isla abierta en Música se cierra del todo');

        // "No molestar" por la vía real (lo mismo que el interruptor de Ajustes rápidos).
        const notificaciones = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        notificaciones.set_boolean('show-banners', false);
        await esperar(800);
        const alerta = isla._controlador.alertaActual;
        comprobar(alerta?.tipo === 'modo' && alerta.datos.activo, 'activar "No molestar" muestra su aviso');
        notificaciones.set_boolean('show-banners', true);
        await esperar(3000);

        // Menú del clic derecho y ventana de ajustes.
        isla._isla._abrirMenu();
        await esperar(400);
        comprobar(isla._isla._menu.abierto, 'el clic derecho abre el menú');
        isla._isla._menu.alternar();
        await esperar(400);
        isla._isla._acciones.abrirAjustes();
        let ventanaAjustes = false;
        for (let intento = 0; intento < 20 && !ventanaAjustes; intento++) {
            await esperar(500);
            ventanaAjustes = global.get_window_actors().some(a => a.meta_window.get_title() === 'Isla Dinámica');
        }
        comprobar(ventanaAjustes, '"Ajustes de la isla" abre la ventana de ajustes');

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

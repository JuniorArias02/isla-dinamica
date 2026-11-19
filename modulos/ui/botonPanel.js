/**
 * BotonPanel — el elemento que se inserta en el panel superior de GNOME.
 * Contiene la cápsula (Pildora) y la burbuja de los auriculares.
 *
 * No tiene menú: los clics, el puntero y los deslizamientos los gestiona
 * GestorInteraccion, y la tarjeta grande es la TarjetaFlotante.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {ajuste, AJUSTES} from '../ajustes.js';
import {Pildora} from './componentes/pildora.js';
import {Burbuja} from './componentes/burbuja.js';

export const BotonPanel = GObject.registerClass(
class BotonPanel extends PanelMenu.Button {
    _init() {
        // dontCreateMenu = true: sin menú desplegable de GNOME.
        super._init(0.5, 'Isla Dinámica', true);
        this.add_style_class_name('isla-boton-panel');

        const caja = new St.BoxLayout({
            style_class: 'isla-caja-panel',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });

        this.pildora = new Pildora();
        this.burbuja = new Burbuja();
        caja.add_child(this.pildora);
        caja.add_child(this.burbuja);

        this.add_child(caja);
    }

    /**
     * Dibuja la cápsula (actividad principal) y el círculo (actividad secundaria).
     * @param {object} datos - Parte de la vista: {pista, dispositivos, reloj, temporizador, actividades}
     */
    actualizar({pista, dispositivos, reloj, temporizador, actividades, privacidad}) {
        const {principal = null, secundaria = null} = actividades ?? {};
        this.pildora.actualizar(pista, reloj, temporizador, principal);
        this.pildora.establecerPrivacidad(ajuste(AJUSTES.MOSTRAR_PRIVACIDAD) ? privacidad ?? null : null);
        this.burbuja.actualizar({tipo: secundaria, dispositivo: dispositivos[0] ?? null, pista, temporizador});
    }
});

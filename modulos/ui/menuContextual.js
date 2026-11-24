// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * MenuContextual — menú del clic derecho sobre la cápsula.
 *
 *   No molestar                 [ ● ]
 *   ─────────────────────────────────
 *   [captura]    Capturar pantalla
 *   [grabar]     Grabar pantalla        (mientras se graba: "Detener grabación")
 *   ─────────────────────────────────
 *   [engranaje]  Ajustes de la isla
 *   [documento]  Registro de errores
 *
 * Usa el menú nativo de GNOME (PopupMenu): mismo aspecto que el resto del panel,
 * y GNOME se encarga de cerrarlo con Esc o al hacer clic fuera.
 */

import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {protegido} from '../registro.js';
import {icono, ICONOS} from './iconos.js';

export class MenuContextual {
    /**
     * @param {object} opciones
     * @param {Clutter.Actor} opciones.fuente - Actor bajo el que se abre (la cápsula).
     * @param {Clutter.Actor} opciones.dueno - Actor del panel que recibe el foco del menú.
     * @param {object} opciones.acciones - establecerNoMolestar(bool), abrirAjustes(), abrirRegistro(),
     *   capturarPantalla(), grabarPantalla(), detenerGrabacion().
     * @param {Function} opciones.obtenerModos - Devuelve {noMolestar, avion} actuales.
     */
    constructor({fuente, dueno, acciones, obtenerModos}) {
        this._obtenerModos = obtenerModos;

        this._menu = new PopupMenu.PopupMenu(fuente, 0.5, St.Side.TOP);
        this._menu.actor.add_style_class_name('isla-menu');
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();

        this._gestor = new PopupMenu.PopupMenuManager(dueno);
        this._gestor.addMenu(this._menu);

        this._noMolestar = new PopupMenu.PopupSwitchMenuItem('No molestar', false);
        this._noMolestar.connect('toggled', protegido('menú: No molestar',
            (_elemento, activo) => acciones.establecerNoMolestar(activo)));
        this._menu.addMenuItem(this._noMolestar);

        // Captura y grabación (las mismas herramientas que Impr Pant y Ctrl+Alt+Mayús+R).
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._menu.addAction('Capturar pantalla',
            protegido('menú: capturar pantalla', () => acciones.capturarPantalla()), icono(ICONOS.CAPTURA));
        this._grabando = false;
        this._elementoGrabar = this._menu.addAction('Grabar pantalla',
            protegido('menú: grabar o detener', () => {
                if (this._grabando)
                    acciones.detenerGrabacion();
                else
                    acciones.grabarPantalla();
            }), icono(ICONOS.GRABAR));

        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._menu.addAction('Ajustes de la isla',
            protegido('menú: abrir ajustes', () => acciones.abrirAjustes()), 'preferences-system-symbolic');
        this._menu.addAction('Registro de errores',
            protegido('menú: abrir registro', () => acciones.abrirRegistro()), 'text-x-generic-symbolic');
    }

    /** @returns {boolean} */
    get abierto() {
        return this._menu.isOpen;
    }

    /** Abre el menú (o lo cierra si ya estaba abierto). */
    alternar() {
        if (!this._menu.isOpen)
            this.actualizarModos(this._obtenerModos());
        this._menu.toggle();
    }

    /**
     * Refleja el estado real (por si cambió desde Ajustes rápidos con el menú abierto).
     * @param {{noMolestar: boolean}} modos
     */
    actualizarModos(modos) {
        if (this._noMolestar.state !== Boolean(modos?.noMolestar))
            this._noMolestar.setToggleState(Boolean(modos?.noMolestar));
    }

    /**
     * Mientras se graba, "Grabar pantalla" pasa a ser "Detener grabación".
     * @param {boolean} grabando
     */
    actualizarGrabacion(grabando) {
        if (grabando === this._grabando)
            return;
        this._grabando = grabando;
        this._elementoGrabar.label.text = grabando ? 'Detener grabación' : 'Grabar pantalla';
        this._elementoGrabar.setIcon(icono(grabando ? ICONOS.DETENER : ICONOS.GRABAR));
    }

    destruir() {
        this._gestor.removeMenu(this._menu);
        this._menu.destroy();
        this._menu = null;
    }
}

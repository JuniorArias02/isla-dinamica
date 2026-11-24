// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * BotonPanel — el elemento que se inserta en el panel superior de GNOME.
 * Contiene la cápsula (Pildora) y la burbuja de los auriculares.
 *
 * Mientras se arrastra la cápsula, la fila real se esconde y en su lugar se ve el
 * Asomo (la vista actual encogiéndose y la de al lado creciendo). Al soltar, la
 * fila real vuelve, ya con la vista nueva si se confirmó.
 *
 * No tiene menú: los clics, el puntero y los deslizamientos los gestiona
 * GestorInteraccion, y la tarjeta grande es la TarjetaFlotante.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {ajuste, AJUSTES} from '../ajustes.js';
import {ACTIVIDADES} from '../constantes.js';
import {Pildora} from './componentes/pildora.js';
import {Burbuja} from './componentes/burbuja.js';
import {Asomo, FASES_ASOMO} from './componentes/asomo.js';

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
        this._caja = caja;
        this._asomo = new Asomo();
        this._datos = null;

        // El botón del panel solo coloca a su primer hijo: la fila y el asomo van superpuestos dentro.
        const raiz = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        raiz.add_child(caja);
        raiz.add_child(this._asomo);
        this.add_child(raiz);
    }

    // ───────────────────────── Asomarse a la vista de al lado ─────────────────────────

    /** @returns {boolean} true mientras se ve el asomo (arrastrando, confirmando o cancelando). */
    get asomoActivo() {
        return this._asomo.activo;
    }

    /** @returns {string} Fase del asomo (valor de FASES_ASOMO). */
    get faseAsomo() {
        return this._asomo.fase;
    }

    /** @returns {string|null} Actividad a la que se asoma (null si no hay asomo). */
    get objetivoAsomo() {
        return this._asomo.objetivo;
    }

    /** @returns {number} Progreso del asomo (0 = como estaba, 1 = la vista de al lado entera). */
    get progresoAsomo() {
        return this._asomo.progreso;
    }

    /**
     * Empieza a asomarse a otra vista: la fila real se cambia por el asomo.
     * @param {string} objetivo - Actividad de al lado (valor de ACTIVIDADES).
     * @returns {boolean} false si no se puede (está terminando de confirmar otro cambio).
     */
    empezarAsomo(objetivo) {
        if (this._asomo.fase === FASES_ASOMO.CONFIRMANDO || !this._datos)
            return false;
        // Un asomo que volvía a su sitio se da por terminado y se empieza desde la fila real.
        if (this._asomo.activo)
            this._terminarAsomo(false);

        const conCirculo = Boolean(this.burbuja.tipo) && this.burbuja.visible;
        this._asomo.preparar({
            datos: this._datos,
            principal: this._datos.actividades?.principal ?? null,
            objetivo,
            anchoActual: this.pildora.width,
            anchoVecina: conCirculo ? this.burbuja.width : 0,
            espacio: this._caja.layout_manager.spacing,
        });
        this._caja.hide();
        return true;
    }

    /**
     * Sigue al puntero.
     * @param {number} progreso - 0 → 1 (y algo más, con resistencia).
     */
    moverAsomo(progreso) {
        if (this._asomo.fase === FASES_ASOMO.SIGUIENDO)
            this._asomo.progreso = progreso;
    }

    /** Soltó lo bastante lejos: la vista de al lado se queda (el controlador ya lo sabe). */
    confirmarAsomo() {
        this._asomo.confirmar(() => this._terminarAsomo(true));
    }

    /** Soltó antes de tiempo: todo vuelve a su sitio. */
    cancelarAsomo() {
        this._asomo.cancelar(() => this._terminarAsomo(false));
    }

    /** Algo más importante pasó (una alerta, la vista ya no existe): se corta al instante. */
    abortarAsomo() {
        if (this._asomo.activo)
            this._terminarAsomo(this._asomo.fase === FASES_ASOMO.CONFIRMANDO);
    }

    /** @param {boolean} confirmado - true si la cápsula real debe seguir desde la vista que se asomaba. */
    _terminarAsomo(confirmado) {
        const ancho = this._asomo.anchoVecinaActual;
        this._asomo.terminar();
        this._caja.show();
        if (!confirmado)
            return;
        // Si el círculo vuelve a salir, la cápsula se corre a la izquierda para dejarle sitio.
        const conCirculo = Boolean(this.burbuja.tipo);
        const anchoCirculo = conCirculo ? this.burbuja.get_preferred_width(-1)[1] : 0;
        const desplazamiento = conCirculo ? (this._caja.layout_manager.spacing + anchoCirculo) / 2 : 0;
        this.pildora.continuarDesde(ancho, desplazamiento);
        if (conCirculo)
            this.burbuja.reaparecer();
    }

    /**
     * Dibuja la cápsula (actividad principal) y el círculo (actividad secundaria).
     * @param {object} datos - Parte de la vista: {pista, dispositivos, reloj, temporizador, actividades}
     */
    actualizar(datos) {
        const {pista, audio, dispositivos, reloj, temporizador, actividades, privacidad, grabacion, llamada} = datos;
        this._datos = datos;
        this._asomo.actualizarDatos(datos);
        const {principal = null, secundaria = null} = actividades ?? {};
        this.pildora.actualizar(pista, reloj, temporizador, principal, grabacion ?? null, llamada ?? null, audio ?? null);
        // Con la grabación en la cápsula, el punto rojo de "pantalla" sobra (dirían lo mismo);
        // con la llamada, el naranja del micrófono.
        const mostrarPrivacidad = ajuste(AJUSTES.MOSTRAR_PRIVACIDAD) && privacidad;
        let privacidadVisible = mostrarPrivacidad || null;
        if (privacidadVisible && principal === ACTIVIDADES.GRABACION)
            privacidadVisible = {...privacidadVisible, pantalla: false};
        if (privacidadVisible && principal === ACTIVIDADES.LLAMADA)
            privacidadVisible = {...privacidadVisible, microfono: false};
        this.pildora.establecerPrivacidad(privacidadVisible);
        this.burbuja.actualizar({tipo: secundaria, dispositivo: dispositivos[0] ?? null, pista, audio, temporizador});
    }
});

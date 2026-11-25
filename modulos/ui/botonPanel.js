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
import {ACTIVIDADES, ALCANCE_LUZ_CAPSULA_PX} from '../constantes.js';
import {Pildora} from './componentes/pildora.js';
import {Burbuja} from './componentes/burbuja.js';
import {Asomo, FASES_ASOMO} from './componentes/asomo.js';
import {Vidrio} from './componentes/vidrio.js';
import {CapaTinte} from './componentes/capaTinte.js';
import {LuzVidrio} from './componentes/luzVidrio.js';

/** Lo que las capas copian de la cápsula y del círculo para moverse igual que ellos. */
const PROPIEDADES_COMPARTIDAS = ['translation-x', 'translation-y', 'scale-x', 'scale-y', 'pivot-point'];

/**
 * Raíz del botón: la fila (cápsula + círculo) y el asomo, superpuestos. La cápsula y
 * el círculo llevan sus capas del estilo Liquid Glass, con su mismo tamaño y posición:
 * detrás, el vidrio de verdad y el tinte de la canción; delante, la luz que sigue al
 * puntero. Su lugar se calcula aquí, durante la asignación de tamaño (no pide otra
 * asignación).
 */
const RaizPanel = GObject.registerClass(
class RaizPanel extends St.Widget {
    _init({caja, pildora, burbuja, asomo}) {
        super._init({layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true});
        this._caja = caja;
        /** Capas de la cápsula [0] y del círculo [1]. */
        this.capas = [pildora, burbuja].map(fuente => ({
            fuente,
            vidrio: new Vidrio(),
            tinte: new CapaTinte(),
            luz: new LuzVidrio({radio: 999, alcance: ALCANCE_LUZ_CAPSULA_PX}),
        }));
        // Detrás de la fila: vidrio y tinte.
        for (const {fuente, vidrio, tinte} of this.capas) {
            vidrio.visible = false;
            for (const capa of [vidrio, tinte])
                this._agregarCapa(capa, fuente);
        }
        this.add_child(caja);
        // Delante de la fila: la luz (no recibe clics).
        for (const {fuente, luz} of this.capas)
            this._agregarCapa(luz, fuente);
        // El círculo aparece y desaparece con un fundido: su vidrio y su luz, también.
        for (const capa of [this.capas[1].vidrio, this.capas[1].luz])
            burbuja.bind_property('opacity', capa, 'opacity', GObject.BindingFlags.SYNC_CREATE);
        this.add_child(asomo);
    }

    /** Añade una capa que se mueve igual que su fuente (cápsula o círculo). */
    _agregarCapa(capa, fuente) {
        for (const propiedad of PROPIEDADES_COMPARTIDAS)
            fuente.bind_property(propiedad, capa, propiedad, GObject.BindingFlags.SYNC_CREATE);
        this.add_child(capa);
    }

    vfunc_allocate(caja) {
        super.vfunc_allocate(caja);
        const origen = this._caja.get_allocation_box();
        for (const {fuente, vidrio, tinte, luz} of this.capas) {
            const lugar = fuente.get_allocation_box();
            lugar.set_origin(origen.x1 + lugar.x1, origen.y1 + lugar.y1);
            vidrio.allocate(lugar);
            tinte.allocate(lugar);
            luz.allocate(lugar);
        }
    }
});

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
        this._raiz = new RaizPanel({caja, pildora: this.pildora, burbuja: this.burbuja, asomo: this._asomo});
        this.add_child(this._raiz);

        this._cristal = false;
        this._luz = false;
        const sincronizar = () => this._sincronizarVidrios();
        caja.connect('notify::visible', sincronizar);
        this.burbuja.connect('notify::visible', sincronizar);

        // Luz que sigue al puntero: se mueve con él y se apaga al salir de la isla.
        this.connect('motion-event', (_actor, evento) => {
            const [x, y] = evento.get_coords();
            for (const {luz} of this._raiz.capas)
                luz.seguir(x, y);
            return Clutter.EVENT_PROPAGATE;
        });
        this.connect('notify::hover', () => {
            if (!this.hover)
                this._raiz.capas.forEach(({luz}) => luz.apagar());
        });
    }

    /**
     * Liquid Glass: la luz del canto que sigue al puntero.
     * @param {boolean} activa
     */
    establecerLuz(activa) {
        this._luz = activa;
        this._sincronizarVidrios();
    }

    /**
     * Liquid Glass: muestra (o quita) el vidrio de verdad detrás de la cápsula, del
     * círculo y de las ventanas del asomo.
     * @param {boolean} activo
     */
    establecerVidrio(activo) {
        this._cristal = activo;
        this._asomo.establecerVidrio(activo);
        this._sincronizarVidrios();
    }

    _sincronizarVidrios() {
        const [pildora, burbuja] = this._raiz.capas;
        pildora.vidrio.visible = this._cristal && this._caja.visible;
        burbuja.vidrio.visible = this._cristal && this._caja.visible && this.burbuja.visible;
        // El tinte solo se ve con la fila a la vista (en el asomo no se tiñe).
        pildora.tinte.visible = this._caja.visible;
        burbuja.tinte.visible = this._caja.visible && this.burbuja.visible;
        pildora.luz.visible = this._luz && this._caja.visible;
        burbuja.luz.visible = this._luz && this._caja.visible && this.burbuja.visible;
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

        // Color de la canción (si el estilo lo usa, la pista lo trae): en la cápsula y en el
        // círculo, cuando muestran la música. Mientras carga la siguiente, se mantiene.
        const colorMusica = pista?.colorPortada ?? null;
        this._raiz.capas[0].tinte.establecerColor(principal === ACTIVIDADES.MUSICA ? colorMusica : null);
        this._raiz.capas[1].tinte.establecerColor(secundaria === ACTIVIDADES.MUSICA ? colorMusica : null);
    }
});

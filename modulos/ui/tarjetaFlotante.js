// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * TarjetaFlotante — la isla "grande" que crece desde la cápsula.
 *
 * Vive sobre todas las ventanas (Main.layoutManager.addTopChrome). Imita el
 * movimiento de la Dynamic Island:
 *
 *   Abrir:  nace con la forma exacta de la cápsula → se ensancha y crece hacia
 *           abajo con resortes físicos (se pasa un poco y rebota) → el contenido
 *           aparece después, de desenfocado a nítido.
 *   Cambiar: el contenido viejo se desenfoca y se va mientras la forma se adapta
 *           y el nuevo aparece.
 *   Cerrar: el contenido se desenfoca primero → la forma se encoge (primero el
 *           alto, luego el ancho) hasta la cápsula → desaparece y la cápsula
 *           "aterriza" con un rebote (alCerrarse).
 *
 * El contenido (alerta o vista expandida) pertenece a quien lo crea:
 * la tarjeta solo lo coloca, lo anima y lo saca.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {RESORTES, RETRASO_CONTENIDO_MS, MARGEN_PANTALLA_PX} from '../constantes.js';
import {registrarAviso, registrarDepuracion, protegido} from '../registro.js';
import {
    animarConResorte,
    duracionResorte,
    entrarConDesenfoque,
    salirConDesenfoque,
    restablecerContenido,
} from './movimiento.js';

const PROPIEDADES_GEOMETRIA = ['x', 'y', 'width', 'height'];

/** Al cerrar, el alto empieza a encogerse un poco antes que el ancho (como iOS). */
const RETRASO_CIERRE_ALTO_MS = 50;
const RETRASO_CIERRE_ANCHO_MS = 90;

/** Margen extra antes de que el seguro de cierre actúe. */
const MARGEN_SEGURO_CIERRE_MS = 200;

export const TarjetaFlotante = GObject.registerClass(
class TarjetaFlotante extends St.Widget {
    /**
     * @param {object} opciones
     * @param {Function} opciones.obtenerAncla - Devuelve {x, y, ancho, alto} de la cápsula en pantalla.
     * @param {Function} [opciones.alCerrarse] - Se llama cuando termina de cerrarse.
     */
    _init({obtenerAncla, alCerrarse}) {
        super._init({
            style_class: 'isla-tarjeta-flotante',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            track_hover: true,
            visible: false,
        });

        this._obtenerAncla = obtenerAncla;
        this._alCerrarse = alCerrarse;
        this._contenido = null;
        this._cerrando = false;
        this._idSeguroCierre = 0;

        // El lienzo recorta el contenido mientras la tarjeta todavía es pequeña.
        this._lienzo = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true,
            x_expand: true,
            y_expand: true,
        });
        this.add_child(this._lienzo);
    }

    /** @returns {boolean} true si está visible y no se está cerrando. */
    get abierta() {
        return this.visible && !this._cerrando;
    }

    /**
     * Muestra un contenido con el ancho indicado. Si la tarjeta estaba oculta,
     * nace desde la cápsula; si ya estaba visible, se transforma al nuevo tamaño.
     *
     * @param {Clutter.Actor} contenido
     * @param {number} ancho
     */
    mostrar(contenido, ancho) {
        const naciendo = !this.visible;
        const reabriendo = this._cerrando;
        this._cancelarSeguroCierre();

        if (naciendo) {
            const ancla = this._obtenerAncla();
            this.set_position(ancla.x, ancla.y);
            this.set_size(ancla.ancho, ancla.alto);
            this.show();
        }
        this._cerrando = false;

        if (contenido !== this._contenido)
            this._cambiarContenido(contenido);
        else if (reabriendo)
            entrarConDesenfoque(contenido); // se estaba yendo: vuelve
        contenido.width = ancho;

        const [, alto] = contenido.get_preferred_height(ancho);
        const ancla = this._obtenerAncla();
        const destino = {
            x: this._limitarX(ancla.x + ancla.ancho / 2 - ancho / 2, ancho),
            y: ancla.y,
            width: ancho,
            height: alto,
        };

        if (this._estaEn(destino))
            return;

        // Ancho y alto con resortes distintos: se ensancha un pelín antes de crecer hacia abajo.
        // `x` va con el ancho para que la isla crezca desde su centro.
        animarConResorte(this, {x: destino.x, width: destino.width}, {resorte: RESORTES.APERTURA_ANCHO});
        animarConResorte(this, {y: destino.y, height: destino.height}, {resorte: RESORTES.APERTURA_ALTO});
    }

    /**
     * La isla sigue al puntero mientras se arrastra (para cerrarla deslizando).
     * Hacia arriba se mueve libre; hacia abajo con resistencia.
     * @param {number} desplazamientoY - Píxeles arrastrados (negativo = hacia arriba).
     */
    seguirArrastre(desplazamientoY) {
        this.remove_transition('translation-y');
        this.translation_y = desplazamientoY < 0 ? desplazamientoY : desplazamientoY * 0.25;
    }

    /** El arrastre no llegó al umbral: la isla vuelve a su sitio con rebote. */
    soltarArrastre() {
        animarConResorte(this, {translation_y: 0}, {resorte: RESORTES.REBOTE});
    }

    /** Se encoge hasta la cápsula y desaparece. */
    ocultar() {
        if (!this.visible || this._cerrando)
            return;
        this._cerrando = true;

        if (this._contenido)
            salirConDesenfoque(this._contenido);

        // Si se estaba arrastrando, vuelve a su sitio mientras se encoge.
        if (this.translation_y !== 0)
            animarConResorte(this, {translation_y: 0}, {resorte: RESORTES.CIERRE});

        const ancla = this._obtenerAncla();
        animarConResorte(this, {y: ancla.y, height: ancla.alto}, {
            resorte: RESORTES.CIERRE,
            retraso: RETRASO_CIERRE_ALTO_MS,
        });
        animarConResorte(this, {x: ancla.x, width: ancla.ancho}, {
            resorte: RESORTES.CIERRE,
            retraso: RETRASO_CIERRE_ANCHO_MS,
            // Solo si nadie la volvió a abrir a mitad de camino.
            alTerminar: () => this._terminarCierre(),
        });

        // Seguro: si la animación no avisa que terminó, la isla se oculta igual.
        // Así nunca queda una tarjeta negra tapando la cápsula.
        const espera = RETRASO_CIERRE_ANCHO_MS + duracionResorte(RESORTES.CIERRE) + MARGEN_SEGURO_CIERRE_MS;
        const seguro = protegido('tarjeta: seguro de cierre', () => {
            if (!this._cerrando)
                return;
            registrarAviso(`La animación de cierre no terminó en ${espera} ms ` +
                `(x=${Math.round(this.x)} ancho=${Math.round(this.width)} ` +
                `transiciones=${PROPIEDADES_GEOMETRIA.filter(p => this.get_transition(p)).join(',') || 'ninguna'}); ` +
                'se oculta por seguridad.');
            this._terminarCierre();
        });
        this._idSeguroCierre = GLib.timeout_add(GLib.PRIORITY_DEFAULT, espera, () => {
            this._idSeguroCierre = 0;
            seguro();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Las pantallas cambiaron (se conectó o desconectó un monitor, o cambió el
     * principal): la cápsula está en otro sitio y la isla salta junto a ella, sin
     * animación. Si se estaba cerrando, el cierre termina ya.
     */
    recolocar() {
        if (!this.visible)
            return;
        if (this._cerrando) {
            this._terminarCierre();
            return;
        }
        for (const propiedad of PROPIEDADES_GEOMETRIA)
            this.remove_transition(propiedad);
        this.remove_transition('translation-y');
        this.translation_y = 0;

        const ancho = this._contenido?.width || this.width;
        const alto = this._contenido ? this._contenido.get_preferred_height(ancho)[1] : this.height;
        const ancla = this._obtenerAncla();
        this.set_position(this._limitarX(ancla.x + ancla.ancho / 2 - ancho / 2, ancho), ancla.y);
        this.set_size(ancho, alto);
    }

    _terminarCierre() {
        this._cancelarSeguroCierre();
        if (!this._cerrando)
            return;
        registrarDepuracion('Tarjeta cerrada.');
        this.remove_all_transitions();
        this.translation_y = 0;
        this.hide();
        this._cerrando = false;
        this._quitarContenido();
        this._alCerrarse?.();
    }

    _cancelarSeguroCierre() {
        if (this._idSeguroCierre) {
            GLib.source_remove(this._idSeguroCierre);
            this._idSeguroCierre = 0;
        }
    }

    /** Saca el contenido sin destruirlo y destruye la tarjeta. */
    destruir() {
        this._cancelarSeguroCierre();
        this.remove_all_transitions();
        for (const hijo of this._lienzo.get_children()) {
            restablecerContenido(hijo);
            this._lienzo.remove_child(hijo);
        }
        this._contenido = null;
        this._alCerrarse = null;
        this.destroy();
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    _cambiarContenido(nuevo) {
        const anterior = this._contenido;
        this._contenido = nuevo;

        // El contenido anterior se desenfoca y se va mientras el nuevo aparece.
        if (anterior) {
            salirConDesenfoque(anterior, () => {
                if (anterior !== this._contenido && anterior.get_parent() === this._lienzo) {
                    this._lienzo.remove_child(anterior);
                    restablecerContenido(anterior);
                }
            });
        }

        if (nuevo.get_parent() !== this._lienzo)
            this._lienzo.add_child(nuevo);
        this._lienzo.set_child_above_sibling(nuevo, null);
        nuevo.set({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.START});

        // Primero crece la forma; el contenido llega un instante después.
        entrarConDesenfoque(nuevo, {retraso: RETRASO_CONTENIDO_MS});
    }

    _quitarContenido() {
        const contenido = this._contenido;
        this._contenido = null;
        if (contenido?.get_parent() === this._lienzo) {
            this._lienzo.remove_child(contenido);
            restablecerContenido(contenido);
        }
    }

    _estaEn(destino) {
        const animando = PROPIEDADES_GEOMETRIA.some(p => this.get_transition(p));
        return !animando &&
            Math.abs(this.x - destino.x) < 1 && Math.abs(this.y - destino.y) < 1 &&
            Math.abs(this.width - destino.width) < 1 && Math.abs(this.height - destino.height) < 1;
    }

    /** Evita que la tarjeta se salga de la pantalla por los lados. */
    _limitarX(x, ancho) {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return x;
        const minimo = monitor.x + MARGEN_PANTALLA_PX;
        const maximo = monitor.x + monitor.width - ancho - MARGEN_PANTALLA_PX;
        return Math.round(Math.max(minimo, Math.min(x, maximo)));
    }
});

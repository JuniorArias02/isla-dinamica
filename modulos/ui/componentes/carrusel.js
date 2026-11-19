/**
 * Carrusel — páginas que se deslizan horizontalmente, como en el móvil.
 *
 * Formas de cambiar de página:
 *   - Arrastrar con el ratón o el dedo (Clutter.PanGesture), con resistencia en los bordes.
 *   - Deslizar con dos dedos A LOS LADOS en el touchpad (scroll suave horizontal).
 *   - Rueda horizontal del ratón (izquierda/derecha).
 *
 * El movimiento VERTICAL no se consume: llega a la tarjeta, que lo usa para cerrarse.
 *   - Pulsar los puntos indicadores.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
    BLOQUEO_DESLIZAR_MS,
    DURACION_PAGINA_MS,
    RESORTES,
    UMBRAL_ARRASTRE_PAGINA,
    UMBRAL_DESLIZAR_TOUCHPAD,
    VELOCIDAD_LANZAR,
} from '../../constantes.js';
import {protegido} from '../../registro.js';
import {animar, animarConResorte} from '../movimiento.js';

/** Resistencia al arrastrar más allá de la primera o la última página. */
const RESISTENCIA_BORDE = 0.3;


const ANCHO_PUNTO_PX = 6;
const ANCHO_PUNTO_ACTIVO_PX = 18;

export const Carrusel = GObject.registerClass(
class Carrusel extends St.BoxLayout {
    /**
     * @param {object} opciones
     * @param {number} opciones.anchoPagina - Ancho de cada página en píxeles.
     * @param {Function} [opciones.alCambiarPagina] - Recibe el id de la página visible.
     */
    _init({anchoPagina, alCambiarPagina}) {
        super._init({
            style_class: 'isla-carrusel',
            orientation: Clutter.Orientation.VERTICAL,
        });

        this._anchoPagina = anchoPagina;
        this._alCambiarPagina = alCambiarPagina;
        this._paginas = [];
        this._indice = 0;
        this._acumuladoScroll = 0;
        this._idBloqueo = 0;

        // Ventana visible (recorta) y tira con todas las páginas en fila.
        this._ventana = new St.Widget({
            style_class: 'isla-carrusel-ventana',
            layout_manager: new Clutter.BinLayout(),
            width: anchoPagina,
            clip_to_allocation: true,
            reactive: true,
        });
        this._tira = new St.BoxLayout({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
        });
        this._ventana.add_child(this._tira);
        this.add_child(this._ventana);

        this._puntos = new St.BoxLayout({
            style_class: 'isla-puntos',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._puntos);

        this._configurarArrastre();
        this._ventana.connect('scroll-event', protegido('carrusel: deslizar',
            (_actor, evento) => this.alHacerScroll(evento), Clutter.EVENT_PROPAGATE));

        this.connect('destroy', () => {
            if (this._idBloqueo)
                GLib.source_remove(this._idBloqueo);
            this._idBloqueo = 0;
            this.soltarPaginas();
        });
    }

    /**
     * Saca las páginas sin destruirlas: pertenecen a quien las creó.
     */
    soltarPaginas() {
        for (const pagina of this._paginas)
            this._tira.remove_child(pagina.actor);
        this._paginas = [];
    }

    /** @returns {string|null} Id de la página visible. */
    get paginaActual() {
        return this._paginas[this._indice]?.id ?? null;
    }

    /**
     * Define qué páginas existen. Si la página visible sigue existiendo, se mantiene.
     * @param {{id: string, actor: Clutter.Actor}[]} paginas
     */
    establecerPaginas(paginas) {
        const idsNuevos = paginas.map(p => p.id).join('|');
        const idsActuales = this._paginas.map(p => p.id).join('|');
        if (idsNuevos === idsActuales)
            return;

        const idVisible = this.paginaActual;

        for (const pagina of this._paginas)
            this._tira.remove_child(pagina.actor);
        this._paginas = paginas;
        for (const pagina of paginas) {
            pagina.actor.width = this._anchoPagina;
            this._tira.add_child(pagina.actor);
        }

        this._reconstruirPuntos();
        const nuevoIndice = Math.max(0, paginas.findIndex(p => p.id === idVisible));
        this._irAIndice(nuevoIndice, false);
    }

    /**
     * La ventana del carrusel toma el alto natural de la página visible
     * (las demás quedan recortadas). Así la isla se adapta a cada página.
     */
    ajustarAltura() {
        const pagina = this._paginas[this._indice];
        if (!pagina || !this.get_stage())
            return;
        const [, alto] = pagina.actor.get_preferred_height(this._anchoPagina);
        if (Math.abs(this._ventana.height - alto) >= 1)
            this._ventana.height = alto;
    }

    /**
     * Muestra una página concreta.
     * @param {string} id
     * @param {boolean} [conAnimacion=true]
     */
    irA(id, conAnimacion = true) {
        const indice = this._paginas.findIndex(p => p.id === id);
        if (indice >= 0)
            this._irAIndice(indice, conAnimacion);
    }

    // ───────────────────────── Navegación ─────────────────────────

    _irAIndice(indice, conAnimacion) {
        const limitado = Math.max(0, Math.min(indice, this._paginas.length - 1));
        const cambio = limitado !== this._indice;
        this._indice = limitado;

        const destino = -limitado * this._anchoPagina;
        this._tira.remove_transition('translation-x');
        if (conAnimacion) {
            // Las páginas se deslizan con resorte, como en el móvil.
            animarConResorte(this._tira, {translation_x: destino}, {resorte: RESORTES.CAPSULA});
        } else {
            this._tira.translation_x = destino;
        }

        this._actualizarPuntos(conAnimacion);
        this.ajustarAltura();
        if (cambio)
            this._alCambiarPagina?.(this.paginaActual);
    }

    _configurarArrastre() {
        const gesto = new Clutter.PanGesture({pan_axis: Clutter.PanAxis.X});

        gesto.connect('recognize', protegido('carrusel: inicio de arrastre', () => {
            this._tira.remove_transition('translation-x');
        }));

        gesto.connect('pan-update', protegido('carrusel: arrastrando', () => {
            const desplazamiento = gesto.get_accumulated_delta().get_x();
            const base = -this._indice * this._anchoPagina;
            const enBorde = (this._indice === 0 && desplazamiento > 0) ||
                (this._indice === this._paginas.length - 1 && desplazamiento < 0);
            this._tira.translation_x = base + desplazamiento * (enBorde ? RESISTENCIA_BORDE : 1);
        }));

        gesto.connect('end', protegido('carrusel: fin de arrastre', () => {
            const desplazamiento = gesto.get_accumulated_delta().get_x();
            const velocidad = gesto.get_velocity().get_x();
            const superaUmbral = Math.abs(desplazamiento) > this._anchoPagina * UMBRAL_ARRASTRE_PAGINA ||
                Math.abs(velocidad) > VELOCIDAD_LANZAR;

            let indice = this._indice;
            if (superaUmbral)
                indice += desplazamiento < 0 ? 1 : -1;
            this._irAIndice(indice, true);
        }));

        gesto.connect('cancel', protegido('carrusel: arrastre cancelado', () => this._irAIndice(this._indice, true)));

        this._ventana.add_action(gesto);
    }

    /**
     * Touchpad (scroll suave) y rueda del ratón.
     * @returns {boolean} Si el evento se consumió.
     */
    /**
     * Procesa un desplazamiento (touchpad o rueda). Público para que la vista que
     * contiene el carrusel lo use en toda su superficie, no solo sobre las páginas.
     * @returns {boolean} Clutter.EVENT_STOP si se usó; EVENT_PROPAGATE si es vertical (cierra la isla).
     */
    alHacerScroll(evento) {
        const direccion = evento.get_scroll_direction();
        let paso = 0;

        if (direccion === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = evento.get_scroll_delta();
            // Lo vertical (o casi) es para cerrar la isla: se deja pasar a la tarjeta.
            if (Math.abs(dx) <= Math.abs(dy))
                return Clutter.EVENT_PROPAGATE;
            if (this._paginas.length < 2)
                return Clutter.EVENT_STOP;
            this._acumuladoScroll += dx;
            if (Math.abs(this._acumuladoScroll) >= UMBRAL_DESLIZAR_TOUCHPAD)
                paso = this._acumuladoScroll > 0 ? 1 : -1;
        } else if (direccion === Clutter.ScrollDirection.RIGHT) {
            paso = 1;
        } else if (direccion === Clutter.ScrollDirection.LEFT) {
            paso = -1;
        } else {
            // Rueda arriba/abajo: también cierra la isla.
            return Clutter.EVENT_PROPAGATE;
        }

        if (paso !== 0 && !this._idBloqueo) {
            this._acumuladoScroll = 0;
            this._irAIndice(this._indice + paso, true);
            // Evita pasar varias páginas con un solo gesto largo.
            this._idBloqueo = GLib.timeout_add(GLib.PRIORITY_DEFAULT, BLOQUEO_DESLIZAR_MS, () => {
                this._idBloqueo = 0;
                this._acumuladoScroll = 0;
                return GLib.SOURCE_REMOVE;
            });
        }
        return Clutter.EVENT_STOP;
    }

    // ───────────────────────── Puntos indicadores ─────────────────────────

    _reconstruirPuntos() {
        this._puntos.destroy_all_children();
        this._paginas.forEach((pagina, indice) => {
            const punto = new St.Button({
                style_class: 'isla-punto',
                width: ANCHO_PUNTO_PX,
                can_focus: false,
            });
            punto.connect('clicked', () => this._irAIndice(indice, true));
            this._puntos.add_child(punto);
        });
        this._puntos.visible = this._paginas.length > 1;
    }

    _actualizarPuntos(conAnimacion) {
        this._puntos.get_children().forEach((punto, indice) => {
            const activo = indice === this._indice;
            if (activo)
                punto.add_style_class_name('isla-punto-activo');
            else
                punto.remove_style_class_name('isla-punto-activo');

            const ancho = activo ? ANCHO_PUNTO_ACTIVO_PX : ANCHO_PUNTO_PX;
            punto.remove_transition('width');
            if (conAnimacion)
                animar(punto, {width: ancho, duration: DURACION_PAGINA_MS, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
            else
                punto.width = ancho;
        });
    }
});

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Vidrio — el fondo de cristal líquido de la isla (estilo Liquid Glass).
 *
 * Muestra, desenfocado, lo que hay DETRÁS de la isla (el fondo de pantalla y las
 * ventanas), recortado con esquinas redondeadas y con el borde refractado como una
 * lente:
 *
 *   1. Copia en vivo de lo de detrás, colocada para que coincida con la pantalla:
 *      el fondo de pantalla (Clone de `layoutManager._backgroundGroup`) y, en la isla
 *      abierta, cada ventana (Clone de cada MetaWindowActor, que la sigue con un
 *      BindConstraint). GNOME no deja copiar `global.window_group` entero: la copia
 *      sale vacía. La isla vive fuera de esos grupos: no se copia a sí misma.
 *   2. Desenfoque: Shell.BlurEffect en modo ACTOR sobre una capa interior que recorta
 *      la copia al tamaño de la isla (así solo se desenfoca ese trozo, no la pantalla).
 *   3. EfectoCristal (GLSL): recorta las esquinas redondeadas (con borde suave) y
 *      curva la imagen cerca del canto, como el vidrio grueso que refracta la luz.
 *
 * GNOME no permite desenfocar "lo de detrás" con esquinas redondeadas: el
 * desenfoque de fondo (modo BACKGROUND) es rectangular. Por eso se desenfoca una
 * copia propia y se recorta con el shader.
 *
 * El tinte, el borde de luz y el brillo los pone el CSS del actor que lo contiene
 * (recursos/estilos/cristal.css), por encima de este fondo.
 */

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {RADIO_DESENFOQUE_VIDRIO, BRILLO_VIDRIO, REFRACCION_VIDRIO_PX} from '../../constantes.js';
import {protegido} from '../../registro.js';

const DECLARACIONES = `
uniform vec2 tamano;
uniform float radio;
uniform float refraccion;

// Distancia con signo a un rectángulo redondeado centrado (negativa = dentro).
float distancia_redondeada(vec2 punto, vec2 mitad, float r) {
    vec2 q = abs(punto) - (mitad - vec2(r));
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
`;

const CODIGO = `
vec2 mitad = tamano * 0.5;
float r = min(radio, min(mitad.x, mitad.y));
vec2 punto = cogl_tex_coord_in[0].xy * tamano - mitad;
float d = distancia_redondeada(punto, mitad, r);

// Refracción: cerca del canto (los últimos "refraccion" px) la imagen se toma más
// hacia dentro, como una lente que curva la luz en el borde del vidrio.
float cerca = clamp(1.0 + d / max(refraccion, 0.001), 0.0, 1.0);
vec2 hacia_dentro = punto * (1.0 - 0.10 * cerca * cerca);
vec2 coordenada = (hacia_dentro + mitad) / tamano;

vec4 color = texture2D(cogl_sampler0, coordenada);
// Recorte con borde suave (1 px) para que el canto no se vea dentado.
float cubre = clamp(0.5 - d, 0.0, 1.0);
cogl_color_out = color * cubre;
`;

/** Recorte redondeado + refracción del borde (GLSL, efecto fuera de pantalla). */
const EfectoCristal = GObject.registerClass(
class EfectoCristal extends Shell.GLSLEffect {
    _init(params) {
        super._init(params);
        this._ubicacionTamano = this.get_uniform_location('tamano');
        this._ubicacionRadio = this.get_uniform_location('radio');
        this._ubicacionRefraccion = this.get_uniform_location('refraccion');
        this.establecer({ancho: 1, alto: 1, radio: 0});
    }

    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, DECLARACIONES, CODIGO, true);
    }

    /**
     * @param {object} forma
     * @param {number} forma.ancho
     * @param {number} forma.alto
     * @param {number} forma.radio - Radio de las esquinas (se limita a la mitad del lado menor).
     */
    establecer({ancho, alto, radio}) {
        this.set_uniform_float(this._ubicacionTamano, 2, [Math.max(1, ancho), Math.max(1, alto)]);
        this.set_uniform_float(this._ubicacionRadio, 1, [radio]);
        this.set_uniform_float(this._ubicacionRefraccion, 1, [REFRACCION_VIDRIO_PX]);
        this.queue_repaint();
    }
});

export const Vidrio = GObject.registerClass(
class Vidrio extends St.Widget {
    /**
     * @param {object} [opciones]
     * @param {number} [opciones.radio=999] - Radio de las esquinas (999 = cápsula).
     * @param {boolean} [opciones.conVentanas=false] - Copiar también las ventanas (la isla
     *   abierta flota sobre ellas). La cápsula vive en el panel: le basta el fondo.
     * @param {number} [opciones.brillo=BRILLO_VIDRIO] - Brillo de lo de detrás (menos = más oscuro).
     */
    _init({radio = 999, conVentanas = false, brillo = BRILLO_VIDRIO} = {}) {
        super._init({
            style_class: 'isla-vidrio',
            clip_to_allocation: true,
            reactive: false,
            x_expand: true,
            y_expand: true,
        });
        this._radio = radio;
        this._conVentanas = conVentanas;
        /** @type {Clutter.Clone[]} */
        this._copiasVentanas = [];

        // Capa interior: recorta la copia al tamaño de la isla y la desenfoca.
        this._interior = new St.Widget({clip_to_allocation: true});
        // La copia del escritorio, con el origen de la pantalla. GNOME no deja copiar
        // el grupo de ventanas entero (sale vacío): se copia el fondo y cada ventana.
        this._escritorio = new Clutter.Actor();
        this._escritorio.add_child(new Clutter.Clone({source: Main.layoutManager._backgroundGroup}));
        this._interior.add_child(this._escritorio);
        this.add_child(this._interior);

        this._interior.add_effect_with_name('isla-desenfoque-vidrio', new Shell.BlurEffect({
            mode: Shell.BlurMode.ACTOR,
            radius: RADIO_DESENFOQUE_VIDRIO,
            brightness: brillo,
        }));
        // Por fuera: se recorta y se refracta el resultado ya desenfocado.
        this._cristal = new EfectoCristal();
        this.add_effect_with_name('isla-cristal', this._cristal);

        // Las ventanas solo se copian mientras el vidrio está a la vista.
        if (conVentanas) {
            this.connect('notify::mapped', protegido('vidrio: a la vista', () => this._sincronizarVentanas()));
            this.connect('destroy', () => this._soltarVentanas());
        }
    }

    /**
     * Cambia el radio de las esquinas (ej. la tarjeta: 36 px; la cápsula: 999).
     * @param {number} radio
     */
    establecerRadio(radio) {
        this._radio = radio;
        this.queue_relayout();
    }

    /** No pide sitio: ocupa lo que le dé su contenedor. */
    vfunc_get_preferred_width(_alto) {
        return [0, 0];
    }

    vfunc_get_preferred_height(_ancho) {
        return [0, 0];
    }

    /**
     * Lo que pinta es solo su caja: la capa interior, más grande (margen del desenfoque),
     * queda recortada. Sin esto, el shader recibiría la imagen con el margen incluido y el
     * recorte redondeado quedaría desplazado (y dejaría ver lo de debajo).
     */
    vfunc_get_paint_volume(volumen) {
        return volumen.set_from_allocation(this);
    }

    /**
     * La copia se coloca para que coincida con la pantalla: lo que se ve a través
     * del vidrio es justo lo que hay detrás. Se calcula durante la asignación de
     * tamaño (no pide otra asignación).
     */
    vfunc_allocate(caja) {
        this.set_allocation(caja);
        const ancho = caja.get_width();
        const alto = caja.get_height();
        const [x, y] = this.get_transformed_position();

        // La capa que se desenfoca es más grande que el vidrio: así el desenfoque del borde
        // mezcla imagen real y no "nada" (que oscurecería el canto, sobre todo en la cápsula,
        // que es muy baja). El recorte del vidrio y el shader dejan ver solo su tamaño.
        // El margen no sale de la pantalla: lo de fuera no se dibuja y descuadraría la imagen
        // (la isla está pegada al borde de arriba).
        const margen = (espacio) => Math.max(0, Math.min(RADIO_DESENFOQUE_VIDRIO, Math.floor(espacio)));
        const izquierda = margen(x);
        const arriba = margen(y);
        const derecha = margen(global.stage.width - (x + ancho));
        const abajo = margen(global.stage.height - (y + alto));
        const interior = new Clutter.ActorBox();
        interior.set_origin(-izquierda, -arriba);
        interior.set_size(ancho + izquierda + derecha, alto + arriba + abajo);
        this._interior.allocate(interior);

        const escritorio = new Clutter.ActorBox();
        escritorio.set_origin(Math.round(izquierda - x), Math.round(arriba - y));
        escritorio.set_size(global.stage.width, global.stage.height);
        this._escritorio.allocate(escritorio);
        this._cristal.establecer({ancho, alto, radio: this._radio});
    }

    // ───────────────────────── Ventanas (solo la isla abierta) ─────────────────────────

    _sincronizarVentanas() {
        if (!this.mapped) {
            this._soltarVentanas();
            return;
        }
        // Se rehacen al abrirse y cuando cambia el orden o la lista de ventanas.
        const rehacer = protegido('vidrio: copiar ventanas', () => this._copiarVentanas());
        global.display.connectObject('restacked', rehacer, 'window-created', rehacer, this);
        global.workspace_manager.connectObject('active-workspace-changed', rehacer, this);
        this._copiarVentanas();
    }

    _copiarVentanas() {
        this._quitarCopiasVentanas();
        const espacio = global.workspace_manager.get_active_workspace();
        for (const actor of global.get_window_actors()) {
            const ventana = actor.get_meta_window?.();
            if (!ventana || ventana.minimized || !ventana.located_on_workspace(espacio))
                continue;
            const copia = new Clutter.Clone({source: actor});
            // Misma posición y tamaño que la ventana (y la siguen si se mueve).
            copia.add_constraint(new Clutter.BindConstraint({source: actor, coordinate: Clutter.BindCoordinate.ALL}));
            this._escritorio.add_child(copia);
            this._copiasVentanas.push(copia);
        }
    }

    _quitarCopiasVentanas() {
        for (const copia of this._copiasVentanas)
            copia.destroy();
        this._copiasVentanas = [];
    }

    _soltarVentanas() {
        global.display.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        this._quitarCopiasVentanas();
    }
});

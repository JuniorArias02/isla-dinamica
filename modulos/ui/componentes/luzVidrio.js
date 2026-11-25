// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * LuzVidrio — el reflejo de luz que sigue al puntero (estilo Liquid Glass).
 *
 * En iOS 26 el canto del vidrio brilla y el brillo se mueve al inclinar el
 * teléfono. Aquí lo mueve el puntero: con el puntero encima de la isla, el canto
 * se ilumina más cerca de él, con un halo muy suave alrededor.
 *
 *   ╭──────────────·✦·────────╮   ← el canto brilla junto al puntero
 *   │              (·)        │   ← halo suave
 *   ╰─────────────────────────╯
 *
 * Es una capa transparente encima de la isla (no recibe clics) que dibuja un
 * shader propio (EfectoLuz): la forma redondeada se calcula en el shader, igual
 * que en el vidrio. La luz se enciende al entrar el puntero y se apaga al salir,
 * con el motor de movimiento (respeta "Animaciones siempre").
 */

import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {
    DURACION_ENCENDER_LUZ_MS,
    DURACION_APAGAR_LUZ_MS,
    ANCHO_CANTO_LUZ_PX,
    INTENSIDAD_HALO_LUZ,
} from '../../constantes.js';
import {animarValor} from '../movimiento.js';

const DECLARACIONES = `
uniform vec2 tamano;
uniform float radio;
uniform vec2 luz;
uniform float alcance;
uniform float intensidad;
uniform float canto;
uniform float halo;

// Distancia con signo a un rectángulo redondeado centrado (negativa = dentro).
float distancia_redondeada(vec2 punto, vec2 mitad, float r) {
    vec2 q = abs(punto) - (mitad - vec2(r));
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
`;

const CODIGO = `
vec2 mitad = tamano * 0.5;
float r = min(radio, min(mitad.x, mitad.y));
vec2 punto = cogl_tex_coord_in[0].xy * tamano;
float d = distancia_redondeada(punto - mitad, mitad, r);

float dentro = clamp(0.5 - d, 0.0, 1.0);
// Franja junto al borde (el canto del vidrio), que se apaga hacia dentro.
float franja = dentro * (1.0 - smoothstep(0.0, canto, -d));
float lejania = distance(punto, luz);
float cerca = exp(-pow(lejania / alcance, 2.0));
float suave = dentro * halo * exp(-pow(lejania / (alcance * 1.6), 2.0));

float a = intensidad * clamp(franja * cerca * 0.95 + suave, 0.0, 1.0);
// Blanco con alfa premultiplicado.
cogl_color_out = vec4(a, a, a, a);
`;

/** Shader de la luz: canto iluminado cerca del puntero y halo suave. */
const EfectoLuz = GObject.registerClass(
class EfectoLuz extends Shell.GLSLEffect {
    _init(params) {
        super._init(params);
        this._ubicaciones = Object.fromEntries(
            ['tamano', 'radio', 'luz', 'alcance', 'intensidad', 'canto', 'halo']
                .map(nombre => [nombre, this.get_uniform_location(nombre)]));
        this.set_uniform_float(this._ubicaciones.canto, 1, [ANCHO_CANTO_LUZ_PX]);
        this.set_uniform_float(this._ubicaciones.halo, 1, [INTENSIDAD_HALO_LUZ]);
        this.establecer({intensidad: 0});
    }

    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, DECLARACIONES, CODIGO, true);
    }

    /**
     * @param {object} valores - Solo los que cambian.
     * @param {number} [valores.ancho]
     * @param {number} [valores.alto]
     * @param {number} [valores.radio]
     * @param {number} [valores.x] - Posición de la luz (px, dentro de la capa).
     * @param {number} [valores.y]
     * @param {number} [valores.alcance] - Hasta dónde llega la luz (px).
     * @param {number} [valores.intensidad] - 0–1.
     */
    establecer({ancho, alto, radio, x, y, alcance, intensidad}) {
        const u = this._ubicaciones;
        if (ancho !== undefined)
            this.set_uniform_float(u.tamano, 2, [Math.max(1, ancho), Math.max(1, alto)]);
        if (radio !== undefined)
            this.set_uniform_float(u.radio, 1, [radio]);
        if (x !== undefined)
            this.set_uniform_float(u.luz, 2, [x, y]);
        if (alcance !== undefined)
            this.set_uniform_float(u.alcance, 1, [alcance]);
        if (intensidad !== undefined)
            this.set_uniform_float(u.intensidad, 1, [intensidad]);
        this.queue_repaint();
    }
});

export const LuzVidrio = GObject.registerClass(
class LuzVidrio extends St.Widget {
    /**
     * @param {object} opciones
     * @param {number} opciones.radio - Radio de las esquinas (999 = cápsula).
     * @param {number} opciones.alcance - Hasta dónde llega la luz desde el puntero (px).
     */
    _init({radio, alcance}) {
        super._init({style_class: 'isla-luz-vidrio', reactive: false, x_expand: true, y_expand: true, visible: false});
        this._radio = radio;
        this._intensidad = 0;
        this._destino = 0;
        this._cambio = null;
        this._efecto = new EfectoLuz();
        this._efecto.establecer({radio, alcance});
        this.add_effect_with_name('isla-luz', this._efecto);
        this.connect('destroy', () => this._cambio?.stop());
    }

    /** No pide sitio: ocupa lo que le dé su contenedor. */
    vfunc_get_preferred_width(_alto) {
        return [0, 0];
    }

    vfunc_get_preferred_height(_ancho) {
        return [0, 0];
    }

    vfunc_allocate(caja) {
        this.set_allocation(caja);
        this._efecto.establecer({ancho: caja.get_width(), alto: caja.get_height(), radio: this._radio});
    }

    /**
     * El puntero se movió: la luz va hacia él (y se enciende si estaba apagada).
     * @param {number} xPantalla
     * @param {number} yPantalla
     */
    seguir(xPantalla, yPantalla) {
        if (!this.visible)
            return;
        const [dentro, x, y] = this.transform_stage_point(xPantalla, yPantalla);
        if (!dentro)
            return;
        this._efecto.establecer({x, y});
        this._llevarA(1, DURACION_ENCENDER_LUZ_MS);
    }

    /** El puntero salió: la luz se apaga despacio. */
    apagar() {
        this._llevarA(0, DURACION_APAGAR_LUZ_MS);
    }

    _llevarA(destino, duracion) {
        if (this._destino === destino)
            return;
        this._destino = destino;
        this._cambio?.stop();
        const desde = this._intensidad;
        this._cambio = animarValor(this, {
            duracion,
            alCambiar: avance => {
                this._intensidad = desde + (destino - desde) * avance;
                this._efecto.establecer({intensidad: this._intensidad});
            },
        });
    }
});

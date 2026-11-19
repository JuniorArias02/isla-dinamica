/**
 * Motor de movimiento de la Isla Dinámica.
 *
 * Toda animación de la isla pasa por aquí. Aporta tres cosas sobre `actor.ease()`:
 *
 *  1. Forzado opcional: si el ajuste "Animaciones siempre" está activo, la isla anima aunque
 *     GNOME tenga las animaciones apagadas (`animationRequired`). El resto del
 *     escritorio sigue como el usuario lo tenga.
 *
 *  2. Resortes: la forma se pasa un poco del destino, rebota y se asienta (como iOS).
 *     Con USAR_RESORTE_FISICO=true se usa la ecuación real de un resorte amortiguado;
 *     con false (por defecto) se usa la curva integrada de GNOME más parecida
 *     (EASE_OUT_BACK si el resorte rebota, EASE_OUT_CUBIC si es firme).
 *
 *  3. Desenfoque de contenido: el contenido entra y sale desenfocado + transparente
 *     + escalado, como en la Dynamic Island. El efecto existe solo durante la
 *     transición (~300 ms) y se elimina al terminar para no cargar la GPU.
 *
 * Todo sigue siendo una transición del compositor: ningún temporizador en JS.
 */

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';

import {
    USAR_RESORTE_FISICO,
    USAR_DESENFOQUE,
    DESENFOQUE_CONTENIDO_PX,
    DURACION_CONTENIDO_ENTRADA_MS,
    DURACION_CONTENIDO_SALIDA_MS,
} from '../constantes.js';
import {registrarAviso} from '../registro.js';
import {ajuste, AJUSTES} from '../ajustes.js';

/** @returns {boolean} Si la isla debe animar aunque GNOME tenga las animaciones apagadas. */
function animacionObligatoria() {
    return ajuste(AJUSTES.FORZAR_ANIMACIONES);
}

const NOMBRE_EFECTO_DESENFOQUE = 'isla-desenfoque';

/** Umbral de amplitud restante para considerar que el resorte ya se asentó. */
const AMPLITUD_ASENTADO = 0.002;

let avisoResorteMostrado = false;

// ───────────────────────── Animación básica ─────────────────────────

/**
 * Igual que `actor.ease(props)`, pero respetando el ajuste "Animaciones siempre".
 * @param {Clutter.Actor} actor
 * @param {object} propiedades - Propiedades destino + duration, mode, delay, onComplete...
 */
export function animar(actor, propiedades) {
    actor.ease({...propiedades, animationRequired: animacionObligatoria()});
}

/**
 * Igual que `actor.ease_property()`, pero respetando el ajuste "Animaciones siempre".
 * @param {Clutter.Actor} actor
 * @param {string} propiedad - Nombre de la propiedad (admite '@effects.nombre.prop').
 * @param {*} valor - Valor destino.
 * @param {object} parametros - duration, mode, delay, onComplete...
 */
export function animarPropiedad(actor, propiedad, valor, parametros) {
    actor.ease_property(propiedad, valor, {...parametros, animationRequired: animacionObligatoria()});
}

// ───────────────────────── Resortes ─────────────────────────

/**
 * Tiempo (ms) que tarda un resorte en asentarse.
 * @param {{respuesta: number, amortiguacion: number}} resorte
 * @returns {number}
 */
export function duracionResorte({respuesta, amortiguacion}) {
    if (!USAR_RESORTE_FISICO)
        return Math.round(respuesta * (amortiguacion < 0.8 ? 1100 : 800));
    const omega = (2 * Math.PI) / respuesta;
    const decaimiento = amortiguacion * omega;
    return Math.round((Math.log(1 / AMPLITUD_ASENTADO) / decaimiento) * 1000);
}

/**
 * Posición (0 → 1, con rebote) de un resorte amortiguado en el instante t.
 * Solución analítica de x'' + 2ζω x' + ω² x = 0 partiendo de 0 hacia 1.
 *
 * @param {{respuesta: number, amortiguacion: number}} resorte
 * @param {number} segundos
 * @returns {number}
 */
function posicionResorte({respuesta, amortiguacion}, segundos) {
    const omega = (2 * Math.PI) / respuesta;
    const zeta = Math.min(amortiguacion, 0.999);
    const omegaAmortiguada = omega * Math.sqrt(1 - zeta * zeta);
    const envolvente = Math.exp(-zeta * omega * segundos);
    return 1 - envolvente * (
        Math.cos(omegaAmortiguada * segundos) +
        (zeta * omega / omegaAmortiguada) * Math.sin(omegaAmortiguada * segundos));
}

/**
 * Anima propiedades con un resorte físico.
 *
 * @param {Clutter.Actor} actor
 * @param {object} propiedades - Valores destino (ej. {width: 420, x: 300}).
 * @param {object} opciones
 * @param {{respuesta: number, amortiguacion: number}} opciones.resorte
 * @param {number} [opciones.retraso=0] - ms antes de empezar.
 * @param {Function} [opciones.alTerminar] - Solo si la animación llega al final.
 */
export function animarConResorte(actor, propiedades, {resorte, retraso = 0, alTerminar}) {
    if (!USAR_RESORTE_FISICO) {
        animarConCurvaIntegrada(actor, propiedades, {resorte, retraso, alTerminar});
        return;
    }

    const duracion = duracionResorte(resorte);
    const nombres = Object.keys(propiedades);

    actor.ease({
        ...propiedades,
        duration: duracion,
        delay: retraso,
        mode: Clutter.AnimationMode.LINEAR,
        animationRequired: animacionObligatoria(),
        onComplete: alTerminar,
    });

    // Se reemplaza el progreso lineal por la curva del resorte en cada transición creada.
    for (const nombre of nombres) {
        const transicion = actor.get_transition(nombre.replaceAll('_', '-'));
        if (!transicion)
            continue;
        try {
            transicion.set_progress_func((_linea, transcurrido, total) => {
                if (total <= 0 || transcurrido >= total)
                    return 1;
                // Se usa el tiempo real (no normalizado) para que la física sea la misma
                // aunque el sistema acelere o ralentice las animaciones.
                const segundos = (transcurrido / total) * (duracion / 1000);
                return posicionResorte(resorte, segundos);
            });
        } catch (error) {
            // Si esta versión de Clutter no admite curvas propias, se usa la más parecida.
            transicion.set_progress_mode(Clutter.AnimationMode.EASE_OUT_BACK);
            if (!avisoResorteMostrado) {
                avisoResorteMostrado = true;
                registrarAviso(`Resortes no disponibles, se usa EASE_OUT_BACK: ${error.message}`);
            }
        }
    }
}

/**
 * Equivalente al resorte con las curvas integradas de GNOME (código en C, probado).
 * - Resorte con rebote (amortiguación < 0,8) → EASE_OUT_BACK: se pasa ~10 % y vuelve.
 * - Resorte firme → EASE_OUT_CUBIC: llega rápido y frena suave.
 * La duración sale de la `respuesta` del resorte.
 */
function animarConCurvaIntegrada(actor, propiedades, {resorte, retraso, alTerminar}) {
    const conRebote = resorte.amortiguacion < 0.8;
    actor.ease({
        ...propiedades,
        duration: Math.round(resorte.respuesta * (conRebote ? 1100 : 800)),
        delay: retraso,
        mode: conRebote ? Clutter.AnimationMode.EASE_OUT_BACK : Clutter.AnimationMode.EASE_OUT_CUBIC,
        animationRequired: animacionObligatoria(),
        onComplete: alTerminar,
    });
}

// ───────────────────────── Contenido con desenfoque ─────────────────────────

function obtenerDesenfoque(actor) {
    let efecto = actor.get_effect(NOMBRE_EFECTO_DESENFOQUE);
    if (!efecto) {
        efecto = new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR, radius: 0, brightness: 1});
        actor.add_effect_with_name(NOMBRE_EFECTO_DESENFOQUE, efecto);
    }
    return efecto;
}

function quitarDesenfoque(actor) {
    if (actor.get_effect(NOMBRE_EFECTO_DESENFOQUE))
        actor.remove_effect_by_name(NOMBRE_EFECTO_DESENFOQUE);
}

/**
 * El contenido aparece como en la Dynamic Island: de desenfocado, transparente
 * y un poco pequeño, a nítido y a tamaño real.
 *
 * @param {Clutter.Actor} actor
 * @param {object} [opciones]
 * @param {number} [opciones.retraso=0]
 * @param {number} [opciones.escalaInicial=0.92]
 * @param {number} [opciones.pivoteY=0] - 0 = crece desde arriba (la cámara/cápsula).
 */
export function entrarConDesenfoque(actor, {retraso = 0, escalaInicial = 0.92, pivoteY = 0} = {}) {
    for (const propiedad of ['opacity', 'scale-x', 'scale-y'])
        actor.remove_transition(propiedad);

    actor.set_pivot_point(0.5, pivoteY);
    actor.set({opacity: 0, scale_x: escalaInicial, scale_y: escalaInicial});

    const parametros = {
        duration: DURACION_CONTENIDO_ENTRADA_MS,
        delay: retraso,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
    };
    animar(actor, {opacity: 255, scale_x: 1, scale_y: 1, ...parametros});

    if (!USAR_DESENFOQUE)
        return;
    const efecto = obtenerDesenfoque(actor);
    actor.remove_transition(`@effects.${NOMBRE_EFECTO_DESENFOQUE}.radius`);
    efecto.radius = DESENFOQUE_CONTENIDO_PX;
    animarPropiedad(actor, `@effects.${NOMBRE_EFECTO_DESENFOQUE}.radius`, 0, {
        ...parametros,
        // Al terminar se elimina el efecto: la GPU solo trabaja durante la transición.
        onComplete: () => quitarDesenfoque(actor),
    });
}

/**
 * El contenido se va desenfocándose y desvaneciéndose (más rápido que la entrada).
 * @param {Clutter.Actor} actor
 * @param {Function} [alTerminar] - Solo si la salida termina (no si se interrumpe).
 */
export function salirConDesenfoque(actor, alTerminar) {
    const parametros = {
        duration: DURACION_CONTENIDO_SALIDA_MS,
        mode: Clutter.AnimationMode.EASE_IN_QUAD,
    };
    actor.set_pivot_point(0.5, 0);
    animar(actor, {opacity: 0, scale_x: 0.96, scale_y: 0.96, ...parametros, onComplete: alTerminar});

    if (!USAR_DESENFOQUE)
        return;
    const efecto = obtenerDesenfoque(actor);
    actor.remove_transition(`@effects.${NOMBRE_EFECTO_DESENFOQUE}.radius`);
    efecto.radius = 0;
    animarPropiedad(actor, `@effects.${NOMBRE_EFECTO_DESENFOQUE}.radius`, DESENFOQUE_CONTENIDO_PX, parametros);
}

/**
 * Deja el actor nítido, visible y a tamaño real, sin transiciones pendientes.
 * @param {Clutter.Actor} actor
 */
export function restablecerContenido(actor) {
    for (const propiedad of ['opacity', 'scale-x', 'scale-y'])
        actor.remove_transition(propiedad);
    actor.remove_transition(`@effects.${NOMBRE_EFECTO_DESENFOQUE}.radius`);
    quitarDesenfoque(actor);
    actor.set({opacity: 255, scale_x: 1, scale_y: 1});
}

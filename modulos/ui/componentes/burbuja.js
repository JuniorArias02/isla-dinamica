/**
 * Burbuja — el círculo que se separa de la cápsula, como la isla del iPhone
 * cuando hay dos actividades a la vez. Muestra la actividad SECUNDARIA:
 *
 *   temporizador → mini anillo naranja que se vacía + cronómetro
 *   música       → la portada en círculo
 *   auriculares  → anillo de batería con el icono de los AirPods
 *
 * Tocarla intercambia las actividades (lo decide IslaUI); con el puntero
 * encima, la isla se abre en la página de lo que muestra.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {DURACION_APARICION_MS, RESORTES, ACTIVIDADES, ESTADOS_TEMPORIZADOR} from '../../constantes.js';
import {animar, animarConResorte} from '../movimiento.js';
import {aparecerConRebote} from '../animaciones.js';
import {icono, ICONOS} from '../iconos.js';
import {IndicadorBateria} from './anilloBateria.js';
import {nivelMostrado} from './bateriasAirpods.js';
import {AnilloProgreso} from './anilloProgreso.js';
import {Caratula} from './caratula.js';

/** Distancia desde la que "sale" la burbuja de la cápsula. */
const DESPLAZAMIENTO_SALIDA_PX = -18;
const DIAMETRO_CONTENIDO_PX = 20;

export const Burbuja = GObject.registerClass(
class Burbuja extends St.Bin {
    _init() {
        super._init({
            style_class: 'isla-burbuja',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
            reactive: true,
            track_hover: true,
        });
        this.set_pivot_point(0.5, 0.5);

        // Un contenido por tipo; solo uno está dentro de la burbuja a la vez.
        this._contenidos = {
            [ACTIVIDADES.AURICULARES]: new IndicadorBateria({diametro: DIAMETRO_CONTENIDO_PX, grosor: 2.5, centro: 'icono'}),
            [ACTIVIDADES.TEMPORIZADOR]: this._crearTemporizador(),
            [ACTIVIDADES.MUSICA]: new Caratula({claseTamano: 'isla-caratula-burbuja'}),
        };

        this._tipo = null;
        this.connect('destroy', () => {
            this.remove_all_transitions();
            // Los contenidos que no están dentro de la burbuja no se destruyen solos.
            for (const contenido of Object.values(this._contenidos)) {
                if (contenido.get_parent() !== this)
                    contenido.destroy();
            }
        });
    }

    /** @returns {string|null} Qué muestra ahora (valor de ACTIVIDADES) o null si está oculta. */
    get tipo() {
        return this._tipo;
    }

    _crearTemporizador() {
        const caja = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            width: DIAMETRO_CONTENIDO_PX,
            height: DIAMETRO_CONTENIDO_PX,
        });
        this._anilloTemporizador = new AnilloProgreso({diametro: DIAMETRO_CONTENIDO_PX, grosor: 2.5});
        caja.add_child(this._anilloTemporizador);
        caja.add_child(new St.Icon({
            gicon: icono(ICONOS.TEMPORIZADOR),
            style_class: 'isla-burbuja-temporizador-icono',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        return caja;
    }

    /**
     * Muestra la actividad secundaria o esconde la burbuja.
     * @param {object} datos
     * @param {string|null} datos.tipo - Valor de ACTIVIDADES, o null.
     * @param {object|null} [datos.dispositivo] - Auriculares (para AURICULARES).
     * @param {object|null} [datos.pista] - Pista (para MUSICA).
     * @param {object|null} [datos.temporizador] - {totalMs, restanteMs, estado} (para TEMPORIZADOR).
     */
    actualizar({tipo, dispositivo = null, pista = null, temporizador = null}) {
        const anterior = this._tipo;
        this._tipo = tipo;

        if (!tipo) {
            if (anterior)
                this._unir();
            return;
        }

        const contenido = this._contenidos[tipo];
        if (tipo !== anterior)
            this.set_child(contenido);

        switch (tipo) {
        case ACTIVIDADES.AURICULARES:
            contenido.establecer(nivelMostrado(dispositivo), {desdeCero: tipo !== anterior});
            break;
        case ACTIVIDADES.MUSICA:
            contenido.establecer(pista?.urlCaratula ?? null);
            break;
        case ACTIVIDADES.TEMPORIZADOR: {
            const {totalMs = 0, restanteMs = 0, estado} = temporizador ?? {};
            const fraccion = totalMs > 0 ? restanteMs / totalMs : 0;
            // Corriendo: se anima hacia donde estará en un segundo (sincronizado con la cápsula).
            const corriendo = estado === ESTADOS_TEMPORIZADOR.CORRIENDO;
            const siguiente = corriendo && totalMs > 0 ? Math.max(0, (restanteMs - 1000) / totalMs) : fraccion;
            if (tipo !== anterior)
                this._anilloTemporizador.establecer(fraccion);
            this._anilloTemporizador.establecer(siguiente, {duracion: corriendo ? 1000 : 0});
            break;
        }
        }

        if (!anterior)
            this._separar();
        else if (tipo !== anterior)
            aparecerConRebote(contenido, {escalaInicial: 0.3});
    }

    /** La burbuja sale de la cápsula con un rebote. */
    _separar() {
        this.remove_all_transitions();
        this.set({
            visible: true,
            opacity: 0,
            scale_x: 0.2,
            scale_y: 0.2,
            translation_x: DESPLAZAMIENTO_SALIDA_PX,
        });
        animar(this, {opacity: 255, duration: 180, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        // Se separa de la cápsula como una gota: con resorte y rebote.
        animarConResorte(this, {scale_x: 1, scale_y: 1, translation_x: 0}, {resorte: RESORTES.REBOTE});
    }

    /** La burbuja vuelve a meterse en la cápsula y desaparece. */
    _unir() {
        this.remove_all_transitions();
        animar(this, {
            opacity: 0,
            scale_x: 0.2,
            scale_y: 0.2,
            translation_x: DESPLAZAMIENTO_SALIDA_PX,
            duration: DURACION_APARICION_MS * 0.7,
            mode: Clutter.AnimationMode.EASE_IN_BACK,
            onComplete: () => this.hide(),
        });
    }
});

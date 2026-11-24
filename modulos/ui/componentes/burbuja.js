// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Burbuja — el círculo que se separa de la cápsula, como la isla del iPhone
 * cuando hay dos actividades a la vez. Muestra la actividad SECUNDARIA:
 *
 *   temporizador → mini anillo naranja que se vacía + cronómetro
 *   música       → la portada en círculo
 *   audio        → el logo de la app del audio (WhatsApp)
 *   auriculares  → anillo de batería con el icono de los AirPods
 *   llamada que suena (con su aviso oculto) → círculo verde con un teléfono que late;
 *                  tocarlo vuelve a mostrar el aviso con sus botones
 *
 * Tocarla intercambia las actividades (lo decide IslaUI); con el puntero
 * encima, la isla se abre en la página de lo que muestra.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
    DURACION_APARICION_MS,
    RESORTES,
    ACTIVIDADES,
    ESTADOS_TEMPORIZADOR,
    ESCALA_CAMBIO_BURBUJA,
    DURACION_CAMBIO_BURBUJA_MS,
} from '../../constantes.js';
import {animar, animarConResorte} from '../movimiento.js';
import {aparecerConRebote, latir, detenerLatido} from '../animaciones.js';
import {icono, ICONOS, iconoDeAppDeAudio} from '../iconos.js';
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
            [ACTIVIDADES.AUDIO]: new Caratula({claseTamano: 'isla-caratula-burbuja'}),
            [ACTIVIDADES.LLAMADA_ENTRANTE]: new St.Icon({
                gicon: icono(ICONOS.TELEFONO),
                style_class: 'isla-burbuja-llamada-icono',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            }),
        };
        this._latiendo = false;
        // El teléfono late solo mientras se ve la llamada que suena.
        this.connect('notify::mapped', () => this._sincronizarLatido());

        this._tipo = null;
        /** Cambio de actividad en curso (encogiéndose) y los datos que llegaron mientras tanto. */
        this._cambiando = false;
        this._pendiente = null;
        this.connect('destroy', () => {
            this._latiendo = false;
            detenerLatido(this._contenidos[ACTIVIDADES.LLAMADA_ENTRANTE]);
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
     * @param {object|null} [datos.audio] - Audio de un chat (para AUDIO).
     * @param {object|null} [datos.temporizador] - {totalMs, restanteMs, estado} (para TEMPORIZADOR).
     */
    actualizar(datos) {
        this._pendiente = datos;
        // Encogiéndose: al terminar se aplica lo último que llegó.
        if (this._cambiando)
            return;
        // Otra actividad en el círculo: se encoge hasta un punto, cambia y vuelve a crecer.
        if (this._tipo && datos.tipo && datos.tipo !== this._tipo && this.mapped) {
            this._encoger();
            return;
        }
        this._aplicar(datos, false);
    }

    /** Fase 1 del cambio: el círculo se encoge hasta un punto. */
    _encoger() {
        this._cambiando = true;
        this.set_pivot_point(0.5, 0.5);
        animar(this, {
            scale_x: ESCALA_CAMBIO_BURBUJA,
            scale_y: ESCALA_CAMBIO_BURBUJA,
            opacity: 0,
            duration: DURACION_CAMBIO_BURBUJA_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                this._cambiando = false;
                this._aplicar(this._pendiente, true);
            },
            // Si otra animación la interrumpe (ej. se une a la cápsula), no se queda a medias.
            onStopped: terminado => {
                if (!terminado && this._cambiando) {
                    this._cambiando = false;
                    this._aplicar(this._pendiente, false);
                }
            },
        });
    }

    /**
     * @param {object} datos - {tipo, dispositivo, pista, temporizador}
     * @param {boolean} crecer - true tras encogerse: el círculo vuelve a crecer con resorte.
     */
    _aplicar({tipo, dispositivo = null, pista = null, audio = null, temporizador = null}, crecer) {
        const anterior = this._tipo;
        this._tipo = tipo;

        if (tipo === ACTIVIDADES.LLAMADA_ENTRANTE)
            this.add_style_class_name('llamada');
        else
            this.remove_style_class_name('llamada');

        if (!tipo) {
            this._sincronizarLatido();
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
        case ACTIVIDADES.AUDIO:
            // Audio de un chat: el logo de la app en lugar de la nota.
            contenido.establecerIcono(iconoDeAppDeAudio(audio?.appAudio ?? null));
            contenido.establecer(null);
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

        if (!anterior) {
            this._separar();
        } else if (crecer) {
            // Fase 2: vuelve a crecer desde el punto, con rebote.
            animar(this, {opacity: 255, duration: DURACION_CAMBIO_BURBUJA_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            animarConResorte(this, {scale_x: 1, scale_y: 1}, {resorte: RESORTES.FLORECER});
        } else if (tipo !== anterior) {
            aparecerConRebote(contenido, {escalaInicial: 0.3});
        }
        // Al final: la aparición usa la opacidad del contenido y el latido también.
        this._sincronizarLatido();
    }

    /** Vuelve a salir de la cápsula (tras asomarse a otra vista, que la tapó). */
    reaparecer() {
        if (this._tipo && !this._cambiando)
            this._separar();
    }

    _sincronizarLatido() {
        const debeLatir = this.mapped && this._tipo === ACTIVIDADES.LLAMADA_ENTRANTE;
        if (debeLatir === this._latiendo)
            return;
        this._latiendo = debeLatir;
        const telefono = this._contenidos[ACTIVIDADES.LLAMADA_ENTRANTE];
        if (debeLatir)
            latir(telefono);
        else
            detenerLatido(telefono);
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

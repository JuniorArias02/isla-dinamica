// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * VistaExpandida — contenido de la tarjeta abierta.
 *
 * Arma el carrusel con las páginas que tengan algo que mostrar:
 *   notificaciones  → si hay notificaciones recientes
 *   dispositivos    → si hay auriculares conectados
 *   llamada         → solo durante una llamada o videollamada (la primera)
 *   grabación       → solo mientras se graba la pantalla (antes que el calendario)
 *   calendario      → siempre: el mes y los próximos eventos
 *   música          → si hay un reproductor con música
 *   audio           → si suena un audio de un chat (nota de voz): página propia,
 *                     con el diseño de audio (solo reproducir/pausa)
 *   temporizador    → siempre (al final), para poder ponerlo cuando se quiera
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {ANCHO_EXPANDIDO_PX} from '../../constantes.js';
import {Carrusel} from '../componentes/carrusel.js';
import {protegido} from '../../registro.js';
import {PaginaMusica} from './paginaMusica.js';
import {PaginaDispositivos} from './paginaDispositivos.js';
import {PaginaNotificaciones} from './paginaNotificaciones.js';
import {PaginaTemporizador} from './paginaTemporizador.js';
import {PaginaCalendario} from './paginaCalendario.js';
import {PaginaGrabacion} from './paginaGrabacion.js';
import {PaginaLlamada} from './paginaLlamada.js';

/** Relleno interior de la tarjeta (debe coincidir con .isla-expandida en el CSS). */
const RELLENO_PX = 20;

/**
 * Identificadores de página.
 * @enum {string}
 */
export const PAGINAS = Object.freeze({
    LLAMADA: 'llamada',
    GRABACION: 'grabacion',
    CALENDARIO: 'calendario',
    MUSICA: 'musica',
    AUDIO: 'audio',
    NOTIFICACIONES: 'notificaciones',
    DISPOSITIVOS: 'dispositivos',
    TEMPORIZADOR: 'temporizador',
});

export const VistaExpandida = GObject.registerClass(
class VistaExpandida extends St.BoxLayout {
    /**
     * @param {object} opciones
     * @param {object} opciones.multimedia - Acciones de música (ver PaginaMusica).
     * @param {object} opciones.audio - Las mismas acciones, sobre el reproductor del audio de chat.
     * @param {Function} opciones.alPulsarFecha - Abre el calendario de GNOME.
     * @param {Function} opciones.alCambiarModoRuido - Recibe (ruta, modo) de unos AirPods.
     * @param {Function} opciones.alCambiarAltura - La página visible cambió de alto: la isla debe adaptarse.
     * @param {object} opciones.notificaciones - Acciones {activar(id), descartar(id), limpiar()}.
     * @param {Function} [opciones.alVerPagina] - Recibe el id de la página que el usuario está viendo.
     * @param {object} opciones.temporizador - Acciones {iniciar(ms), sumar(ms), pausar(), reanudar(), cancelar()}.
     * @param {Function} opciones.alAbrirCalendario - Abre la app Calendario.
     * @param {Function} opciones.alDetenerGrabacion - Detiene la grabación de pantalla.
     * @param {object} opciones.llamada - Acciones {mostrar(), alternarSilencio()} de la llamada en curso.
     */
    _init({multimedia, audio, alPulsarFecha, alCambiarModoRuido, alCambiarAltura, notificaciones, alVerPagina, temporizador,
        alAbrirCalendario, alDetenerGrabacion, llamada}) {
        super._init({
            style_class: 'isla-expandida',
            orientation: Clutter.Orientation.VERTICAL,
        });

        this._activa = false;
        this._alCambiarAltura = alCambiarAltura;
        this._alVerPagina = alVerPagina;

        this._paginaMusica = new PaginaMusica(multimedia);
        // El audio de un chat usa la misma página con su propio diseño (lo decide pista.tipo).
        this._paginaAudio = new PaginaMusica(audio);
        this._paginaDispositivos = new PaginaDispositivos(alCambiarModoRuido);
        this._paginaNotificaciones = new PaginaNotificaciones(notificaciones);
        this._paginaTemporizador = new PaginaTemporizador(temporizador);
        this._paginaCalendario = new PaginaCalendario({alAbrir: alAbrirCalendario});
        this._paginaGrabacion = new PaginaGrabacion({alDetener: alDetenerGrabacion});
        this._paginaLlamada = new PaginaLlamada({
            alMostrar: () => llamada.mostrar(),
            alAlternarSilencio: () => llamada.alternarSilencio(),
        });

        this._construirCabecera(alPulsarFecha);

        this._carrusel = new Carrusel({
            anchoPagina: ANCHO_EXPANDIDO_PX - 2 * RELLENO_PX,
            alCambiarPagina: id => this._alCambiarPagina(id),
        });
        this.add_child(this._carrusel);

        // Deslizar a los lados en cualquier parte de la isla abierta (también sobre la fecha
        // o los puntos) cambia de página. Lo vertical sigue llegando a la tarjeta (cierra).
        this.reactive = true;
        this.connect('scroll-event', protegido('expandida: deslizar',
            (_actor, evento) => this._carrusel.alHacerScroll(evento), Clutter.EVENT_PROPAGATE));

        this.connect('destroy', () => {
            // Las páginas son de esta vista: primero se sacan del carrusel y luego se destruyen.
            this._carrusel.soltarPaginas();
            this._paginaMusica.destroy();
            this._paginaAudio.destroy();
            this._paginaDispositivos.destroy();
            this._paginaNotificaciones.destroy();
            this._paginaTemporizador.destroy();
            this._paginaCalendario.destroy();
            this._paginaGrabacion.destroy();
            this._paginaLlamada.destroy();
        });
    }

    /** Fecha (clic → calendario y notificaciones de GNOME) y hora. */
    _construirCabecera(alPulsarFecha) {
        const cabecera = new St.BoxLayout({style_class: 'isla-cabecera'});

        this._fecha = new St.Label({style_class: 'isla-cabecera-fecha', y_align: Clutter.ActorAlign.CENTER});
        const botonFecha = new St.Button({
            style_class: 'isla-cabecera-boton-fecha',
            child: this._fecha,
            can_focus: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        botonFecha.connect('clicked', protegido('expandida: abrir calendario', () => alPulsarFecha()));

        this._hora = new St.Label({style_class: 'isla-cabecera-hora', y_align: Clutter.ActorAlign.CENTER});

        cabecera.add_child(botonFecha);
        cabecera.add_child(this._hora);
        this.add_child(cabecera);
    }

    /**
     * Actualiza datos y decide qué páginas existen.
     * @param {object|null} pista
     * @param {object[]} dispositivos
     * @param {{hora: string, fecha: string}|null} reloj
     * @param {object[]} [notificaciones=[]] - Recientes, la más nueva primero.
     * @param {object|null} [temporizador=null] - {estado, totalMs, restanteMs}
     * @param {object|null} [calendario=null] - {hayCalendarios, inicioSemana, eventos}
     * @param {object|null} [grabacion=null] - {grabando, transcurridoMs}
     * @param {object|null} [llamada=null] - {enLlamada, nombre, transcurridoMs, silenciado}
     * @param {object|null} [audio=null] - Audio de un chat sonando (nota de voz).
     */
    actualizar(pista, dispositivos, reloj, notificaciones = [], temporizador = null, calendario = null, grabacion = null,
        llamada = null, audio = null) {
        this._fecha.text = reloj?.fecha ?? '';
        this._hora.text = reloj?.hora ?? '';

        this._paginaMusica.actualizar(pista);
        this._paginaAudio.actualizar(audio);
        this._paginaDispositivos.actualizar(dispositivos);
        this._paginaNotificaciones.actualizar(notificaciones);
        this._paginaTemporizador.actualizar(temporizador);
        this._paginaCalendario.actualizar(calendario);
        this._paginaGrabacion.actualizar(grabacion);
        this._paginaLlamada.actualizar(llamada);

        // Mientras se graba, la grabación va primero. Después el calendario: es la página
        // de la hora (la vista base de la cápsula).
        const paginas = [];
        if (llamada?.enLlamada)
            paginas.push({id: PAGINAS.LLAMADA, actor: this._paginaLlamada});
        if (grabacion?.grabando)
            paginas.push({id: PAGINAS.GRABACION, actor: this._paginaGrabacion});
        paginas.push({id: PAGINAS.CALENDARIO, actor: this._paginaCalendario});
        if (pista)
            paginas.push({id: PAGINAS.MUSICA, actor: this._paginaMusica});
        if (audio)
            paginas.push({id: PAGINAS.AUDIO, actor: this._paginaAudio});
        if (notificaciones.length > 0)
            paginas.push({id: PAGINAS.NOTIFICACIONES, actor: this._paginaNotificaciones});
        if (dispositivos.length > 0)
            paginas.push({id: PAGINAS.DISPOSITIVOS, actor: this._paginaDispositivos});
        paginas.push({id: PAGINAS.TEMPORIZADOR, actor: this._paginaTemporizador});

        this._carrusel.establecerPaginas(paginas);
        // Si cambió el contenido de la página visible (ej. llegó la batería de los AirPods).
        this._carrusel.ajustarAltura();
    }

    /**
     * La tarjeta se abrió o se cerró.
     * @param {boolean} activa
     * @param {string} [paginaInicial] - Página a mostrar al abrir.
     */
    establecerActiva(activa, paginaInicial) {
        if (activa === this._activa)
            return;
        this._activa = activa;

        if (activa && paginaInicial)
            this._carrusel.irA(paginaInicial, false);

        this._alCambiarPagina(this._carrusel.paginaActual);
    }

    _alCambiarPagina(id) {
        this._paginaMusica.establecerActiva(this._activa && id === PAGINAS.MUSICA);
        this._paginaAudio.establecerActiva(this._activa && id === PAGINAS.AUDIO);
        this._paginaGrabacion.establecerActiva(this._activa && id === PAGINAS.GRABACION);
        if (this._activa && id === PAGINAS.DISPOSITIVOS)
            this._paginaDispositivos.animarEntrada();
        // Cada página tiene su alto: la isla crece o se encoge al deslizar.
        if (this._activa) {
            this._alCambiarAltura?.();
            this._alVerPagina?.(id);
        }
    }

    /** @returns {string|null} Página visible (si la tarjeta está abierta). */
    get paginaVisible() {
        return this._activa ? this._carrusel.paginaActual : null;
    }
});

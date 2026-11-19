// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * VistaExpandida — contenido de la tarjeta abierta.
 *
 * Arma el carrusel con las páginas que tengan algo que mostrar:
 *   música          → si hay un reproductor
 *   notificaciones  → si hay notificaciones recientes
 *   dispositivos    → si hay auriculares conectados
 *   temporizador    → siempre (al final), para poder ponerlo cuando se quiera
 *   vacía         → si no hay nada de lo anterior
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {ANCHO_EXPANDIDO_PX} from '../../constantes.js';
import {icono, ICONOS} from '../iconos.js';
import {Carrusel} from '../componentes/carrusel.js';
import {protegido} from '../../registro.js';
import {PaginaMusica} from './paginaMusica.js';
import {PaginaDispositivos} from './paginaDispositivos.js';
import {PaginaNotificaciones} from './paginaNotificaciones.js';
import {PaginaTemporizador} from './paginaTemporizador.js';

/** Relleno interior de la tarjeta (debe coincidir con .isla-expandida en el CSS). */
const RELLENO_PX = 20;

/**
 * Identificadores de página.
 * @enum {string}
 */
export const PAGINAS = Object.freeze({
    MUSICA: 'musica',
    NOTIFICACIONES: 'notificaciones',
    DISPOSITIVOS: 'dispositivos',
    TEMPORIZADOR: 'temporizador',
    VACIA: 'vacia',
});

export const VistaExpandida = GObject.registerClass(
class VistaExpandida extends St.BoxLayout {
    /**
     * @param {object} opciones
     * @param {object} opciones.multimedia - Acciones de música (ver PaginaMusica).
     * @param {Function} opciones.alPulsarFecha - Abre el calendario de GNOME.
     * @param {Function} opciones.alCambiarModoRuido - Recibe (ruta, modo) de unos AirPods.
     * @param {Function} opciones.alCambiarAltura - La página visible cambió de alto: la isla debe adaptarse.
     * @param {object} opciones.notificaciones - Acciones {activar(id), descartar(id), limpiar()}.
     * @param {Function} [opciones.alVerPagina] - Recibe el id de la página que el usuario está viendo.
     * @param {object} opciones.temporizador - Acciones {iniciar(ms), sumar(ms), pausar(), reanudar(), cancelar()}.
     */
    _init({multimedia, alPulsarFecha, alCambiarModoRuido, alCambiarAltura, notificaciones, alVerPagina, temporizador}) {
        super._init({
            style_class: 'isla-expandida',
            orientation: Clutter.Orientation.VERTICAL,
        });

        this._activa = false;
        this._alCambiarAltura = alCambiarAltura;
        this._alVerPagina = alVerPagina;

        this._paginaMusica = new PaginaMusica(multimedia);
        this._paginaDispositivos = new PaginaDispositivos(alCambiarModoRuido);
        this._paginaNotificaciones = new PaginaNotificaciones(notificaciones);
        this._paginaTemporizador = new PaginaTemporizador(temporizador);
        this._paginaVacia = this._crearPaginaVacia();

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
            this._paginaDispositivos.destroy();
            this._paginaNotificaciones.destroy();
            this._paginaTemporizador.destroy();
            this._paginaVacia.destroy();
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

    _crearPaginaVacia() {
        const pagina = new St.BoxLayout({
            style_class: 'isla-pagina isla-pagina-vacia',
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        pagina.add_child(new St.Icon({
            gicon: icono(ICONOS.NOTA),
            style_class: 'isla-vacia-icono',
            x_align: Clutter.ActorAlign.CENTER,
        }));
        pagina.add_child(new St.Label({
            text: 'Nada reproduciéndose',
            style_class: 'isla-vacia-texto',
            x_align: Clutter.ActorAlign.CENTER,
        }));
        return pagina;
    }

    /**
     * Actualiza datos y decide qué páginas existen.
     * @param {object|null} pista
     * @param {object[]} dispositivos
     * @param {{hora: string, fecha: string}|null} reloj
     * @param {object[]} [notificaciones=[]] - Recientes, la más nueva primero.
     * @param {object|null} [temporizador=null] - {estado, totalMs, restanteMs}
     */
    actualizar(pista, dispositivos, reloj, notificaciones = [], temporizador = null) {
        this._fecha.text = reloj?.fecha ?? '';
        this._hora.text = reloj?.hora ?? '';

        this._paginaMusica.actualizar(pista);
        this._paginaDispositivos.actualizar(dispositivos);
        this._paginaNotificaciones.actualizar(notificaciones);
        this._paginaTemporizador.actualizar(temporizador);

        const paginas = [];
        if (pista)
            paginas.push({id: PAGINAS.MUSICA, actor: this._paginaMusica});
        if (notificaciones.length > 0)
            paginas.push({id: PAGINAS.NOTIFICACIONES, actor: this._paginaNotificaciones});
        if (dispositivos.length > 0)
            paginas.push({id: PAGINAS.DISPOSITIVOS, actor: this._paginaDispositivos});
        if (paginas.length === 0)
            paginas.push({id: PAGINAS.VACIA, actor: this._paginaVacia});
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

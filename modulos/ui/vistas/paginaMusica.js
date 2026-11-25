// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * PaginaMusica — página del carrusel con el reproductor:
 * portada grande, título, artista, app, onda, progreso y controles.
 *
 * Con un audio de un chat (nota de voz de WhatsApp) cambia de diseño:
 *
 *   [logo de WhatsApp]  Audio de WhatsApp        ▌▌▌
 *                       Toca para ir al chat
 *   0:12 ━━━━━━━━━━━━━━━━──────────── 0:30
 *                       ( ▶ )
 *
 * Solo reproducir/pausa: un audio no tiene anterior ni siguiente.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {INTERVALO_PROGRESO_MS, TIPOS_PISTA} from '../../constantes.js';
import {registrarDepuracion, protegido} from '../../registro.js';
import {ICONOS, iconoDeAplicacion, iconoDeAppDeAudio} from '../iconos.js';
import {colorDeAcento} from '../estilos/tinte.js';
import {deslizarEntrada, latir, detenerLatido, agregarEfectoPulsacion} from '../animaciones.js';
import {Caratula} from '../componentes/caratula.js';
import {crearEsqueleto} from '../componentes/esqueleto.js';
import {Onda} from '../componentes/onda.js';
import {BarraProgreso} from '../componentes/barraProgreso.js';
import {BotonControl} from '../componentes/botonControl.js';

export const PaginaMusica = GObject.registerClass(
class PaginaMusica extends St.BoxLayout {
    /**
     * @param {object} acciones - alternar(), siguiente(), anterior(),
     *   mostrarReproductor(), obtenerPosicion() → Promise<number|null>, irAPosicion(us)
     */
    _init(acciones) {
        super._init({
            style_class: 'isla-pagina isla-pagina-musica',
            orientation: Clutter.Orientation.VERTICAL,
        });

        this._acciones = acciones;
        this._pista = null;
        this._activa = false;
        this._idProgreso = 0;
        this._latiendo = false;

        this._construirCabecera();

        // Clic en la barra → saltar a ese punto de la canción.
        this._progreso = new BarraProgreso(fraccion => {
            if (this._pista?.duracionUs)
                this._acciones.irAPosicion(fraccion * this._pista.duracionUs);
        });
        this.add_child(this._progreso);

        this._construirControles();

        this.connect('destroy', () => {
            this._detenerProgreso();
            this._sincronizarLatido(false);
        });
    }

    _construirCabecera() {
        const fila = new St.BoxLayout({style_class: 'isla-musica-cabecera'});

        this._caratula = new Caratula({claseTamano: 'isla-caratula-grande'});

        this._textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._titulo = new St.Label({style_class: 'isla-musica-titulo'});
        this._artista = new St.Label({style_class: 'isla-musica-artista'});

        const filaApp = new St.BoxLayout({style_class: 'isla-musica-app'});
        this._filaApp = filaApp;
        this._iconoApp = new St.Icon({style_class: 'isla-musica-app-icono', y_align: Clutter.ActorAlign.CENTER});
        this._nombreApp = new St.Label({y_align: Clutter.ActorAlign.CENTER});
        filaApp.add_child(this._iconoApp);
        filaApp.add_child(this._nombreApp);

        // Esqueleto: ocupa el lugar del título y del artista mientras carga la canción siguiente.
        this._esqueletoTitulo = crearEsqueleto(150, 14);
        this._esqueletoArtista = crearEsqueleto(96, 11);
        this._esqueletoArtista.add_style_class_name('isla-esqueleto-segundo');

        this._textos.add_child(this._titulo);
        this._textos.add_child(this._esqueletoTitulo);
        this._textos.add_child(this._artista);
        this._textos.add_child(this._esqueletoArtista);
        this._textos.add_child(filaApp);

        // Clic en los textos → traer la ventana del reproductor.
        this._botonTextos = new St.Button({
            style_class: 'isla-musica-boton-textos',
            child: this._textos,
            x_expand: true,
            can_focus: true,
        });
        this._botonTextos.connect('clicked', protegido('música: mostrar reproductor', () => this._acciones.mostrarReproductor()));

        this._onda = new Onda({barras: 5, claseExtra: 'isla-onda-grande'});
        this._onda.y_align = Clutter.ActorAlign.START;

        // La portada también lleva a donde suena (es lo primero que se toca).
        this._botonCaratula = new St.Button({
            style_class: 'isla-musica-boton-caratula',
            child: this._caratula,
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
            accessible_name: 'Ir a donde suena la música',
        });
        this._botonCaratula.connect('clicked', protegido('música: mostrar reproductor (portada)', () => this._acciones.mostrarReproductor()));
        agregarEfectoPulsacion(this._botonCaratula);

        fila.add_child(this._botonCaratula);
        fila.add_child(this._botonTextos);
        fila.add_child(this._onda);
        this.add_child(fila);
    }

    _construirControles() {
        const fila = new St.BoxLayout({
            style_class: 'isla-musica-controles',
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._botonAnterior = new BotonControl({
            nombreIcono: ICONOS.ANTERIOR,
            alPulsar: () => this._acciones.anterior(),
        });
        this._botonAlternar = new BotonControl({
            nombreIcono: ICONOS.REPRODUCIR,
            alPulsar: () => this._acciones.alternar(),
            principal: true,
        });
        this._botonSiguiente = new BotonControl({
            nombreIcono: ICONOS.SIGUIENTE,
            alPulsar: () => this._acciones.siguiente(),
        });

        fila.add_child(this._botonAnterior);
        fila.add_child(this._botonAlternar);
        fila.add_child(this._botonSiguiente);
        this.add_child(fila);
    }

    /**
     * Pinta la pista activa.
     * @param {object|null} pista
     */
    actualizar(pista) {
        const anterior = this._pista;
        this._pista = pista;
        if (!pista) {
            this._detenerProgreso();
            this._sincronizarLatido(false);
            return;
        }

        const cargando = Boolean(pista.cargando);
        // Una canción nueva, o la que llega tras el esqueleto de carga.
        const pistaNueva = anterior?.titulo !== pista.titulo || anterior?.nombreBus !== pista.nombreBus ||
            (Boolean(anterior?.cargando) && !cargando);

        // Audio de un chat: el logo de la app como portada, sin anterior ni siguiente.
        const audio = pista.tipo === TIPOS_PISTA.AUDIO;
        if (audio)
            this.add_style_class_name('isla-pagina-audio');
        else
            this.remove_style_class_name('isla-pagina-audio');
        this._caratula.establecerIcono(audio ? iconoDeAppDeAudio(pista.appAudio) : null);

        this._caratula.establecerCargando(cargando);
        if (!cargando)
            this._caratula.establecer(pista.urlCaratula);
        this._titulo.text = audio ? `Audio de ${pista.appAudio?.nombre ?? 'un chat'}` : pista.titulo;
        this._titulo.visible = !cargando;
        this._artista.text = audio ? 'Toca para ir al chat' : pista.artista || pista.album || '';
        this._artista.visible = !cargando && Boolean(this._artista.text);
        this._esqueletoTitulo.visible = cargando;
        this._esqueletoArtista.visible = cargando;
        // La canción espera mientras suena un audio de chat en el mismo navegador.
        this._nombreApp.text = pista.enEspera ? `${pista.aplicacion} · en espera mientras suena el audio` : pista.aplicacion;
        this._iconoApp.gicon = iconoDeAplicacion(pista.aplicacion, pista.entradaEscritorio);
        this._iconoApp.visible = Boolean(this._iconoApp.gicon);
        // En el audio, la app ya está en el título y en el logo.
        this._filaApp.visible = !audio;
        this._botonAnterior.visible = !audio;
        this._botonSiguiente.visible = !audio;
        this._botonCaratula.accessible_name = audio ? 'Ir al chat' : 'Ir a donde suena la música';

        // Mientras carga no suena nada: sin onda.
        this._onda.visible = !cargando;
        this._onda.establecerActiva(pista.reproduciendo && !cargando && this._activa);
        // Con el color de la canción (si el estilo lo usa, la pista lo trae): onda y barra.
        const acento = audio ? null : colorDeAcento(pista.colorPortada ?? null);
        this._onda.establecerColor(acento);
        this._progreso.establecerColor(acento);
        this._botonAlternar.establecerIcono(pista.reproduciendo ? ICONOS.PAUSA : ICONOS.REPRODUCIR);
        this._botonAlternar.establecerHabilitado(pista.puedeAlternar);
        this._botonAnterior.establecerHabilitado(pista.puedeAnterior);
        this._botonSiguiente.establecerHabilitado(pista.puedeSiguiente);
        this._botonTextos.reactive = pista.puedeMostrar;
        this._botonCaratula.reactive = pista.puedeMostrar;

        this._progreso.visible = !cargando && pista.duracionUs > 0;
        this._progreso.establecerBuscable(Boolean(pista.puedeBuscar));
        if (pistaNueva && !cargando) {
            this._progreso.reiniciar(pista.duracionUs);
            if (this._activa)
                deslizarEntrada(this._textos, {desde: 18});
        }

        this._sincronizarProgreso();
        this._sincronizarLatido(cargando && this._activa);
    }

    /**
     * Indica si la página está a la vista (tarjeta abierta). Solo entonces
     * corren la onda y la consulta de posición.
     * @param {boolean} activa
     */
    establecerActiva(activa) {
        if (activa === this._activa)
            return;
        this._activa = activa;
        const cargando = Boolean(this._pista?.cargando);
        this._onda.establecerActiva(activa && !cargando && Boolean(this._pista?.reproduciendo));
        this._sincronizarProgreso();
        this._sincronizarLatido(activa && cargando);
    }

    /**
     * El esqueleto late solo mientras se ve (página a la vista y cargando).
     * @param {boolean} debeLatir
     */
    _sincronizarLatido(debeLatir) {
        if (debeLatir === this._latiendo)
            return;
        this._latiendo = debeLatir;
        for (const actor of [this._caratula, this._esqueletoTitulo, this._esqueletoArtista]) {
            if (debeLatir)
                latir(actor);
            else
                detenerLatido(actor);
        }
    }

    // ───────────────────────── Progreso ─────────────────────────

    _sincronizarProgreso() {
        const debeRefrescar = this._activa && this._pista?.reproduciendo && this._pista.duracionUs > 0;

        if (this._activa && this._pista && !this._pista.cargando)
            this._consultarPosicion(false);

        if (debeRefrescar && !this._idProgreso) {
            const consultar = protegido('música: consultar posición', () => this._consultarPosicion(true));
            this._idProgreso = GLib.timeout_add(GLib.PRIORITY_DEFAULT, INTERVALO_PROGRESO_MS, () => {
                consultar();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!debeRefrescar) {
            this._detenerProgreso();
        }
    }

    _detenerProgreso() {
        if (this._idProgreso) {
            GLib.source_remove(this._idProgreso);
            this._idProgreso = 0;
        }
    }

    async _consultarPosicion(conAnimacion) {
        const pista = this._pista;
        if (!pista?.duracionUs)
            return;

        try {
            const posicion = await this._acciones.obtenerPosicion();
            if (this._pista === pista && posicion !== null)
                this._progreso.establecerPosicion(posicion, conAnimacion);
        } catch (error) {
            // Algunos reproductores no exponen Position: la barra se queda como está.
            registrarDepuracion(`No se pudo leer la posición: ${error.message}`);
        }
    }
});

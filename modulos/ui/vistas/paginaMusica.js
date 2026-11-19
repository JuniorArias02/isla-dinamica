// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * PaginaMusica — página del carrusel con el reproductor:
 * portada grande, título, artista, app, onda, progreso y controles.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {INTERVALO_PROGRESO_MS} from '../../constantes.js';
import {registrarDepuracion, protegido} from '../../registro.js';
import {ICONOS, iconoDeAplicacion} from '../iconos.js';
import {deslizarEntrada} from '../animaciones.js';
import {Caratula} from '../componentes/caratula.js';
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

        this._construirCabecera();

        // Clic en la barra → saltar a ese punto de la canción.
        this._progreso = new BarraProgreso(fraccion => {
            if (this._pista?.duracionUs)
                this._acciones.irAPosicion(fraccion * this._pista.duracionUs);
        });
        this.add_child(this._progreso);

        this._construirControles();

        this.connect('destroy', () => this._detenerProgreso());
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
        this._iconoApp = new St.Icon({style_class: 'isla-musica-app-icono', y_align: Clutter.ActorAlign.CENTER});
        this._nombreApp = new St.Label({y_align: Clutter.ActorAlign.CENTER});
        filaApp.add_child(this._iconoApp);
        filaApp.add_child(this._nombreApp);

        this._textos.add_child(this._titulo);
        this._textos.add_child(this._artista);
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

        fila.add_child(this._caratula);
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
            return;
        }

        const pistaNueva = anterior?.titulo !== pista.titulo || anterior?.nombreBus !== pista.nombreBus;

        this._caratula.establecer(pista.urlCaratula);
        this._titulo.text = pista.titulo;
        this._artista.text = pista.artista || pista.album || '';
        this._artista.visible = Boolean(this._artista.text);
        this._nombreApp.text = pista.aplicacion;
        this._iconoApp.gicon = iconoDeAplicacion(pista.aplicacion, pista.entradaEscritorio);
        this._iconoApp.visible = Boolean(this._iconoApp.gicon);

        this._onda.establecerActiva(pista.reproduciendo && this._activa);
        this._botonAlternar.establecerIcono(pista.reproduciendo ? ICONOS.PAUSA : ICONOS.REPRODUCIR);
        this._botonAlternar.establecerHabilitado(pista.puedeAlternar);
        this._botonAnterior.establecerHabilitado(pista.puedeAnterior);
        this._botonSiguiente.establecerHabilitado(pista.puedeSiguiente);
        this._botonTextos.reactive = pista.puedeMostrar;

        this._progreso.visible = pista.duracionUs > 0;
        this._progreso.establecerBuscable(Boolean(pista.puedeBuscar));
        if (pistaNueva) {
            this._progreso.reiniciar(pista.duracionUs);
            if (this._activa)
                deslizarEntrada(this._textos, {desde: 18});
        }

        this._sincronizarProgreso();
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
        this._onda.establecerActiva(activa && Boolean(this._pista?.reproduciendo));
        this._sincronizarProgreso();
    }

    // ───────────────────────── Progreso ─────────────────────────

    _sincronizarProgreso() {
        const debeRefrescar = this._activa && this._pista?.reproduciendo && this._pista.duracionUs > 0;

        if (this._activa && this._pista)
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

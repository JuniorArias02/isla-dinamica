// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * PaginaTemporizador — página del carrusel para el temporizador de la isla.
 *
 *   Sin temporizador:          Temporizador
 *                              [1 min] [3 min] [5 min] [10 min]
 *                              [15 min] [25 min] [30 min] [1 h]
 *
 *   En marcha / en pausa:      Temporizador
 *                              (  4:32  )   [+1 min]  [⏸]  [✕]
 *                               anillo naranja que se vacía
 *
 *   Terminado:                 (  0:00  )   ¡Tiempo cumplido!  [+1 min] [Listo]
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {ESTADOS_TEMPORIZADOR, PRESETS_TEMPORIZADOR_MIN} from '../../constantes.js';
import {protegido} from '../../registro.js';
import {ICONOS} from '../iconos.js';
import {agregarEfectoPulsacion, aparecerConRebote} from '../animaciones.js';
import {formatearCuentaAtras} from '../formato.js';
import {AnilloProgreso} from '../componentes/anilloProgreso.js';
import {BotonControl} from '../componentes/botonControl.js';

const UN_MINUTO_MS = 60 * 1000;
const PRESETS_POR_FILA = 4;

/** "5 min", "1 h" */
function textoPreset(minutos) {
    return minutos >= 60 && minutos % 60 === 0 ? `${minutos / 60} h` : `${minutos} min`;
}

export const PaginaTemporizador = GObject.registerClass(
class PaginaTemporizador extends St.BoxLayout {
    /**
     * @param {object} acciones - {iniciar(ms), sumar(ms), pausar(), reanudar(), cancelar()}
     */
    _init(acciones) {
        super._init({
            style_class: 'isla-pagina isla-pagina-temporizador',
            orientation: Clutter.Orientation.VERTICAL,
        });
        this._acciones = acciones;
        this._estado = null;

        this.add_child(new St.Label({text: 'Temporizador', style_class: 'isla-pagina-encabezado'}));

        this._presets = this._construirPresets();
        this._activo = this._construirActivo();
        this.add_child(this._presets);
        this.add_child(this._activo);

        this.actualizar(null);
    }

    _construirPresets() {
        const caja = new St.BoxLayout({
            style_class: 'isla-temporizador-presets',
            orientation: Clutter.Orientation.VERTICAL,
        });
        for (let i = 0; i < PRESETS_TEMPORIZADOR_MIN.length; i += PRESETS_POR_FILA) {
            const fila = new St.BoxLayout({style_class: 'isla-temporizador-fila-presets'});
            // Todos los botones del mismo ancho, aunque el texto sea más corto ("1 h").
            fila.layout_manager.homogeneous = true;
            for (const minutos of PRESETS_TEMPORIZADOR_MIN.slice(i, i + PRESETS_POR_FILA)) {
                const boton = new St.Button({
                    label: textoPreset(minutos),
                    style_class: 'isla-temporizador-preset',
                    x_expand: true,
                    can_focus: true,
                });
                boton.connect('clicked', protegido(`temporizador: iniciar ${minutos} min`,
                    () => this._acciones.iniciar(minutos * UN_MINUTO_MS)));
                agregarEfectoPulsacion(boton);
                fila.add_child(boton);
            }
            caja.add_child(fila);
        }
        return caja;
    }

    _construirActivo() {
        const caja = new St.BoxLayout({style_class: 'isla-temporizador-activo'});

        this._anillo = new AnilloProgreso({diametro: 96, grosor: 7, claseTexto: 'isla-temporizador-cuenta'});
        caja.add_child(this._anillo);

        const derecha = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'isla-temporizador-derecha',
        });

        this._mensaje = new St.Label({style_class: 'isla-temporizador-mensaje', x_align: Clutter.ActorAlign.CENTER});
        derecha.add_child(this._mensaje);

        const controles = new St.BoxLayout({
            style_class: 'isla-temporizador-controles',
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._botonSumar = new St.Button({label: '+1 min', style_class: 'isla-temporizador-sumar', can_focus: true});
        this._botonSumar.connect('clicked', protegido('temporizador: +1 min', () => this._acciones.sumar(UN_MINUTO_MS)));
        agregarEfectoPulsacion(this._botonSumar);

        this._botonPausa = new BotonControl({
            nombreIcono: ICONOS.PAUSA,
            principal: true,
            alPulsar: () => {
                if (this._estado === ESTADOS_TEMPORIZADOR.CORRIENDO)
                    this._acciones.pausar();
                else
                    this._acciones.reanudar();
            },
        });
        this._botonPausa.add_style_class_name('isla-temporizador-pausa');

        this._botonCancelar = new St.Button({
            style_class: 'isla-temporizador-cancelar',
            child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 16}),
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._botonCancelar.connect('clicked', protegido('temporizador: cancelar', () => this._acciones.cancelar()));
        agregarEfectoPulsacion(this._botonCancelar);

        this._botonListo = new St.Button({label: 'Listo', style_class: 'isla-temporizador-preset isla-temporizador-boton-listo', can_focus: true});
        this._botonListo.connect('clicked', protegido('temporizador: listo', () => this._acciones.cancelar()));
        agregarEfectoPulsacion(this._botonListo);

        controles.add_child(this._botonSumar);
        controles.add_child(this._botonPausa);
        controles.add_child(this._botonCancelar);
        controles.add_child(this._botonListo);
        derecha.add_child(controles);
        caja.add_child(derecha);
        return caja;
    }

    /**
     * @param {{estado: string, totalMs: number, restanteMs: number}|null} temporizador
     */
    actualizar(temporizador) {
        const estado = temporizador?.estado ?? ESTADOS_TEMPORIZADOR.INACTIVO;
        const cambio = estado !== this._estado;
        this._estado = estado;

        const inactivo = estado === ESTADOS_TEMPORIZADOR.INACTIVO;
        this._presets.visible = inactivo;
        this._activo.visible = !inactivo;
        if (inactivo)
            return;

        const terminado = estado === ESTADOS_TEMPORIZADOR.TERMINADO;
        const corriendo = estado === ESTADOS_TEMPORIZADOR.CORRIENDO;
        const {totalMs, restanteMs} = temporizador;
        const fraccion = totalMs > 0 ? restanteMs / totalMs : 0;
        const texto = formatearCuentaAtras(restanteMs);

        if (corriendo) {
            // El arco se vacía en continuo: se anima hacia donde ESTARÁ dentro de un
            // segundo (el siguiente aviso), así va sincronizado con los números.
            if (cambio)
                this._anillo.establecer(fraccion, {texto});
            const fraccionSiguiente = totalMs > 0 ? Math.max(0, (restanteMs - 1000) / totalMs) : 0;
            this._anillo.establecer(fraccionSiguiente, {texto, duracion: 1000});
        } else {
            this._anillo.establecer(fraccion, {texto});
        }

        this._mensaje.text = terminado ? '¡Tiempo cumplido!' : (corriendo ? '' : 'En pausa');
        this._mensaje.visible = Boolean(this._mensaje.text);

        this._botonPausa.visible = !terminado;
        this._botonPausa.establecerIcono(corriendo ? ICONOS.PAUSA : ICONOS.REPRODUCIR);
        this._botonCancelar.visible = !terminado;
        this._botonListo.visible = terminado;

        if (cambio && !inactivo)
            aparecerConRebote(this._anillo, {escalaInicial: 0.85});
    }
});

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * PaginaTemporizador — página del carrusel para el temporizador de la isla.
 *
 *   Sin temporizador:          Temporizador
 *                                 00     04     59
 *                              [ 00 h  05 min 00 s ]   (▶)    ← ruedas (estilo iPhone) + Iniciar
 *                                 01     06     01
 *                              [1 min] [5 min] [15 min] [30 min]   ← atajos: arrancan al instante
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
import {ajuste, AJUSTES} from '../../ajustes.js';
import {icono, ICONOS} from '../iconos.js';
import {agregarEfectoPulsacion, aparecerConRebote} from '../animaciones.js';
import {formatearCuentaAtras} from '../formato.js';
import {AnilloProgreso} from '../componentes/anilloProgreso.js';
import {BotonControl} from '../componentes/botonControl.js';
import {SelectorDuracion} from '../componentes/selectorDuracion.js';

const UN_MINUTO_MS = 60 * 1000;
const UN_SEGUNDO_MS = 1000;

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

        this._elegir = this._construirElegir();
        this._activo = this._construirActivo();
        this.add_child(this._elegir);
        this.add_child(this._activo);

        this.actualizar(null);
    }

    /** Ruedas para elegir cualquier duración, botón Iniciar y atajos. */
    _construirElegir() {
        const caja = new St.BoxLayout({
            style_class: 'isla-temporizador-elegir',
            orientation: Clutter.Orientation.VERTICAL,
        });

        const fila = new St.BoxLayout({style_class: 'isla-temporizador-fila-selector', x_align: Clutter.ActorAlign.CENTER});
        this._selector = new SelectorDuracion({
            segundos: ajuste(AJUSTES.ULTIMA_DURACION_TEMPORIZADOR_S),
            alCambiar: segundos => this._actualizarBotonIniciar(segundos),
        });
        this._botonIniciar = new St.Button({
            style_class: 'isla-temporizador-iniciar',
            child: new St.Icon({gicon: icono(ICONOS.REPRODUCIR), style_class: 'isla-temporizador-iniciar-icono'}),
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
        });
        this._botonIniciar.connect('clicked', protegido('temporizador: iniciar con las ruedas', () => {
            const segundos = this._selector.segundos;
            if (segundos > 0)
                this._acciones.iniciar(segundos * UN_SEGUNDO_MS);
        }));
        agregarEfectoPulsacion(this._botonIniciar);
        fila.add_child(this._selector);
        fila.add_child(this._botonIniciar);
        caja.add_child(fila);

        // Atajos: arrancan al instante (como los "recientes" del móvil).
        const atajos = new St.BoxLayout({style_class: 'isla-temporizador-fila-presets'});
        atajos.layout_manager.homogeneous = true;
        for (const minutos of PRESETS_TEMPORIZADOR_MIN) {
            const boton = new St.Button({
                label: textoPreset(minutos),
                style_class: 'isla-temporizador-preset',
                x_expand: true,
                can_focus: true,
            });
            boton.connect('clicked', protegido(`temporizador: iniciar ${minutos} min`,
                () => this._acciones.iniciar(minutos * UN_MINUTO_MS)));
            agregarEfectoPulsacion(boton);
            atajos.add_child(boton);
        }
        caja.add_child(atajos);

        this._actualizarBotonIniciar(this._selector.segundos);
        return caja;
    }

    /** Con todo en cero no hay nada que iniciar. */
    _actualizarBotonIniciar(segundos) {
        this._botonIniciar.reactive = segundos > 0;
        if (segundos > 0)
            this._botonIniciar.remove_style_class_name('deshabilitado');
        else
            this._botonIniciar.add_style_class_name('deshabilitado');
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
        this._elegir.visible = inactivo;
        this._activo.visible = !inactivo;
        if (inactivo) {
            // Al volver a elegir, las ruedas muestran la última duración usada.
            if (cambio)
                this._selector.establecerSegundos(ajuste(AJUSTES.ULTIMA_DURACION_TEMPORIZADOR_S), false);
            return;
        }

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

/**
 * Pildora — la cápsula compacta que vive en el panel superior.
 *
 *   Reposo       → la hora (reemplaza al reloj del panel de Ubuntu).
 *   Música       → portada circular + título + onda bailando.
 *   Temporizador → cronómetro naranja + cuenta atrás.
 *
 * Qué actividad se ve lo decide el controlador (`actividades.principal`):
 * la que el usuario eligió, o la primera disponible.
 *
 * A la derecha, siempre visibles: puntitos de privacidad (naranja = micrófono,
 * verde = cámara, rojo = pantalla) y el azul de notificaciones sin ver.
 *
 * Su ancho se anima cada vez que cambia el contenido.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {RESORTES, ESTADOS_TEMPORIZADOR, ACTIVIDADES} from '../../constantes.js';
import {animarConResorte} from '../movimiento.js';
import {icono, ICONOS} from '../iconos.js';
import {formatearCuentaAtras} from '../formato.js';
import {deslizarEntrada, aparecerConRebote, empujar} from '../animaciones.js';
import {Caratula} from './caratula.js';
import {Onda} from './onda.js';

/** Arrastre de la cápsula: la sigue con resistencia y hasta un máximo. */
const RESISTENCIA_ARRASTRE = 0.35;
const MAXIMO_ARRASTRE_PX = 30;

export const Pildora = GObject.registerClass(
class Pildora extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'isla-pildora isla-pildora-reposo',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            // Sin clip_to_allocation: recortaría la sombra redonda en forma de cuadrado.
        });

        this._caratula = new Caratula({claseTamano: 'isla-caratula-mini'});
        this._titulo = new St.Label({
            style_class: 'isla-pildora-titulo',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._onda = new Onda({barras: 4});
        this._hora = new St.Label({
            style_class: 'isla-pildora-hora',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        // Cuenta atrás del temporizador (actividad en vivo).
        this._temporizador = new St.BoxLayout({
            style_class: 'isla-pildora-contenido-temporizador',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._temporizador.add_child(new St.Icon({
            gicon: icono(ICONOS.TEMPORIZADOR),
            style_class: 'isla-pildora-temporizador-icono',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this._cuentaAtras = new St.Label({style_class: 'isla-pildora-cuenta', y_align: Clutter.ActorAlign.CENTER});
        this._temporizador.add_child(this._cuentaAtras);

        // Puntitos de privacidad, como en el iPhone: algo está usando micrófono, cámara o pantalla.
        this._privacidad = new St.BoxLayout({style_class: 'isla-privacidad', y_align: Clutter.ActorAlign.CENTER});
        this._puntosPrivacidad = {};
        for (const tipo of ['microfono', 'camara', 'pantalla']) {
            const punto = new St.Widget({
                style_class: `isla-punto-privacidad ${tipo}`,
                y_align: Clutter.ActorAlign.CENTER,
                visible: false,
            });
            punto.set_pivot_point(0.5, 0.5);
            this._puntosPrivacidad[tipo] = punto;
            this._privacidad.add_child(punto);
        }

        // Puntito azul: hay notificaciones sin ver.
        this._puntoNoLeidas = new St.Widget({
            style_class: 'isla-punto-no-leidas',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._puntoNoLeidas.set_pivot_point(0.5, 0.5);

        this.add_child(this._hora);
        this.add_child(this._temporizador);
        this.add_child(this._caratula);
        this.add_child(this._titulo);
        this.add_child(this._onda);
        this.add_child(this._privacidad);
        this.add_child(this._puntoNoLeidas);

        this._modo = null;
        this._tituloActual = null;
        this._textoActual = null;
        this.connect('destroy', () => this.remove_all_transitions());

        // Estado inicial: reposo hasta que llegue la primera vista.
        this.actualizar(null, null, null, null);
    }

    /**
     * Muestra la actividad principal (o la hora si no hay ninguna).
     * @param {object|null} pista
     * @param {{hora: string}|null} reloj
     * @param {{estado: string, restanteMs: number}|null} temporizador
     * @param {string|null} principal - ACTIVIDADES.MUSICA, ACTIVIDADES.TEMPORIZADOR o null.
     */
    actualizar(pista, reloj, temporizador, principal) {
        let modo = 'reposo';
        if (principal === ACTIVIDADES.TEMPORIZADOR && temporizador)
            modo = 'temporizador';
        else if (principal === ACTIVIDADES.MUSICA && pista)
            modo = 'musica';

        // Texto principal de cada modo (si cambia de largo, la cápsula se reajusta).
        let texto = reloj?.hora ?? '';
        if (modo === 'temporizador')
            texto = formatearCuentaAtras(temporizador.restanteMs);
        else if (modo === 'musica')
            texto = pista.titulo;

        const cambiaModo = modo !== this._modo;
        const cambiaLargo = texto.length !== (this._textoActual?.length ?? -1);
        const cambiaTitulo = modo === 'musica' && texto !== this._tituloActual;
        this._modo = modo;
        this._textoActual = texto;
        this._tituloActual = modo === 'musica' ? texto : null;

        this.style_class = `isla-pildora isla-pildora-${modo}`;

        this._hora.text = reloj?.hora ?? '';
        this._hora.visible = modo === 'reposo' && Boolean(this._hora.text);

        this._temporizador.visible = modo === 'temporizador';
        if (modo === 'temporizador') {
            this._cuentaAtras.text = texto;
            if (temporizador.estado === ESTADOS_TEMPORIZADOR.PAUSADO)
                this._temporizador.add_style_class_name('pausado');
            else
                this._temporizador.remove_style_class_name('pausado');
        }

        const musica = modo === 'musica';
        this._caratula.visible = musica;
        this._titulo.visible = musica;
        this._onda.visible = musica;
        this._onda.establecerActiva(musica);
        if (musica) {
            this._caratula.establecer(pista.urlCaratula);
            this._titulo.text = pista.titulo;
        }

        if (cambiaModo || cambiaTitulo || cambiaLargo) {
            if (musica && (cambiaModo || cambiaTitulo))
                deslizarEntrada(this._titulo, {desde: 10, retraso: 60});
            if (modo === 'temporizador' && cambiaModo)
                aparecerConRebote(this._temporizador, {escalaInicial: 0.6});
            this._animarAncho();
        }
    }

    /**
     * Muestra u oculta el puntito de notificaciones sin ver.
     * @param {boolean} hay
     */
    establecerNoLeidas(hay) {
        if (hay === this._puntoNoLeidas.visible)
            return;
        this._puntoNoLeidas.visible = hay;
        if (hay)
            aparecerConRebote(this._puntoNoLeidas, {escalaInicial: 0.2});
        this._animarAncho();
    }

    /**
     * Muestra los puntitos de privacidad de lo que esté en uso.
     * @param {{microfono: boolean, camara: boolean, pantalla: boolean}|null} estado
     */
    establecerPrivacidad(estado) {
        let cambio = false;
        for (const [tipo, punto] of Object.entries(this._puntosPrivacidad)) {
            const activo = Boolean(estado?.[tipo]);
            if (activo === punto.visible)
                continue;
            cambio = true;
            punto.visible = activo;
            if (activo)
                aparecerConRebote(punto, {escalaInicial: 0.2});
        }
        if (cambio)
            this._animarAncho();
    }

    /**
     * La cápsula sigue al ratón mientras se arrastra (con resistencia).
     * @param {number} desplazamiento - Píxeles arrastrados en horizontal.
     */
    seguirArrastre(desplazamiento) {
        this.remove_transition('translation-x');
        this.translation_x = Math.max(-MAXIMO_ARRASTRE_PX, Math.min(MAXIMO_ARRASTRE_PX, desplazamiento * RESISTENCIA_ARRASTRE));
    }

    /** Arrastre corto: vuelve a su sitio con rebote. */
    soltarArrastre() {
        animarConResorte(this, {translation_x: 0}, {resorte: RESORTES.REBOTE});
    }

    /**
     * Animación al cambiar de vista deslizando.
     * @param {number} direccion - +1 (de derecha a izquierda) o -1.
     * @param {boolean} cambio - false si ya estaba en el extremo (rebota contra el borde).
     */
    animarCambio(direccion, cambio) {
        if (!cambio) {
            empujar(this, -direccion);
            return;
        }
        // El contenido nuevo entra desde el lado hacia el que se deslizó.
        this.remove_transition('translation-x');
        this.translation_x = 0;
        for (const hijo of this.get_children()) {
            if (hijo.visible && hijo !== this._puntoNoLeidas && hijo !== this._privacidad)
                deslizarEntrada(hijo, {desde: 16 * direccion});
        }
    }

    /**
     * Rectángulo de la cápsula en coordenadas de pantalla (para la morfosis).
     * @returns {{x: number, y: number, ancho: number, alto: number}}
     */
    obtenerRectangulo() {
        const [x, y] = this.get_transformed_position();
        const [ancho, alto] = this.get_transformed_size();
        return {x, y, ancho, alto};
    }

    /** Mide el ancho natural del nuevo contenido y anima la cápsula hasta él. */
    _animarAncho() {
        // Fuera de pantalla no hay nada que medir ni animar (evita avisos de St).
        if (!this.get_stage() || !this.mapped)
            return;
        const anchoAnterior = this.width;
        this.remove_transition('width');
        this.set_width(-1);

        if (anchoAnterior <= 0 || !this.mapped)
            return;

        const [, anchoNatural] = this.get_preferred_width(-1);
        this.set_width(anchoAnterior);
        animarConResorte(this, {width: anchoNatural}, {
            resorte: RESORTES.CAPSULA,
            alTerminar: () => this.set_width(-1),
        });
    }
});

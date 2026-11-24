// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pildora — la cápsula compacta que vive en el panel superior.
 *
 *   Reposo       → la hora (reemplaza al reloj del panel de Ubuntu).
 *   Música       → portada circular + título + onda bailando.
 *   Audio        → audio de un chat (nota de voz de WhatsApp): icono de la app +
 *                  "Audio · 0:30" + onda verde.
 *   Temporizador → cronómetro naranja + cuenta atrás.
 *   Grabación    → punto rojo que late + tiempo grabando.
 *   Llamada      → teléfono verde + tiempo de llamada (manda sobre todo lo demás).
 *
 * Qué actividad se ve lo decide el controlador (`actividades.principal`):
 * la que el usuario eligió, o la primera disponible.
 *
 * A la derecha, siempre visibles: puntitos de privacidad (naranja = micrófono,
 * verde = cámara, rojo = pantalla) y el azul de notificaciones sin ver.
 *
 * Su ancho se anima cada vez que cambia el contenido.
 *
 * Cambio de actividad (deslizar, tocar el círculo, empieza la música o una
 * grabación...): morfosis en dos fases, como la Dynamic Island.
 *   1. Contraer: el contenido se encoge y se desvanece mientras la cápsula se
 *      cierra hasta ser un círculo.
 *   2. Florecer: desde el círculo se abre con resorte hasta el nuevo ancho y el
 *      contenido nuevo nace pequeño y crece (desde el lado del deslizamiento).
 * Mientras se contrae, lo que llegue se guarda y se dibuja lo último al terminar.
 *
 * Con `previa: true` es una copia sin animaciones propias ni fondo, que el Asomo
 * recorta para enseñar la vista de al lado mientras se arrastra.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {
    RESORTES,
    ESTADOS_TEMPORIZADOR,
    ACTIVIDADES,
    DURACION_CONTRAER_CAPSULA_MS,
    ESCALA_SALIDA_CONTENIDO,
    ESCALA_ENTRADA_CONTENIDO,
    DURACION_SALIDA_CONTENIDO_MS,
    FRACCION_RETRASO_FLORECER,
    DURACION_ENTRADA_CONTENIDO_MS,
    DESPLAZAMIENTO_ENTRADA_PX,
    TIPOS_PISTA,
} from '../../constantes.js';
import {animar, animarConResorte, duracionResorte} from '../movimiento.js';
import {registrarAviso, protegido} from '../../registro.js';
import {icono, ICONOS, iconoDeAppDeAudio} from '../iconos.js';
import {formatearCuentaAtras, formatearTranscurrido} from '../formato.js';
import {deslizarEntrada, aparecerConRebote, empujar, latir, detenerLatido} from '../animaciones.js';
import {Caratula} from './caratula.js';
import {crearEsqueleto} from './esqueleto.js';
import {Onda} from './onda.js';

/** Arrastre de la cápsula: la sigue con resistencia y hasta un máximo. */
const RESISTENCIA_ARRASTRE = 0.35;
const MAXIMO_ARRASTRE_PX = 30;

export const Pildora = GObject.registerClass(
class Pildora extends St.BoxLayout {
    /**
     * @param {object} [opciones]
     * @param {boolean} [opciones.previa=false] - Copia para el Asomo: dibuja al instante y sin fondo.
     */
    _init({previa = false} = {}) {
        super._init({
            style_class: `isla-pildora isla-pildora-reposo${previa ? ' isla-pildora-previa' : ''}`,
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
        // Ocupa el lugar del título mientras carga la canción siguiente.
        this._esqueleto = crearEsqueleto(72, 10);
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

        // Grabación de pantalla (actividad en vivo): punto rojo que late + contador.
        this._grabacion = new St.BoxLayout({
            style_class: 'isla-pildora-contenido-grabacion',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._puntoGrabacion = new St.Widget({style_class: 'isla-grabacion-punto', y_align: Clutter.ActorAlign.CENTER});
        this._tiempoGrabacion = new St.Label({style_class: 'isla-pildora-grabacion-tiempo', y_align: Clutter.ActorAlign.CENTER});
        this._grabacion.add_child(this._puntoGrabacion);
        this._grabacion.add_child(this._tiempoGrabacion);

        // Llamada en curso (actividad en vivo): teléfono verde + tiempo de llamada.
        this._llamada = new St.BoxLayout({
            style_class: 'isla-pildora-contenido-llamada',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._iconoLlamada = new St.Icon({
            gicon: icono(ICONOS.TELEFONO),
            style_class: 'isla-pildora-llamada-icono',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._tiempoLlamada = new St.Label({style_class: 'isla-pildora-llamada-tiempo', y_align: Clutter.ActorAlign.CENTER});
        this._llamada.add_child(this._iconoLlamada);
        this._llamada.add_child(this._tiempoLlamada);

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
        this.add_child(this._grabacion);
        this.add_child(this._llamada);
        this.add_child(this._caratula);
        this.add_child(this._titulo);
        this.add_child(this._esqueleto);
        this.add_child(this._onda);
        this.add_child(this._privacidad);
        this.add_child(this._puntoNoLeidas);

        this._previa = previa;
        this._modo = null;
        this._tituloActual = null;
        this._pendiente = null;
        this._contrayendo = false;
        this._direccionEntrada = 0;
        this._idSeguroContraer = 0;
        this._textoActual = null;
        this._latiendo = false;
        this._latiendoGrabacion = false;
        this.connect('destroy', () => {
            this._cancelarSeguroContraer();
            this.remove_all_transitions();
            this._sincronizarLatido(false);
            this._sincronizarLatidoGrabacion(false);
        });

        // Estado inicial: reposo hasta que llegue la primera vista.
        this.actualizar(null, null, null, null);
    }

    /** @returns {string|null} Lo que dibuja: 'reposo', 'musica', 'temporizador' o 'grabacion'. */
    get modo() {
        return this._modo;
    }

    /**
     * Muestra la actividad principal (o la hora si no hay ninguna).
     * @param {object|null} pista
     * @param {{hora: string}|null} reloj
     * @param {{estado: string, restanteMs: number}|null} temporizador
     * @param {string|null} principal - ACTIVIDADES.MUSICA, TEMPORIZADOR, GRABACION, LLAMADA o null.
     * @param {{grabando: boolean, transcurridoMs: number}|null} [grabacion]
     * @param {{enLlamada: boolean, transcurridoMs: number, silenciado: boolean}|null} [llamada]
     * @param {object|null} [audio] - Audio de un chat sonando (para ACTIVIDADES.AUDIO).
     */
    actualizar(pista, reloj, temporizador, principal, grabacion = null, llamada = null, audio = null) {
        let modo = 'reposo';
        if (principal === ACTIVIDADES.LLAMADA && llamada?.enLlamada)
            modo = 'llamada';
        else if (principal === ACTIVIDADES.GRABACION && grabacion?.grabando)
            modo = 'grabacion';
        else if (principal === ACTIVIDADES.TEMPORIZADOR && temporizador)
            modo = 'temporizador';
        else if (principal === ACTIVIDADES.AUDIO && audio)
            modo = 'audio';
        else if (principal === ACTIVIDADES.MUSICA && pista)
            modo = pista.tipo === TIPOS_PISTA.AUDIO ? 'audio' : 'musica';

        // El audio de un chat se dibuja con las mismas piezas que la música.
        if (modo === 'audio' && principal === ACTIVIDADES.AUDIO)
            pista = audio;

        this._pendiente = {pista, reloj, temporizador, grabacion, llamada, modo};
        // Contrayéndose: se dibujará lo último que llegue al terminar la fase 1.
        if (this._contrayendo)
            return;
        // Cambio de actividad con la cápsula a la vista: morfosis por el círculo.
        if (!this._previa && this._modo !== null && modo !== this._modo && this.mapped && this.width > 0) {
            this._contraer();
            return;
        }
        this._dibujar(this._pendiente, false);
    }

    /**
     * Pinta un modo (hora, música, temporizador o grabación).
     * @param {object} datos - {pista, reloj, temporizador, grabacion, modo}
     * @param {boolean} florecer - true al terminar de contraerse: entra con la fase 2.
     */
    _dibujar({pista, reloj, temporizador, grabacion, llamada, modo}, florecer) {
        // Texto principal de cada modo (si cambia de largo, la cápsula se reajusta).
        let texto = reloj?.hora ?? '';
        if (modo === 'temporizador')
            texto = formatearCuentaAtras(temporizador.restanteMs);
        else if (modo === 'musica')
            texto = pista.cargando ? '' : pista.titulo;
        else if (modo === 'audio')
            texto = pista.duracionUs > 0 ? `Audio · ${formatearTranscurrido(pista.duracionUs / 1000)}` : 'Audio';
        else if (modo === 'grabacion')
            texto = formatearTranscurrido(grabacion.transcurridoMs);
        else if (modo === 'llamada')
            texto = formatearTranscurrido(llamada.transcurridoMs);

        const cambiaModo = modo !== this._modo;
        const cambiaLargo = texto.length !== (this._textoActual?.length ?? -1);
        const cambiaTitulo = (modo === 'musica' || modo === 'audio') && texto !== this._tituloActual;
        this._modo = modo;
        this._textoActual = texto;
        this._tituloActual = modo === 'musica' || modo === 'audio' ? texto : null;

        this.style_class = `isla-pildora isla-pildora-${modo}${this._previa ? ' isla-pildora-previa' : ''}`;

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

        this._grabacion.visible = modo === 'grabacion';
        if (modo === 'grabacion')
            this._tiempoGrabacion.text = texto;

        this._llamada.visible = modo === 'llamada';
        if (modo === 'llamada') {
            this._tiempoLlamada.text = texto;
            // Micrófono silenciado: el teléfono pasa a ser un micrófono tachado.
            this._iconoLlamada.gicon = icono(llamada.silenciado ? ICONOS.MICROFONO_SILENCIADO : ICONOS.TELEFONO);
        }

        // El audio de un chat usa las mismas piezas que la música (con el icono de la app).
        const musica = modo === 'musica' || modo === 'audio';
        const cargando = musica && Boolean(pista.cargando);
        this._caratula.visible = musica;
        this._titulo.visible = musica && !cargando;
        this._esqueleto.visible = cargando;
        this._onda.visible = musica && !cargando;
        this._onda.establecerActiva(musica && !cargando);
        if (musica) {
            this._caratula.establecerCargando(cargando);
            this._caratula.establecerIcono(modo === 'audio' ? iconoDeAppDeAudio(pista.appAudio) : null);
            if (!cargando) {
                this._caratula.establecer(pista.urlCaratula);
                this._titulo.text = texto;
            }
        }
        this._sincronizarLatido(cargando);
        this._sincronizarLatidoGrabacion(modo === 'grabacion');

        // La vista previa se dibuja al instante: la animación la pone el Asomo.
        if (this._previa)
            return;

        if (florecer) {
            this._florecer();
            return;
        }

        if (cambiaModo || cambiaTitulo || cambiaLargo) {
            if (musica && (cambiaModo || cambiaTitulo))
                deslizarEntrada(this._titulo, {desde: 10, retraso: 60});
            if (modo === 'temporizador' && cambiaModo)
                aparecerConRebote(this._temporizador, {escalaInicial: 0.6});
            if (modo === 'grabacion' && cambiaModo)
                aparecerConRebote(this._grabacion, {escalaInicial: 0.6});
            if (modo === 'llamada' && cambiaModo)
                aparecerConRebote(this._llamada, {escalaInicial: 0.6});
            this._animarAncho();
        }
    }


    // ───────────────────────── Cambio de actividad ─────────────────────────

    /** Contenido de la actividad visible (sin los puntos de privacidad y de no leídas). */
    _hijosDeContenido() {
        return [this._hora, this._temporizador, this._grabacion, this._llamada, this._caratula, this._titulo,
            this._esqueleto, this._onda].filter(hijo => hijo.visible);
    }

    /** Fase 1: el contenido se va y la cápsula se cierra hasta un círculo. */
    _contraer() {
        this._contrayendo = true;
        // Los latidos usan la opacidad: se paran (se reanudan al dibujar si siguen haciendo falta).
        this._sincronizarLatido(false);
        this._sincronizarLatidoGrabacion(false);

        const parametros = {duration: DURACION_SALIDA_CONTENIDO_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD};
        for (const hijo of this._hijosDeContenido()) {
            hijo.set_pivot_point(0.5, 0.5);
            animar(hijo, {opacity: 0, scale_x: ESCALA_SALIDA_CONTENIDO, scale_y: ESCALA_SALIDA_CONTENIDO, ...parametros});
        }

        // El ancho se fija en el actual y se cierra hasta el alto: un círculo.
        const ancho = this.width;
        this.remove_transition('width');
        this.set_width(ancho);
        animar(this, {
            width: this.height,
            duration: DURACION_CONTRAER_CAPSULA_MS,
            mode: Clutter.AnimationMode.EASE_IN_CUBIC,
            onComplete: () => this._alContraerse(),
        });

        // Seguro: si la animación no avisa que terminó (ej. la pantalla dejó de dibujar),
        // la cápsula no se queda hecha un círculo ignorando todo lo nuevo.
        this._cancelarSeguroContraer();
        this._idSeguroContraer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DURACION_CONTRAER_CAPSULA_MS * 4, () => {
            this._idSeguroContraer = 0;
            protegido('cápsula: seguro de contraer', () => {
                if (!this._contrayendo)
                    return;
                registrarAviso('La cápsula no terminó de contraerse a tiempo; se completa el cambio por seguridad.');
                this.remove_transition('width');
                this._alContraerse();
            })();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelarSeguroContraer() {
        if (this._idSeguroContraer) {
            GLib.source_remove(this._idSeguroContraer);
            this._idSeguroContraer = 0;
        }
    }

    _alContraerse() {
        if (!this._contrayendo)
            return;
        this._cancelarSeguroContraer();
        this._contrayendo = false;
        // Lo que se fue queda listo para volver a mostrarse en otra ocasión.
        for (const hijo of [this._hora, this._temporizador, this._grabacion, this._llamada, this._caratula, this._titulo,
            this._esqueleto, this._onda]) {
            for (const propiedad of ['opacity', 'scale-x', 'scale-y', 'translation-x'])
                hijo.remove_transition(propiedad);
            hijo.set({opacity: 255, scale_x: 1, scale_y: 1, translation_x: 0});
        }
        this._dibujar(this._pendiente, true);
    }

    /** Fase 2: desde el círculo, la cápsula se abre con resorte y el contenido nuevo nace. */
    _florecer() {
        const direccion = this._direccionEntrada ?? 0;
        this._direccionEntrada = 0;
        // Forma primero, contenido después: entra cuando la forma ya tiene su tamaño.
        const retraso = Math.round(duracionResorte(RESORTES.FLORECER) * FRACCION_RETRASO_FLORECER);
        for (const hijo of this._hijosDeContenido()) {
            hijo.set_pivot_point(0.5, 0.5);
            hijo.set({
                opacity: 0,
                scale_x: ESCALA_ENTRADA_CONTENIDO,
                scale_y: ESCALA_ENTRADA_CONTENIDO,
                translation_x: direccion * DESPLAZAMIENTO_ENTRADA_PX,
            });
            animar(hijo, {
                opacity: 255,
                duration: DURACION_ENTRADA_CONTENIDO_MS,
                delay: retraso,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            animarConResorte(hijo, {scale_x: 1, scale_y: 1, translation_x: 0}, {
                resorte: RESORTES.REBOTE,
                retraso,
            });
        }
        this._animarAncho(RESORTES.FLORECER);
    }

    /**
     * El punto rojo late solo mientras la cápsula muestra la grabación.
     * @param {boolean} debeLatir
     */
    _sincronizarLatidoGrabacion(debeLatir) {
        if (debeLatir === this._latiendoGrabacion)
            return;
        this._latiendoGrabacion = debeLatir;
        if (debeLatir)
            latir(this._puntoGrabacion);
        else
            detenerLatido(this._puntoGrabacion);
    }

    /**
     * El esqueleto (y la portada en gris) laten solo mientras carga la canción.
     * @param {boolean} debeLatir
     */
    _sincronizarLatido(debeLatir) {
        if (debeLatir === this._latiendo)
            return;
        this._latiendo = debeLatir;
        for (const actor of [this._esqueleto, this._caratula]) {
            if (debeLatir)
                latir(actor);
            else
                detenerLatido(actor);
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
        // La morfosis (contraer → florecer) ya empezó al cambiar la vista: el contenido nuevo
        // entrará desde el lado del deslizamiento, y la cápsula vuelve a su sitio con rebote.
        this._direccionEntrada = direccion;
        animarConResorte(this, {translation_x: 0}, {resorte: RESORTES.REBOTE});
    }

    /**
     * Tras confirmar un asomo, la cápsula real ocupa el sitio de la vista que se
     * asomaba: empieza con su ancho y posición y se asienta con un resorte.
     * @param {number} ancho - Ancho que tenía la vista de al lado al soltar.
     * @param {number} [desplazamiento=0] - Píxeles a la derecha de su sitio (si reaparece el círculo).
     */
    continuarDesde(ancho, desplazamiento = 0) {
        for (const propiedad of ['width', 'translation-x'])
            this.remove_transition(propiedad);
        this.translation_x = 0;
        this.set_width(-1);
        if (!this.mapped || ancho <= 0)
            return;
        const [, anchoNatural] = this.get_preferred_width(-1);
        this.set_width(ancho);
        animarConResorte(this, {width: anchoNatural}, {
            resorte: RESORTES.CAPSULA,
            alTerminar: () => this.set_width(-1),
        });
        if (desplazamiento) {
            this.translation_x = desplazamiento;
            animarConResorte(this, {translation_x: 0}, {resorte: RESORTES.CAPSULA});
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

    /**
     * Mide el ancho natural del nuevo contenido y anima la cápsula hasta él.
     * @param {{respuesta: number, amortiguacion: number}} [resorte=RESORTES.CAPSULA]
     */
    _animarAncho(resorte = RESORTES.CAPSULA) {
        if (this._previa)
            return;
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
            resorte,
            alTerminar: () => this.set_width(-1),
        });
    }
});

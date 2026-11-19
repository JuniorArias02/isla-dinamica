/**
 * GestorInteraccion — traduce lo que hace el usuario con el puntero en
 * intenciones para la isla. No dibuja nada.
 *
 *   Clic en la cápsula o en una alerta       → pulsar (abrir/cerrar/activar)
 *   Arrastrar la cápsula (ratón presionado) o deslizar con dos dedos a los lados
 *     → cambiar de vista: hora ↔ música ↔ temporizador
 *   Puntero fuera de la isla abierta 3 s     → cerrar
 *   Puntero encima de una alerta             → la alerta no se va
 *   (Opcional, ajuste "Abrir con el puntero encima": puntero encima de la cápsula → abrir)
 *   Arrastrar la isla hacia arriba / deslizar vertical en el touchpad
 *     / rueda del ratón sobre la isla         → cerrarla o descartar la alerta
 *   Enfocar otra ventana o abrir la vista general → cerrar
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    ESTADOS,
    UMBRAL_ARRASTRE_VISTA_PX,
    RETARDO_APERTURA_HOVER_MS,
    BLOQUEO_DESLIZAR_MS,
    UMBRAL_DESLIZAR_TOUCHPAD,
    UMBRAL_ARRASTRE_CERRAR_PX,
    UMBRAL_DESLIZAR_CERRAR_TOUCHPAD,
    VELOCIDAD_LANZAR,
} from '../constantes.js';
import {protegido} from '../registro.js';
import {ajuste, AJUSTES} from '../ajustes.js';

export class GestorInteraccion {
    /**
     * @param {object} opciones
     * @param {St.Widget} opciones.boton - Elemento del panel (cápsula + burbuja).
     * @param {St.Widget} opciones.tarjeta - Tarjeta flotante.
     * @param {object} opciones.intenciones - Callbacks:
     *   abrir(), cerrar(), pulsar(), mantenerAlerta(bool),
     *   cambiarVista(direccion) (+1 siguiente, -1 anterior),
     *   seguirArrastreCapsula(dx) / soltarArrastreCapsula() (la cápsula sigue al ratón),
     *   descartarDeslizando() (cerrar la isla o quitar la alerta con un gesto)
     */
    constructor({boton, tarjeta, intenciones}) {
        this._boton = boton;
        this._tarjeta = tarjeta;
        this._intenciones = intenciones;

        this._estado = ESTADOS.REPOSO;
        this._idApertura = 0;
        this._idCierre = 0;
        this._idBloqueoDeslizar = 0;
        this._acumuladoScroll = 0;
        this._acumuladoCierre = 0;

        // Tras cerrar con el puntero encima, no se reabre hasta que el puntero salga.
        this._requiereSalir = false;

        this._conectarSenales();
    }

    /**
     * El controlador cambió de estado: se reevalúa el puntero.
     * @param {string} estado - Uno de ESTADOS.
     */
    alCambiarEstado(estado) {
        const anterior = this._estado;
        this._estado = estado;
        this._gestoTarjeta.enabled = estado === ESTADOS.ALERTA;
        this._gestoArrastre.enabled = this._islaGrandeVisible();
        this._gestoArrastreCapsula.enabled = this._capsulaVisible();
        if (!this._gestoArrastre.enabled)
            this._acumuladoCierre = 0;

        // Al cerrarse la tarjeta, si el puntero quedó encima, no se reabre sola.
        if (anterior === ESTADOS.EXPANDIDO && estado !== ESTADOS.EXPANDIDO)
            this._requiereSalir = this._punteroEncima();

        this._evaluarPuntero();
    }

    destruir() {
        this._cancelar('_idApertura');
        this._cancelar('_idCierre');
        this._cancelar('_idBloqueoDeslizar');

        this._boton.disconnectObject(this);
        this._tarjeta.disconnectObject(this);
        global.display.disconnectObject(this);
        Main.overview.disconnectObject(this);

        this._boton.remove_action(this._gestoBoton);
        this._tarjeta.remove_action(this._gestoTarjeta);
        this._tarjeta.remove_action(this._gestoArrastre);
        this._boton.remove_action(this._gestoArrastreCapsula);
        this._intenciones = null;
    }

    // ───────────────────────── Señales ─────────────────────────

    _conectarSenales() {
        const evaluar = protegido('interacción: puntero', () => this._evaluarPuntero());
        const pulsar = protegido('interacción: clic', () => this._alPulsar());
        const cerrar = protegido('interacción: cerrar por foco', () => this._cerrarSiAbierta());

        this._gestoBoton = new Clutter.ClickGesture();
        this._gestoBoton.connect('recognize', pulsar);
        this._boton.add_action(this._gestoBoton);

        // En la tarjeta solo se usa el clic mientras muestra una alerta;
        // en la vista expandida los botones internos reciben sus propios clics.
        this._gestoTarjeta = new Clutter.ClickGesture();
        this._gestoTarjeta.connect('recognize', pulsar);
        this._gestoTarjeta.enabled = false;
        this._tarjeta.add_action(this._gestoTarjeta);

        // Arrastrar la isla hacia arriba para cerrarla (como en el móvil).
        this._gestoArrastre = new Clutter.PanGesture({pan_axis: Clutter.PanAxis.Y});
        this._gestoArrastre.connect('pan-update', protegido('interacción: arrastrando la isla',
            () => this._tarjeta.seguirArrastre(this._gestoArrastre.get_accumulated_delta().get_y())));
        this._gestoArrastre.connect('end', protegido('interacción: soltar la isla', () => this._alSoltarArrastre()));
        this._gestoArrastre.connect('cancel', protegido('interacción: arrastre cancelado', () => this._tarjeta.soltarArrastre()));
        this._gestoArrastre.enabled = false;
        this._tarjeta.add_action(this._gestoArrastre);

        // Arrastrar la cápsula a los lados (ratón presionado) para cambiar de vista.
        this._gestoArrastreCapsula = new Clutter.PanGesture({pan_axis: Clutter.PanAxis.X});
        this._gestoArrastreCapsula.connect('pan-update', protegido('interacción: arrastrando la cápsula',
            () => this._intenciones?.seguirArrastreCapsula(this._gestoArrastreCapsula.get_accumulated_delta().get_x())));
        this._gestoArrastreCapsula.connect('end', protegido('interacción: soltar la cápsula', () => this._alSoltarCapsula()));
        this._gestoArrastreCapsula.connect('cancel', protegido('interacción: arrastre de cápsula cancelado',
            () => this._intenciones?.soltarArrastreCapsula()));
        this._boton.add_action(this._gestoArrastreCapsula);

        this._boton.connectObject(
            'notify::hover', evaluar,
            'scroll-event', protegido('interacción: deslizar en la cápsula',
                (_actor, evento) => this._alHacerScroll(evento), Clutter.EVENT_PROPAGATE),
            this);
        this._tarjeta.connectObject(
            'notify::hover', evaluar,
            'scroll-event', protegido('interacción: deslizar en la isla',
                (_actor, evento) => this._alHacerScrollEnIsla(evento), Clutter.EVENT_PROPAGATE),
            this);

        // Hacer clic en otra ventana o abrir la vista general cierra la isla.
        global.display.connectObject('notify::focus-window', cerrar, this);
        Main.overview.connectObject('showing', cerrar, this);
    }

    _alPulsar() {
        this._cancelar('_idApertura');
        // Tras un toque (ej. intercambiar actividades en el círculo), el puntero quieto
        // encima no debe abrir la isla: hay que sacarlo y volver a entrar.
        this._requiereSalir = true;
        this._intenciones?.pulsar();
    }

    /** @returns {boolean} true si solo se ve la cápsula (sin alerta ni isla abierta). */
    _capsulaVisible() {
        return this._estado === ESTADOS.REPOSO || this._estado === ESTADOS.MULTIMEDIA;
    }

    /**
     * Soltar la cápsula tras arrastrarla: de derecha a izquierda → siguiente vista;
     * de izquierda a derecha → anterior. Un arrastre corto la devuelve a su sitio.
     */
    _alSoltarCapsula() {
        const desplazamiento = this._gestoArrastreCapsula.get_accumulated_delta().get_x();
        const velocidad = this._gestoArrastreCapsula.get_velocity().get_x();
        const suficiente = Math.abs(desplazamiento) > UMBRAL_ARRASTRE_VISTA_PX ||
            Math.abs(velocidad) > VELOCIDAD_LANZAR;
        if (suficiente && this._capsulaVisible())
            this._intenciones?.cambiarVista(desplazamiento < 0 ? 1 : -1);
        else
            this._intenciones?.soltarArrastreCapsula();
    }

    /** @returns {boolean} true si la isla grande está a la vista (alerta o expandida). */
    _islaGrandeVisible() {
        return this._estado === ESTADOS.ALERTA || this._estado === ESTADOS.EXPANDIDO;
    }

    _alSoltarArrastre() {
        const desplazamiento = this._gestoArrastre.get_accumulated_delta().get_y();
        const velocidad = this._gestoArrastre.get_velocity().get_y();
        const haciaArriba = desplazamiento < -UMBRAL_ARRASTRE_CERRAR_PX ||
            (desplazamiento < 0 && velocidad < -VELOCIDAD_LANZAR);

        if (haciaArriba && this._islaGrandeVisible())
            this._intenciones?.descartarDeslizando();
        else
            this._tarjeta.soltarArrastre();
    }

    /**
     * Dos dedos arriba/abajo en el touchpad, o la rueda del ratón, sobre la isla
     * abierta o sobre una alerta → se cierra / se descarta.
     * (Lo horizontal lo consume antes el carrusel para cambiar de página.)
     */
    _alHacerScrollEnIsla(evento) {
        if (!this._islaGrandeVisible())
            return Clutter.EVENT_PROPAGATE;

        const direccion = evento.get_scroll_direction();
        let cerrar = false;

        if (direccion === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = evento.get_scroll_delta();
            if (Math.abs(dy) > Math.abs(dx))
                this._acumuladoCierre += Math.abs(dy);
            cerrar = this._acumuladoCierre >= UMBRAL_DESLIZAR_CERRAR_TOUCHPAD;
        } else if (direccion === Clutter.ScrollDirection.UP || direccion === Clutter.ScrollDirection.DOWN) {
            cerrar = true;
        }

        if (cerrar) {
            this._acumuladoCierre = 0;
            this._intenciones?.descartarDeslizando();
        }
        return Clutter.EVENT_STOP;
    }

    _cerrarSiAbierta() {
        if (this._estado === ESTADOS.EXPANDIDO)
            this._intenciones?.cerrar();
    }

    // ───────────────────────── Puntero ─────────────────────────

    _punteroEncima() {
        return this._boton.hover || (this._tarjeta.visible && this._tarjeta.hover);
    }

    _evaluarPuntero() {
        const encima = this._punteroEncima();
        if (!encima)
            this._requiereSalir = false;

        switch (this._estado) {
        case ESTADOS.ALERTA:
            this._cancelar('_idApertura');
            this._cancelar('_idCierre');
            this._intenciones?.mantenerAlerta(encima);
            break;

        case ESTADOS.EXPANDIDO:
            this._cancelar('_idApertura');
            if (encima)
                this._cancelar('_idCierre');
            else
                this._programar('_idCierre', ajuste(AJUSTES.TIEMPO_CIERRE_MS), () => this._intenciones?.cerrar());
            break;

        default:
            this._cancelar('_idCierre');
            // Por defecto la isla se abre con clic; con el ajuste "Abrir con el puntero encima" también al pasar el puntero.
            if (ajuste(AJUSTES.ABRIR_CON_PUNTERO) && this._boton.hover && !this._requiereSalir)
                this._programar('_idApertura', RETARDO_APERTURA_HOVER_MS, () => this._intenciones?.abrir());
            else
                this._cancelar('_idApertura');
        }
    }

    // ───────────────────────── Deslizar sobre la cápsula ─────────────────────────

    /** Dos dedos a los lados (o rueda horizontal) sobre la cápsula → cambiar de vista. */
    _alHacerScroll(evento) {
        if (!this._capsulaVisible())
            return Clutter.EVENT_PROPAGATE;

        const direccion = evento.get_scroll_direction();
        let paso = 0;

        if (direccion === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = evento.get_scroll_delta();
            if (Math.abs(dx) > Math.abs(dy))
                this._acumuladoScroll += dx;
            if (Math.abs(this._acumuladoScroll) >= UMBRAL_DESLIZAR_TOUCHPAD)
                paso = this._acumuladoScroll > 0 ? 1 : -1;
        } else if (direccion === Clutter.ScrollDirection.RIGHT) {
            paso = 1;
        } else if (direccion === Clutter.ScrollDirection.LEFT) {
            paso = -1;
        }

        if (paso !== 0 && !this._idBloqueoDeslizar) {
            this._acumuladoScroll = 0;
            this._intenciones?.cambiarVista(paso);
            this._programar('_idBloqueoDeslizar', BLOQUEO_DESLIZAR_MS, () => {
                this._acumuladoScroll = 0;
            });
        }
        return Clutter.EVENT_STOP;
    }

    // ───────────────────────── Temporizadores ─────────────────────────

    _programar(campo, milisegundos, accion) {
        if (this[campo])
            return;
        const accionProtegida = protegido(`interacción: temporizador ${campo}`, accion);
        this[campo] = GLib.timeout_add(GLib.PRIORITY_DEFAULT, milisegundos, () => {
            this[campo] = 0;
            accionProtegida();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelar(campo) {
        if (this[campo]) {
            GLib.source_remove(this[campo]);
            this[campo] = 0;
        }
    }
}

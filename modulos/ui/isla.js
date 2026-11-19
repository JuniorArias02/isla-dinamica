/**
 * IslaUI — fachada de la capa de presentación.
 *
 * Es lo único que conocen extension.js y el controlador. Por dentro reúne:
 *   BotonPanel        → cápsula + burbuja en el panel superior
 *   TarjetaFlotante   → la isla grande que crece desde la cápsula
 *   Vistas            → alertas (Bluetooth, notificación, volumen/brillo, energía,
 *                       copiado, temporizador) y la vista expandida
 *   GestorInteraccion → puntero, clics y deslizamientos
 *
 * Recibe la "vista" del controlador (mostrarVista) y le devuelve las
 * intenciones del usuario mediante las acciones que le pasa extension.js.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    ESTADOS,
    TIPOS_ALERTA,
    ANCHO_ALERTA_PX,
    ANCHO_ALERTA_COMPACTA_PX,
    ANCHO_EXPANDIDO_PX,
    ACTIVIDADES,
} from '../constantes.js';
import {aplastar, aterrizar} from './animaciones.js';
import {ajuste, alCambiarAjuste, dejarDeEscucharAjustes, AJUSTES} from '../ajustes.js';
import {BotonPanel} from './botonPanel.js';
import {TarjetaFlotante} from './tarjetaFlotante.js';
import {GestorInteraccion} from './interaccion.js';
import {AlertaBluetooth} from './vistas/alertaBluetooth.js';
import {AlertaNotificacion} from './vistas/alertaNotificacion.js';
import {AlertaIndicador} from './vistas/alertaIndicador.js';
import {AlertaEnergia} from './vistas/alertaEnergia.js';
import {AlertaPortapapeles} from './vistas/alertaPortapapeles.js';
import {AlertaTemporizador} from './vistas/alertaTemporizador.js';
import {VistaExpandida, PAGINAS} from './vistas/vistaExpandida.js';

/** Posición dentro de la zona central del panel (0 = primera, donde estaba el reloj). */
const POSICION_EN_PANEL = 0;

/** Página de la isla abierta que corresponde a cada actividad. */
const PAGINA_DE_ACTIVIDAD = Object.freeze({
    [ACTIVIDADES.MUSICA]: PAGINAS.MUSICA,
    [ACTIVIDADES.TEMPORIZADOR]: PAGINAS.TEMPORIZADOR,
    [ACTIVIDADES.AURICULARES]: PAGINAS.DISPOSITIVOS,
});

/** Actividad que corresponde a cada página (solo las que pueden ir en la cápsula). */
const ACTIVIDAD_DE_PAGINA = Object.freeze({
    [PAGINAS.MUSICA]: ACTIVIDADES.MUSICA,
    [PAGINAS.TEMPORIZADOR]: ACTIVIDADES.TEMPORIZADOR,
});

export class IslaUI {
    /**
     * @param {object} acciones
     * @param {Function} acciones.abrirTarjeta
     * @param {Function} acciones.cerrarTarjeta
     * @param {Function} acciones.descartarAlerta - Recibe la clave de la alerta.
     * @param {Function} acciones.mantenerAlerta - Recibe true/false.
     * @param {Function} acciones.abrirCalendario - Cierra la isla y abre el calendario de GNOME.
     * @param {Function} acciones.establecerModoRuido - Recibe (ruta, modo) para unos AirPods.
     * @param {object} acciones.notificaciones - {activar(id), descartar(id), limpiar()} de la página de notificaciones.
     * @param {object} acciones.multimedia - alternar, siguiente, anterior, mostrarReproductor, obtenerPosicion.
     * @param {object} acciones.temporizador - iniciar(ms), sumar(ms), pausar(), reanudar(), cancelar().
     * @param {Function} acciones.establecerActividadPreferida - Recibe la actividad a ver en la cápsula.
     * @param {Function} acciones.cambiarVistaCompacta - Recibe +1/-1; devuelve false si ya estaba en el extremo.
     */
    constructor(acciones) {
        this._acciones = acciones;
        this._vista = {estado: ESTADOS.REPOSO, alerta: null, pista: null, dispositivos: []};
        this._ordenAlertaMostrada = -1;
        // Notificaciones llegadas después de este momento cuentan como "sin ver".
        this._vistasHastaMs = Date.now();
        this._claveAlertaMostrada = null;
        this._paginaSolicitada = null;

        this._boton = new BotonPanel();
        // Si GNOME destruye la cápsula por su cuenta (ej. al cerrar sesión), la isla deja de dibujar:
        // así no se tocan actores ya destruidos aunque sigan llegando datos (ej. Brave cambiando de canción).
        this._destruida = false;
        this._boton.connect('destroy', () => {
            this._destruida = true;
        });
        this._tarjeta = new TarjetaFlotante({
            obtenerAncla: () => this._boton.pildora.obtenerRectangulo(),
            // La cápsula "recibe" a la isla que se cierra con un pequeño rebote.
            alCerrarse: () => aterrizar(this._boton.pildora),
        });

        // Cada tipo de alerta tiene su vista y su ancho.
        this._alertas = {
            [TIPOS_ALERTA.BLUETOOTH]: {vista: new AlertaBluetooth(), ancho: ANCHO_ALERTA_PX},
            [TIPOS_ALERTA.NOTIFICACION]: {vista: new AlertaNotificacion(), ancho: ANCHO_ALERTA_PX},
            [TIPOS_ALERTA.INDICADOR]: {vista: new AlertaIndicador(), ancho: ANCHO_ALERTA_COMPACTA_PX},
            [TIPOS_ALERTA.ENERGIA]: {vista: new AlertaEnergia(), ancho: ANCHO_ALERTA_PX},
            [TIPOS_ALERTA.PORTAPAPELES]: {vista: new AlertaPortapapeles(), ancho: ANCHO_ALERTA_COMPACTA_PX},
            [TIPOS_ALERTA.TEMPORIZADOR]: {vista: new AlertaTemporizador(), ancho: ANCHO_ALERTA_PX},
        };
        this._expandida = new VistaExpandida({
            multimedia: acciones.multimedia,
            alPulsarFecha: () => this._acciones.abrirCalendario(),
            alCambiarModoRuido: (ruta, modo) => this._acciones.establecerModoRuido(ruta, modo),
            notificaciones: acciones.notificaciones,
            temporizador: acciones.temporizador,
            // Ver la página de notificaciones las marca como vistas.
            alVerPagina: id => {
                if (id === PAGINAS.NOTIFICACIONES)
                    this._marcarNotificacionesVistas();
                // Como en el móvil: la actividad que el usuario mira es la que queda en la cápsula.
                // (Las notificaciones son temporales: no se quedan.) Se avisa después del dibujado
                // en curso para no volver a entrar en el controlador mientras emite la vista.
                const actividad = ACTIVIDAD_DE_PAGINA[id];
                if (actividad)
                    Promise.resolve().then(() => this._acciones?.establecerActividadPreferida(actividad));
            },
            // La página visible cambió de alto: la isla se reajusta con rebote.
            alCambiarAltura: () => {
                if (this._vista.estado === ESTADOS.EXPANDIDO)
                    this._tarjeta.mostrar(this._expandida, ANCHO_EXPANDIDO_PX);
            },
        });

        this._interaccion = new GestorInteraccion({
            boton: this._boton,
            tarjeta: this._tarjeta,
            intenciones: {
                abrir: () => this._abrir(),
                cerrar: () => this._acciones.cerrarTarjeta(),
                pulsar: () => this._alPulsar(),
                mantenerAlerta: mantener => this._acciones.mantenerAlerta(mantener),
                cambiarVista: direccion => this._cambiarVista(direccion),
                seguirArrastreCapsula: dx => this._boton.pildora.seguirArrastre(dx),
                soltarArrastreCapsula: () => this._boton.pildora.soltarArrastre(),
                descartarDeslizando: () => this._descartarDeslizando(),
            },
        });
    }

    /**
     * Inserta la isla en el panel y en la capa superior de la pantalla.
     * @param {string} rol - Identificador único en el panel (el uuid de la extensión).
     */
    montar(rol) {
        Main.panel.addToStatusArea(rol, this._boton, POSICION_EN_PANEL, 'center');
        // Sin trackFullscreen: GNOME volvería a hacer visible la tarjeta oculta en cada
        // cambio de ventanas. La visibilidad la controla solo la TarjetaFlotante.
        Main.layoutManager.addTopChrome(this._tarjeta);

        // El reloj de Ubuntu se oculta (la isla muestra la hora) según el ajuste, y reacciona al instante.
        this._relojGnome = Main.panel.statusArea.dateMenu?._clockDisplay ?? null;
        this._aplicarRelojDeGnome(ajuste(AJUSTES.OCULTAR_RELOJ_GNOME));
        alCambiarAjuste(AJUSTES.OCULTAR_RELOJ_GNOME, ocultar => this._aplicarRelojDeGnome(ocultar), this);
    }

    /**
     * La isla muestra la hora, así que se puede ocultar el TEXTO del reloj de Ubuntu.
     * El botón sigue ahí (con el punto de notificaciones sin leer) y al pulsarlo
     * sigue abriendo el calendario y el historial de notificaciones.
     * @param {boolean} ocultar
     */
    _aplicarRelojDeGnome(ocultar) {
        if (ocultar)
            this._relojGnome?.hide();
        else
            this._relojGnome?.show();
    }

    _restaurarRelojDeGnome() {
        dejarDeEscucharAjustes(this);
        this._relojGnome?.show();
        this._relojGnome = null;
    }

    /** Abre el calendario y las notificaciones de GNOME (menú del reloj original). */
    abrirCalendarioGnome() {
        Main.panel.toggleCalendar();
    }

    /**
     * Dibuja la vista calculada por el ControladorIsla.
     * @param {import('../controlador.js').Vista} vista
     */
    mostrarVista(vista) {
        if (this._destruida)
            return;
        this._vista = vista;
        const {estado, alerta, pista, dispositivos} = vista;

        this._boton.actualizar(vista);
        if (this._expandida.paginaVisible === PAGINAS.NOTIFICACIONES)
            this._vistasHastaMs = Date.now();
        this._boton.pildora.establecerNoLeidas(this._hayNoLeidas());
        this._expandida.actualizar(pista, dispositivos, vista.reloj, vista.notificaciones ?? [], vista.temporizador);

        switch (estado) {
        case ESTADOS.ALERTA:
            this._mostrarAlerta(alerta);
            break;
        case ESTADOS.EXPANDIDO:
            this._tarjeta.mostrar(this._expandida, ANCHO_EXPANDIDO_PX);
            break;
        default:
            this._tarjeta.ocultar();
        }

        this._expandida.establecerActiva(estado === ESTADOS.EXPANDIDO, this._paginaSolicitada);
        if (estado === ESTADOS.EXPANDIDO)
            this._paginaSolicitada = null;

        this._interaccion.alCambiarEstado(estado);
    }

    /** Destruye todo en orden inverso. Se llama desde disable(). */
    destruir() {
        this._destruida = true;
        this._restaurarRelojDeGnome();
        this._interaccion.destruir();

        Main.layoutManager.removeChrome(this._tarjeta);
        this._tarjeta.destruir();

        Object.values(this._alertas).forEach(({vista}) => vista.destroy());
        this._expandida.destroy();

        this._boton.destroy();
        this._acciones = null;
    }

    // ───────────────────────── Intenciones del usuario ─────────────────────────

    _abrir() {
        // Sobre el círculo → la página de lo que muestra el círculo.
        // Con mensajes sin ver → notificaciones. Si no → la actividad de la cápsula (o música).
        const {principal, secundaria} = this._vista.actividades ?? {};
        if (this._boton.burbuja.hover && secundaria)
            this._paginaSolicitada = PAGINA_DE_ACTIVIDAD[secundaria];
        else if (this._hayNoLeidas())
            this._paginaSolicitada = PAGINAS.NOTIFICACIONES;
        else
            this._paginaSolicitada = PAGINA_DE_ACTIVIDAD[principal] ?? PAGINAS.MUSICA;
        this._acciones.abrirTarjeta();
    }

    /** @returns {boolean} true si hay notificaciones recientes que el usuario aún no vio. */
    _hayNoLeidas() {
        return (this._vista.notificaciones ?? []).some(n => n.marcaTiempoMs > this._vistasHastaMs);
    }

    _marcarNotificacionesVistas() {
        this._vistasHastaMs = Date.now();
        this._boton.pildora.establecerNoLeidas(false);
    }

    _alPulsar() {
        const {estado, alerta} = this._vista;
        // Se "aplasta" lo que se tocó: el círculo, la cápsula o la isla grande.
        let tocado = this._tarjeta;
        if (estado === ESTADOS.REPOSO || estado === ESTADOS.MULTIMEDIA)
            tocado = this._boton.burbuja.hover ? this._boton.burbuja : this._boton.pildora;
        aplastar(tocado);

        if (estado === ESTADOS.ALERTA) {
            this._acciones.descartarAlerta(alerta.clave);
            switch (alerta.tipo) {
            case TIPOS_ALERTA.NOTIFICACION:
                // Abre la app/chat que envió la notificación (como el banner nativo).
                alerta.datos.activar?.();
                break;
            case TIPOS_ALERTA.BLUETOOTH:
                this._paginaSolicitada = PAGINAS.DISPOSITIVOS;
                this._acciones.abrirTarjeta();
                break;
            case TIPOS_ALERTA.TEMPORIZADOR:
                // "Listo": apaga el aviso de tiempo cumplido.
                this._acciones.temporizador.cancelar();
                break;
            default:
                // Volumen, brillo, energía, copiado: tocar solo los quita.
                break;
            }
            return;
        }

        if (estado === ESTADOS.EXPANDIDO) {
            this._acciones.cerrarTarjeta();
            return;
        }

        // Tocar el círculo intercambia las actividades (la del círculo pasa a la cápsula).
        const secundaria = this._vista.actividades?.secundaria;
        if (this._boton.burbuja.hover && ACTIVIDAD_DE_PAGINA[PAGINA_DE_ACTIVIDAD[secundaria]]) {
            this._acciones.establecerActividadPreferida(secundaria);
            return;
        }
        this._abrir();
    }

    /** Gesto de deslizar sobre la isla grande: cierra la tarjeta o quita la alerta. */
    _descartarDeslizando() {
        const {estado, alerta} = this._vista;
        if (estado === ESTADOS.ALERTA && alerta) {
            this._acciones.descartarAlerta(alerta.clave);
            if (alerta.tipo === TIPOS_ALERTA.TEMPORIZADOR)
                this._acciones.temporizador.cancelar();
        } else if (estado === ESTADOS.EXPANDIDO)
            this._acciones.cerrarTarjeta();
    }

    /**
     * Deslizar sobre la cápsula: hora ↔ música ↔ temporizador.
     * @param {number} direccion - +1 (de derecha a izquierda) o -1 (de izquierda a derecha).
     */
    _cambiarVista(direccion) {
        const cambio = this._acciones.cambiarVistaCompacta(direccion);
        this._boton.pildora.animarCambio(direccion, cambio);
    }

    // ───────────────────────── Alertas ─────────────────────────

    _mostrarAlerta(alerta) {
        const {vista: vistaAlerta, ancho} = this._alertas[alerta.tipo] ?? this._alertas[TIPOS_ALERTA.NOTIFICACION];

        // Alerta nueva → animación de entrada completa.
        // Misma clave pero otro envío (otro mensaje del mismo chat) → pequeño rebote.
        // Mismo envío (ej. llegó la batería) → solo se actualizan los datos.
        const mismaClave = alerta.clave === this._claveAlertaMostrada;
        const otroEnvio = alerta.orden !== this._ordenAlertaMostrada;
        this._ordenAlertaMostrada = alerta.orden;
        this._claveAlertaMostrada = alerta.clave;

        const yaVisible = this._tarjeta.abierta;

        vistaAlerta.actualizar(alerta.datos);
        this._tarjeta.mostrar(vistaAlerta, ancho);
        if (otroEnvio && mismaClave && yaVisible)
            vistaAlerta.animarActualizacion?.();
        else if (otroEnvio)
            vistaAlerta.animarEntrada();
    }
}

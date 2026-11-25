// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

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

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    ESTADOS,
    TIPOS_ALERTA,
    ANCHO_ALERTA_PX,
    ANCHO_ALERTA_COMPACTA_PX,
    ANCHO_EXPANDIDO_PX,
    ACTIVIDADES,
} from '../constantes.js';
import {registrarInfo, protegido} from '../registro.js';
import {aplastar, aterrizar} from './animaciones.js';
import {
    sentidoDeArrastre,
    direccionDeSentido,
    progresoDeArrastre,
    debeConfirmarAsomo,
    direccionCambioDirecto,
} from './logicaAsomo.js';
import {ajuste, alCambiarAjuste, dejarDeEscucharAjustes, AJUSTES, ARRASTRE_CAPSULA} from '../ajustes.js';
import {GestorEstilos} from './estilos/gestorEstilos.js';
import {BotonPanel} from './botonPanel.js';
import {FASES_ASOMO} from './componentes/asomo.js';
import {TarjetaFlotante} from './tarjetaFlotante.js';
import {GestorInteraccion} from './interaccion.js';
import {AlertaBluetooth} from './vistas/alertaBluetooth.js';
import {AlertaNotificacion} from './vistas/alertaNotificacion.js';
import {AlertaIndicador} from './vistas/alertaIndicador.js';
import {AlertaEnergia} from './vistas/alertaEnergia.js';
import {AlertaPortapapeles} from './vistas/alertaPortapapeles.js';
import {AlertaTemporizador} from './vistas/alertaTemporizador.js';
import {AlertaModo} from './vistas/alertaModo.js';
import {AlertaCaptura} from './vistas/alertaCaptura.js';
import {AlertaGrabacion} from './vistas/alertaGrabacion.js';
import {AlertaLlamada} from './vistas/alertaLlamada.js';
import {MenuContextual} from './menuContextual.js';
import {VistaExpandida, PAGINAS} from './vistas/vistaExpandida.js';

/** Posición dentro de la zona central del panel (0 = primera, donde estaba el reloj). */
const POSICION_EN_PANEL = 0;

/** Página de la isla abierta que corresponde a cada actividad. */
const PAGINA_DE_ACTIVIDAD = Object.freeze({
    [ACTIVIDADES.LLAMADA]: PAGINAS.LLAMADA,
    [ACTIVIDADES.GRABACION]: PAGINAS.GRABACION,
    [ACTIVIDADES.HORA]: PAGINAS.CALENDARIO,
    [ACTIVIDADES.MUSICA]: PAGINAS.MUSICA,
    [ACTIVIDADES.AUDIO]: PAGINAS.AUDIO,
    [ACTIVIDADES.TEMPORIZADOR]: PAGINAS.TEMPORIZADOR,
    [ACTIVIDADES.AURICULARES]: PAGINAS.DISPOSITIVOS,
});

/** Actividad que corresponde a cada página (solo las que pueden ir en la cápsula). */
const ACTIVIDAD_DE_PAGINA = Object.freeze({
    [PAGINAS.CALENDARIO]: ACTIVIDADES.HORA,
    [PAGINAS.MUSICA]: ACTIVIDADES.MUSICA,
    [PAGINAS.AUDIO]: ACTIVIDADES.AUDIO,
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
     * @param {Function} acciones.establecerNoMolestar - Recibe true/false (menú del clic derecho).
     * @param {Function} acciones.abrirAjustes - Abre la ventana de ajustes.
     * @param {Function} acciones.abrirRegistro - Abre el registro de errores.
     * @param {object} acciones.calendario - {abrir(), actualizar()} de la página Calendario.
     * @param {object} acciones.capturas - {abrirCaptura(), abrirGrabacion(), detenerGrabacion()}.
     * @param {object} acciones.llamada - {mostrar(), alternarSilencio()} de la llamada en curso.
     * @param {object} acciones.notificaciones - {activar(id), descartar(id), limpiar()} de la página de notificaciones.
     * @param {object} acciones.multimedia - alternar, siguiente, anterior, mostrarReproductor, obtenerPosicion.
     * @param {object} acciones.audio - Las mismas, sobre el reproductor del audio de chat (nota de voz).
     * @param {Function} acciones.mostrarLlamadaEntrante - Vuelve a mostrar el aviso de la llamada que suena.
     * @param {object} acciones.temporizador - iniciar(ms), sumar(ms), pausar(), reanudar(), cancelar().
     * @param {Function} acciones.establecerActividadPreferida - Recibe la actividad a ver en la cápsula.
     * @param {Function} acciones.cambiarVistaCompacta - Recibe +1/-1; devuelve false si ya estaba en el extremo.
     * @param {Function} acciones.vistaVecina - Recibe +1/-1; devuelve la actividad de al lado o null.
     */
    constructor(acciones, {rutaExtension}) {
        this._rutaExtension = rutaExtension;
        /** @type {GestorEstilos|null} Se crea al montar (carga las hojas de estilos). */
        this._estilos = null;
        this._acciones = acciones;
        this._vista = {estado: ESTADOS.REPOSO, alerta: null, pista: null, dispositivos: []};
        this._ordenAlertaMostrada = -1;
        // Notificaciones llegadas después de este momento cuentan como "sin ver".
        this._vistasHastaMs = Date.now();
        this._claveAlertaMostrada = null;
        this._paginaSolicitada = null;
        this._idRecolocar = 0;
        this._indicadorGrabacionOculto = false;
        /** Arrastre de la cápsula en curso: {sentido, objetivo, principal, inerte, directo}. */
        this._arrastre = null;

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
            [TIPOS_ALERTA.MODO]: {vista: new AlertaModo(), ancho: ANCHO_ALERTA_COMPACTA_PX},
            [TIPOS_ALERTA.CAPTURA]: {vista: new AlertaCaptura(), ancho: ANCHO_ALERTA_PX},
            [TIPOS_ALERTA.GRABACION]: {vista: new AlertaGrabacion(), ancho: ANCHO_ALERTA_PX},
            [TIPOS_ALERTA.LLAMADA]: {
                vista: new AlertaLlamada({
                    alContestar: datos => this._contestarLlamada(datos),
                    alRechazar: datos => this._rechazarLlamada(datos),
                }),
                ancho: ANCHO_ALERTA_PX,
            },
        };
        this._expandida = new VistaExpandida({
            multimedia: acciones.multimedia,
            audio: acciones.audio,
            alPulsarFecha: () => this._acciones.abrirCalendario(),
            alCambiarModoRuido: (ruta, modo) => this._acciones.establecerModoRuido(ruta, modo),
            notificaciones: acciones.notificaciones,
            temporizador: acciones.temporizador,
            alAbrirCalendario: () => this._acciones.calendario.abrir(),
            alDetenerGrabacion: () => this._acciones.capturas.detenerGrabacion(),
            llamada: acciones.llamada,
            // Ver la página de notificaciones las marca como vistas.
            alVerPagina: id => {
                if (id === PAGINAS.NOTIFICACIONES)
                    this._marcarNotificacionesVistas();
                // Por si el calendario del panel quedó en otro mes: se vuelve a pedir el actual.
                if (id === PAGINAS.CALENDARIO)
                    Promise.resolve().then(() => this._acciones?.calendario.actualizar());
                // Como en el móvil: la actividad que el usuario mira es la que queda en la cápsula.
                // (Las notificaciones son temporales: no se quedan.) Se avisa después del dibujado
                // en curso para no volver a entrar en el controlador mientras emite la vista.
                const actividad = ACTIVIDAD_DE_PAGINA[id];
                if (actividad)
                    Promise.resolve().then(() => this._acciones?.establecerActividadPreferida(actividad));
                this._actualizarTinteTarjeta();
            },
            // La página visible cambió de alto: la isla se reajusta con rebote.
            alCambiarAltura: () => {
                if (this._vista.estado === ESTADOS.EXPANDIDO)
                    this._tarjeta.mostrar(this._expandida, ANCHO_EXPANDIDO_PX);
            },
        });

        // Clic derecho en la cápsula: No molestar, ajustes y registro de errores.
        this._menu = new MenuContextual({
            fuente: this._boton.pildora,
            dueno: this._boton,
            acciones: {
                establecerNoMolestar: activo => this._acciones.establecerNoMolestar(activo),
                abrirAjustes: () => this._acciones.abrirAjustes(),
                abrirRegistro: () => this._acciones.abrirRegistro(),
                capturarPantalla: () => this._acciones.capturas.abrirCaptura(),
                grabarPantalla: () => this._acciones.capturas.abrirGrabacion(),
                detenerGrabacion: () => this._acciones.capturas.detenerGrabacion(),
            },
            obtenerModos: () => this._vista.modos ?? {noMolestar: false, avion: false},
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
                seguirArrastreCapsula: dx => this._seguirArrastreCapsula(dx),
                soltarArrastreCapsula: final => this._soltarArrastreCapsula(final),
                descartarDeslizando: () => this._descartarDeslizando(),
                abrirMenu: () => this._abrirMenu(),
            },
        });
    }

    /**
     * Inserta la isla en el panel y en la capa superior de la pantalla.
     * @param {string} rol - Identificador único en el panel (el uuid de la extensión).
     */
    montar(rol) {
        Main.panel.addToStatusArea(rol, this._boton, POSICION_EN_PANEL, 'center');
        // La cápsula no usa menú de GNOME (el suyo va con clic derecho), pero GNOME le registra
        // uno vacío en el gestor de menús del panel. Ese gestor abre el menú del botón vecino
        // (el del reloj) cuando el puntero pasa por encima mientras se arrastra la cápsula,
        // y corta el arrastre: se quita de ahí.
        if (this._boton.menu)
            Main.panel.menuManager.removeMenu(this._boton.menu);
        // Sin trackFullscreen: GNOME volvería a hacer visible la tarjeta oculta en cada
        // cambio de ventanas. La visibilidad la controla solo la TarjetaFlotante.
        Main.layoutManager.addTopChrome(this._tarjeta);

        // Estilo (Liquid Glass o negro clásico): una clase en las dos raíces; cambia al instante.
        this._estilos = new GestorEstilos({rutaExtension: this._rutaExtension, raices: [this._boton, this._tarjeta]});
        this._estilos.aplicar(ajuste(AJUSTES.ESTILO_ISLA));
        // Después de aplicarlo, extension.js pide redibujar la vista (cualquier ajuste lo hace):
        // así lo que el estilo no usa (ej. el color de la portada) se quita o se pone.
        alCambiarAjuste(AJUSTES.ESTILO_ISLA, estilo => this._estilos?.aplicar(estilo), this);

        // El reloj de Ubuntu se oculta (la isla muestra la hora) según el ajuste, y reacciona al instante.
        this._relojGnome = Main.panel.statusArea.dateMenu?._clockDisplay ?? null;
        this._aplicarRelojDeGnome(ajuste(AJUSTES.OCULTAR_RELOJ_GNOME));
        alCambiarAjuste(AJUSTES.OCULTAR_RELOJ_GNOME, ocultar => this._aplicarRelojDeGnome(ocultar), this);

        // Se conectó o desconectó una pantalla: la isla sigue a la cápsula a su nuevo sitio.
        Main.layoutManager.connectObject('monitors-changed',
            protegido('isla: cambio de pantallas', () => this._alCambiarPantallas()), this);
    }

    /**
     * GNOME ya movió el panel, pero las posiciones definitivas existen después del
     * siguiente cálculo de tamaños: la tarjeta se recoloca cuando el Shell queda libre.
     */
    _alCambiarPantallas() {
        registrarInfo(`Pantallas cambiadas: ${Main.layoutManager.monitors.length} monitor(es), ` +
            `principal en x=${Main.layoutManager.primaryMonitor?.x ?? '?'}.`);
        const laters = global.compositor.get_laters();
        if (this._idRecolocar)
            laters.remove(this._idRecolocar);
        this._idRecolocar = laters.add(Meta.LaterType.IDLE, protegido('isla: recolocar tras cambio de pantallas', () => {
            this._idRecolocar = 0;
            if (!this._destruida)
                this._tarjeta.recolocar();
            return GLib.SOURCE_REMOVE;
        }));
    }

    /**
     * La isla abierta se tiñe con el color de la canción mientras muestra la página Música.
     */
    _actualizarTinteTarjeta() {
        const conMusica = this._vista.estado === ESTADOS.EXPANDIDO && this._expandida.paginaVisible === PAGINAS.MUSICA;
        this._tarjeta.establecerTinte(conMusica ? this._vista.pista?.colorPortada ?? null : null);
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

    /**
     * Mientras se graba, la isla muestra el contador y el botón para detener: el
     * indicador rojo de GNOME sobra. Se oculta su contenedor del panel (el indicador
     * se vuelve a mostrar solo en cada grabación, el contenedor no).
     * @param {boolean} grabando
     */
    _aplicarIndicadorGrabacion(grabando) {
        const contenedor = Main.panel.statusArea.screenRecording?.container ?? null;
        if (!contenedor)
            return;
        const ocultar = grabando && ajuste(AJUSTES.OCULTAR_INDICADOR_GRABACION) && ajuste(AJUSTES.AVISAR_CAPTURAS);
        if (ocultar === this._indicadorGrabacionOculto)
            return;
        this._indicadorGrabacionOculto = ocultar;
        contenedor.visible = !ocultar;
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
     * @param {import('../controlador.js').Vista} vistaCompleta
     */
    mostrarVista(vistaCompleta) {
        if (this._destruida)
            return;
        // Lo que el estilo elegido no usa no llega a dibujarse (ej. el color de la portada).
        const vista = this._estilos?.adaptarVista(vistaCompleta) ?? vistaCompleta;
        this._vista = vista;
        const {estado, alerta, pista, dispositivos} = vista;

        this._comprobarAsomo(vista);
        this._boton.actualizar(vista);
        this._menu.actualizarModos(vista.modos);
        if (this._expandida.paginaVisible === PAGINAS.NOTIFICACIONES)
            this._vistasHastaMs = Date.now();
        this._boton.pildora.establecerNoLeidas(this._hayNoLeidas());
        this._expandida.actualizar(pista, dispositivos, vista.reloj, vista.notificaciones ?? [], vista.temporizador,
            vista.calendario ?? null, vista.grabacion ?? null, vista.llamada ?? null, vista.audio ?? null);
        this._menu.actualizarGrabacion(Boolean(vista.grabacion?.grabando));
        this._aplicarIndicadorGrabacion(Boolean(vista.grabacion?.grabando));

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
        this._actualizarTinteTarjeta();
    }

    /** Destruye todo en orden inverso. Se llama desde disable(). */
    destruir() {
        this._destruida = true;
        // El indicador de grabación de GNOME vuelve a verse.
        if (this._indicadorGrabacionOculto) {
            const contenedor = Main.panel.statusArea.screenRecording?.container;
            if (contenedor)
                contenedor.visible = true;
            this._indicadorGrabacionOculto = false;
        }
        Main.layoutManager.disconnectObject(this);
        if (this._idRecolocar) {
            global.compositor.get_laters().remove(this._idRecolocar);
            this._idRecolocar = 0;
        }
        this._restaurarRelojDeGnome();
        this._estilos?.destruir();
        this._estilos = null;
        this._interaccion.destruir();

        Main.layoutManager.removeChrome(this._tarjeta);
        this._tarjeta.destruir();

        this._menu.destruir();
        Object.values(this._alertas).forEach(({vista}) => vista.destroy());
        this._expandida.destroy();

        this._boton.destroy();
        this._acciones = null;
    }

    // ───────────────────────── Intenciones del usuario ─────────────────────────

    _abrir() {
        // Sobre el círculo → la página de lo que muestra el círculo.
        // En llamada → la llamada (es lo urgente). Con mensajes sin ver → notificaciones.
        // Si no → la actividad de la cápsula (o el calendario).
        const {principal, secundaria} = this._vista.actividades ?? {};
        // El círculo de una llamada que suena no tiene página: vuelve su aviso.
        if (this._boton.burbuja.hover && secundaria === ACTIVIDADES.LLAMADA_ENTRANTE) {
            this._acciones.mostrarLlamadaEntrante();
            return;
        }
        if (this._boton.burbuja.hover && secundaria)
            this._paginaSolicitada = PAGINA_DE_ACTIVIDAD[secundaria];
        else if (principal === ACTIVIDADES.LLAMADA)
            this._paginaSolicitada = PAGINAS.LLAMADA;
        else if (this._hayNoLeidas())
            this._paginaSolicitada = PAGINAS.NOTIFICACIONES;
        else
            this._paginaSolicitada = PAGINA_DE_ACTIVIDAD[principal] ?? PAGINAS.CALENDARIO;
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
            case TIPOS_ALERTA.CAPTURA:
            case TIPOS_ALERTA.GRABACION:
            case TIPOS_ALERTA.LLAMADA:
                // Abre la app/chat (o la captura / el vídeo), como el aviso nativo de GNOME.
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
        // Si es una llamada que suena (aviso oculto), vuelve el aviso con sus botones.
        const secundaria = this._vista.actividades?.secundaria;
        if (this._boton.burbuja.hover && secundaria === ACTIVIDADES.LLAMADA_ENTRANTE) {
            this._acciones.mostrarLlamadaEntrante();
            return;
        }
        if (this._boton.burbuja.hover && ACTIVIDAD_DE_PAGINA[PAGINA_DE_ACTIVIDAD[secundaria]]) {
            this._acciones.establecerActividadPreferida(secundaria);
            return;
        }
        this._abrir();
    }

    /** Clic derecho en la cápsula: si la isla estaba abierta se cierra y aparece el menú. */
    _abrirMenu() {
        if (this._vista.estado === ESTADOS.EXPANDIDO)
            this._acciones.cerrarTarjeta();
        this._menu.alternar();
    }

    // ───────────────────────── Llamada que suena ─────────────────────────

    /**
     * Botón verde: contesta con el botón del aviso si la app lo ofrece; si no, abre la
     * app (ahí se contesta).
     * @param {object} datos - Datos de la alerta de llamada.
     */
    _contestarLlamada(datos) {
        if (!datos)
            return;
        this._acciones.descartarAlerta(`llamada-${datos.id}`);
        if (datos.llamada?.contestar)
            datos.llamada.contestar();
        else
            datos.activar?.();
    }

    /**
     * Botón rojo: rechaza con el botón del aviso si existe; si no, solo quita la alerta.
     * @param {object} datos - Datos de la alerta de llamada.
     */
    _rechazarLlamada(datos) {
        if (!datos)
            return;
        this._acciones.descartarAlerta(`llamada-${datos.id}`);
        datos.llamada?.rechazar?.();
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

    // ───────────────────────── Arrastrar la cápsula ─────────────────────────
    // Según el ajuste "Al arrastrar la cápsula":
    //   asomar  → la vista de al lado se asoma siguiendo al puntero (Asomo);
    //   cambiar → la cápsula se estira un poco y, al soltar, cambia de vista (_cambiarVista).

    /**
     * El puntero se mueve con la cápsula presionada. La primera vez que pasa el umbral
     * se elige la vista de al lado (según el sentido) y desde ahí la sigue el asomo.
     * @param {number} desplazamiento - Píxeles en horizontal desde que se presionó.
     */
    _seguirArrastreCapsula(desplazamiento) {
        if (!this._arrastre) {
            const sentido = sentidoDeArrastre(desplazamiento);
            if (!sentido)
                return;
            this._arrastre = this._empezarArrastre(sentido);
        }
        const arrastre = this._arrastre;
        if (arrastre.inerte)
            return;
        // "Cambiar al instante", o sin otra vista a la que ir: la cápsula se estira un poco.
        if (!arrastre.objetivo) {
            this._boton.pildora.seguirArrastre(desplazamiento);
            return;
        }
        this._boton.moverAsomo(progresoDeArrastre(desplazamiento, arrastre.sentido));
    }

    /**
     * @param {number} sentido - +1 o -1.
     * @returns {{sentido: number, objetivo: string|null, principal: string|null, inerte: boolean, directo: boolean}}
     */
    _empezarArrastre(sentido) {
        const {estado, actividades} = this._vista;
        const principal = actividades?.principal ?? null;
        const inerte = {sentido, objetivo: null, principal, inerte: true, directo: false};
        if (estado !== ESTADOS.REPOSO && estado !== ESTADOS.MULTIMEDIA)
            return inerte;
        if (ajuste(AJUSTES.ARRASTRE_CAPSULA) === ARRASTRE_CAPSULA.CAMBIAR)
            return {sentido, objetivo: null, principal, inerte: false, directo: true};
        const objetivo = this._acciones.vistaVecina(direccionDeSentido(sentido));
        if (!objetivo)
            return {sentido, objetivo: null, principal, inerte: false, directo: false};
        if (!this._boton.empezarAsomo(objetivo))
            return inerte;
        return {sentido, objetivo, principal, inerte: false, directo: false};
    }

    /**
     * Soltó la cápsula (o el gesto se canceló): se confirma o vuelve a su sitio.
     * @param {{desplazamiento: number, velocidad: number}|null} final - null si se canceló.
     */
    _soltarArrastreCapsula(final) {
        const arrastre = this._arrastre;
        this._arrastre = null;
        if (arrastre?.directo) {
            const {estado} = this._vista;
            const direccion = final && (estado === ESTADOS.REPOSO || estado === ESTADOS.MULTIMEDIA)
                ? direccionCambioDirecto(final.desplazamiento, final.velocidad)
                : 0;
            if (direccion)
                this._cambiarVista(direccion);
            else
                this._boton.pildora.soltarArrastre();
            return;
        }
        if (!arrastre || !arrastre.objetivo) {
            if (!arrastre?.inerte)
                this._boton.pildora.soltarArrastre();
            return;
        }
        if (arrastre.inerte || this._boton.faseAsomo !== FASES_ASOMO.SIGUIENDO)
            return;

        const progreso = progresoDeArrastre(final?.desplazamiento ?? 0, arrastre.sentido);
        if (final && debeConfirmarAsomo(progreso, final.velocidad * arrastre.sentido)) {
            // Primero el asomo pasa a "confirmando" (deja de copiar datos), luego cambia la vista.
            this._boton.confirmarAsomo();
            this._acciones.establecerActividadPreferida(arrastre.objetivo);
        } else {
            this._boton.cancelarAsomo();
        }
    }

    /**
     * Si mientras se asoma llega una alerta, se abre la isla o la vista de al lado deja de
     * existir (ej. la música se detuvo), el asomo se corta al instante.
     * @param {import('../controlador.js').Vista} vista
     */
    _comprobarAsomo(vista) {
        if (!this._boton.asomoActivo || this._boton.faseAsomo === FASES_ASOMO.CONFIRMANDO)
            return;
        const {estado, actividades} = vista;
        const objetivo = this._arrastre?.objetivo ?? this._boton.objetivoAsomo;
        const principal = this._arrastre?.principal ?? actividades?.principal;
        const sigue = (estado === ESTADOS.REPOSO || estado === ESTADOS.MULTIMEDIA) &&
            actividades?.principal === principal &&
            Boolean(actividades?.vistas?.includes(objetivo));
        if (sigue)
            return;
        this._boton.abortarAsomo();
        if (this._arrastre)
            this._arrastre.inerte = true;
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

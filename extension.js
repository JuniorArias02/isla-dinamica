// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Isla Dinámica para GNOME Shell 50.x (ESM).
 * Autor: JuniorArias02 · uuid: isla-dinamica@juniorarias02
 *
 * Punto de entrada de la extensión.
 *
 * Es la "raíz de composición": crea las piezas y las conecta entre sí.
 *
 *   Servicios (Bluetooth, MPRIS, notificaciones)  ──datos──▶  ControladorIsla
 *   ControladorIsla  ──vista──▶  IslaUI
 *   IslaUI  ──intenciones del usuario──▶  ControladorIsla / servicios
 *
 * enable()  crea todo y lo conecta. Si algo falla, deshace todo (nunca queda a medias).
 * disable() lo destruye en orden inverso; un paso que falle no impide los siguientes.
 *
 * Todos los cruces entre capas pasan por `protegido()`: cualquier excepción
 * queda en el registro con su contexto (ver modulos/registro.js).
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    ESTADOS,
    TIPOS_ALERTA,
    TIEMPO_ALERTA_BLUETOOTH_MS,
    VENTANA_AGRUPAR_MS,
    MENSAJES_EN_ALERTA,
    TIEMPO_ALERTA_INDICADOR_MS,
    TIEMPO_ALERTA_ENERGIA_MS,
    TIEMPO_ALERTA_PORTAPAPELES_MS,
    TIEMPO_ALERTA_TEMPORIZADOR_MS,
    TIEMPO_ALERTA_MODO_MS,
    TIEMPO_ALERTA_CAPTURA_MS,
    TIEMPO_ALERTA_GRABACION_MS,
    TIEMPO_ALERTA_CRITICA_MS,
    ESTADOS_TEMPORIZADOR,
} from './modulos/constantes.js';
import {
    iniciarRegistro,
    detenerRegistro,
    registrarInfo,
    registrarAviso,
    registrarError,
    protegido,
    intentar,
    rutaRegistro,
} from './modulos/registro.js';
import {ControladorIsla} from './modulos/controlador.js';
import {MonitorBluetooth, EVENTOS_BLUETOOTH} from './modulos/servicios/bluetooth.js';
import {MonitorMultimedia} from './modulos/servicios/mpris.js';
import {CapturadorNotificaciones} from './modulos/servicios/notificaciones/capturador.js';
import {MonitorReloj} from './modulos/servicios/reloj.js';
import {MonitorAirPods} from './modulos/servicios/airpods/monitor.js';
import {CapturadorOsd} from './modulos/servicios/osd.js';
import {MonitorEnergia, EVENTOS_ENERGIA} from './modulos/servicios/energia.js';
import {Temporizador} from './modulos/servicios/temporizador.js';
import {MonitorPortapapeles} from './modulos/servicios/portapapeles.js';
import {MonitorPrivacidad} from './modulos/servicios/privacidad.js';
import {MonitorModos} from './modulos/servicios/modos.js';
import {MonitorCalendario} from './modulos/servicios/calendario.js';
import {MonitorGrabacion} from './modulos/servicios/grabacion.js';
import {MonitorLlamada} from './modulos/servicios/llamadas/monitorLlamada.js';
import {activarVentanaDeProceso} from './modulos/servicios/ventanas.js';
import {IslaUI} from './modulos/ui/isla.js';
import {configurarIconos, liberarIconos} from './modulos/ui/iconos.js';
import {
    configurarAjustes,
    liberarAjustes,
    alCambiarCualquierAjuste,
    dejarDeEscucharAjustes,
    ajuste,
    guardarAjuste,
    AJUSTES,
} from './modulos/ajustes.js';

export default class ExtensionIslaDinamica extends Extension {
    /** Se ejecuta cuando la extensión se activa (al iniciar sesión o al desbloquear). */
    enable() {
        iniciarRegistro();
        registrarInfo(`Activando extensión (registro de errores en ${rutaRegistro()})`, true);
        try {
            this._crearYConectar();
        } catch (error) {
            // Nunca dejar la isla a medio montar: se deshace todo y GNOME marca el error.
            registrarError('activación (enable)', error);
            this.disable();
            throw error;
        }
    }

    /**
     * Se ejecuta al desactivar la extensión o al bloquear la pantalla.
     * Libera todo en orden inverso a su creación.
     */
    disable() {
        registrarInfo('Desactivando extensión y liberando memoria...', true);

        intentar('desactivar llamadas', () => this._llamada?.destruir());
        this._llamada = null;

        intentar('desactivar grabación', () => this._grabacion?.destruir());
        this._grabacion = null;

        intentar('desactivar calendario', () => this._calendario?.destruir());
        this._calendario = null;

        intentar('desactivar modos', () => this._modos?.destruir());
        this._modos = null;

        intentar('desactivar privacidad', () => this._privacidad?.destruir());
        this._privacidad = null;

        intentar('desactivar portapapeles', () => this._portapapeles?.destruir());
        this._portapapeles = null;

        intentar('desactivar temporizador', () => this._temporizador?.destruir());
        this._temporizador = null;

        intentar('desactivar energía', () => this._energia?.destruir());
        this._energia = null;

        intentar('desactivar volumen/brillo', () => this._osd?.destruir());
        this._osd = null;

        intentar('desactivar reloj', () => this._reloj?.destruir());
        this._reloj = null;

        intentar('desactivar notificaciones', () => this._notificaciones?.destruir());
        this._notificaciones = null;
        this._conversaciones?.clear();

        intentar('desactivar airpods', () => {
            // Retirar el perfil de BlueZ es asíncrono; sus fallos también quedan registrados.
            this._airpods?.destruir().catch(error => registrarError('desactivar airpods', error));
        });
        this._airpods = null;

        intentar('desactivar bluetooth', () => this._bluetooth?.destruir());
        this._bluetooth = null;

        intentar('desactivar multimedia', () => this._multimedia?.destruir());
        this._multimedia = null;

        intentar('desactivar controlador', () => this._controlador?.destruir());
        this._controlador = null;

        intentar('desactivar interfaz', () => this._isla?.destruir());
        this._isla = null;

        intentar('liberar iconos', () => liberarIconos());
        intentar('liberar ajustes', () => {
            dejarDeEscucharAjustes(this);
            liberarAjustes();
        });
        detenerRegistro();
    }

    // ───────────────────────── Construcción ─────────────────────────

    _crearYConectar() {
        configurarIconos(this.path);
        // Opciones del usuario (ventana de ajustes). Se leen en el momento de usarlas.
        configurarAjustes(this.getSettings());

        // Capa 1: interfaz. Cada acción del usuario queda protegida y registrada si falla.
        this._isla = new IslaUI({
            abrirTarjeta: protegido('acción: abrir tarjeta', () => this._controlador?.establecerExpandido(true)),
            cerrarTarjeta: protegido('acción: cerrar tarjeta', () => this._controlador?.establecerExpandido(false)),
            descartarAlerta: protegido('acción: descartar alerta', clave => this._controlador?.descartarAlerta(clave)),
            mantenerAlerta: protegido('acción: mantener alerta', mantener => this._controlador?.mantenerAlerta(mantener)),
            abrirCalendario: protegido('acción: abrir calendario', () => {
                this._controlador?.establecerExpandido(false);
                this._isla?.abrirCalendarioGnome();
            }),
            capturas: {
                abrirCaptura: protegido('capturas: abrir la herramienta', () => this._grabacion?.abrirCaptura()),
                abrirGrabacion: protegido('capturas: grabar la pantalla', () => this._grabacion?.abrirGrabacion()),
                detenerGrabacion: protegido('capturas: detener la grabación', () => {
                    this._grabacion?.detener();
                    this._controlador?.establecerExpandido(false);
                }),
            },
            llamada: {
                mostrar: protegido('llamada: ir a la llamada', () => {
                    this._controlador?.establecerExpandido(false);
                    this._llamada?.mostrar();
                }),
                alternarSilencio: protegido('llamada: silenciar micrófono', () => this._llamada?.alternarSilencio()),
            },
            calendario: {
                abrir: protegido('calendario: abrir la app', () => this._abrirAppCalendario()),
                actualizar: protegido('calendario: pedir el mes actual', () => this._calendario?.pedirMesActual()),
            },
            multimedia: {
                alternar: protegido('multimedia: reproducir/pausa', () => this._multimedia?.activo?.alternarReproduccion()),
                siguiente: protegido('multimedia: siguiente', () => this._multimedia?.activo?.siguiente()),
                anterior: protegido('multimedia: anterior', () => this._multimedia?.activo?.anterior()),
                mostrarReproductor: protegido('multimedia: mostrar reproductor', () => {
                    this._controlador?.establecerExpandido(false);
                    this._mostrarReproductor(this._multimedia?.activo)
                        .catch(error => registrarError('multimedia: mostrar reproductor', error));
                }),
                obtenerPosicion: () => this._multimedia?.activo?.obtenerPosicion() ?? Promise.resolve(null),
                irAPosicion: protegido('multimedia: ir a posición', posicionUs => this._multimedia?.activo?.irAPosicion(posicionUs)),
            },
            // Audio de un chat (nota de voz): mismas acciones, sobre su propio reproductor. Sin anterior ni siguiente.
            audio: {
                alternar: protegido('audio: reproducir/pausa', () => this._multimedia?.activoAudio?.alternarReproduccion()),
                siguiente: () => {},
                anterior: () => {},
                mostrarReproductor: protegido('audio: ir al chat', () => {
                    this._controlador?.establecerExpandido(false);
                    this._mostrarReproductor(this._multimedia?.activoAudio)
                        .catch(error => registrarError('audio: ir al chat', error));
                }),
                obtenerPosicion: () => this._multimedia?.activoAudio?.obtenerPosicion() ?? Promise.resolve(null),
                irAPosicion: protegido('audio: ir a posición', posicionUs => this._multimedia?.activoAudio?.irAPosicion(posicionUs)),
            },
            mostrarLlamadaEntrante: protegido('llamada: volver a mostrar la que suena',
                () => this._controlador?.mostrarLlamadaEntrante()),
            establecerModoRuido: protegido('airpods: cambiar modo de ruido',
                (ruta, modo) => this._airpods?.establecerModoRuido(ruta, modo)),
            // Menú del clic derecho en la cápsula.
            establecerNoMolestar: protegido('menú: No molestar', activo => this._modos?.establecerNoMolestar(activo)),
            abrirAjustes: protegido('menú: abrir ajustes', () => this.openPreferences()),
            abrirRegistro: protegido('menú: abrir registro de errores', () => this._abrirRegistro()),
            notificaciones: {
                activar: protegido('notificaciones: abrir', id => {
                    this._buscarNotificacion(id)?.activar();
                    this._controlador?.quitarNotificacion(id);
                    this._controlador?.establecerExpandido(false);
                }),
                descartar: protegido('notificaciones: descartar', id => {
                    this._buscarNotificacion(id)?.descartar();
                    this._controlador?.quitarNotificacion(id);
                }),
                limpiar: protegido('notificaciones: borrar todas', () => {
                    for (const notificacion of [...(this._controlador?.notificacionesRecientes ?? [])])
                        notificacion.descartar();
                    this._controlador?.limpiarNotificaciones();
                }),
            },
            establecerActividadPreferida: protegido('acción: elegir actividad de la cápsula',
                actividad => this._controlador?.establecerActividadPreferida(actividad)),
            cambiarVistaCompacta: protegido('acción: cambiar vista de la cápsula',
                direccion => this._controlador?.cambiarVistaCompacta(direccion) ?? false, false),
            vistaVecina: protegido('acción: vista de al lado de la cápsula',
                direccion => this._controlador?.vistaVecina(direccion) ?? null, null),
            temporizador: {
                iniciar: protegido('temporizador: iniciar', ms => {
                    this._temporizador?.iniciar(ms);
                    // Las ruedas recordarán esta duración la próxima vez.
                    guardarAjuste(AJUSTES.ULTIMA_DURACION_TEMPORIZADOR_S, Math.round(ms / 1000));
                }),
                sumar: protegido('temporizador: sumar', ms => this._temporizador?.sumar(ms)),
                pausar: protegido('temporizador: pausar', () => this._temporizador?.pausar()),
                reanudar: protegido('temporizador: reanudar', () => this._temporizador?.reanudar()),
                cancelar: protegido('temporizador: cancelar', () => this._temporizador?.cancelar()),
            },
        });

        // Capa 2: controlador (máquina de estados).
        this._controlador = new ControladorIsla(this._isla);

        // Capa 3: servicios.
        this._multimedia = new MonitorMultimedia(
            protegido('multimedia → controlador', pista => this._controlador?.actualizarPista(pista)),
            protegido('audio → controlador', audio => this._controlador?.actualizarAudio(audio)));
        this._bluetooth = new MonitorBluetooth(
            protegido('bluetooth → controlador', (tipo, dispositivo) => this._alEventoBluetooth(tipo, dispositivo)));
        /** @type {Map<string, {cantidad: number, ultimoMs: number}>} chat → mensajes recientes */
        this._conversaciones = new Map();
        this._notificaciones = new CapturadorNotificaciones({
            alRecibir: protegido('notificación → controlador', (_id, datos) => this._alRecibirNotificacion(datos)),
            // Cerrada desde GNOME o por la app: sale de la lista de recientes. Si era una
            // llamada sonando, dejó de sonar (se contestó, se rechazó o colgó quien llamaba).
            alCerrar: protegido('notificación cerrada', id => {
                this._controlador?.quitarNotificacion(id);
                this._controlador?.quitarLlamadaEntrante(`llamada-${id}`);
            }),
        });
        this._reloj = new MonitorReloj(
            protegido('reloj → controlador', reloj => this._controlador?.actualizarReloj(reloj)));
        this._airpods = new MonitorAirPods(
            protegido('airpods → controlador', (ruta, estado) => this._alCambiarAirPods(ruta, estado)));
        this._osd = new CapturadorOsd(
            protegido('volumen/brillo → controlador', datos => this._alCambiarIndicador(datos)));
        this._energia = new MonitorEnergia(
            protegido('energía → controlador', (evento, datos) => this._alCambiarEnergia(evento, datos)));
        this._temporizador = new Temporizador(
            protegido('temporizador → controlador', resumen => this._alCambiarTemporizador(resumen)));
        this._portapapeles = new MonitorPortapapeles(
            protegido('portapapeles → controlador', datos => this._alCopiar(datos)));
        this._privacidad = new MonitorPrivacidad(
            protegido('privacidad → controlador', estado => this._controlador?.actualizarPrivacidad(estado)));
        this._grabacion = new MonitorGrabacion(
            protegido('grabación → controlador', estado => this._alCambiarGrabacion(estado)));
        this._llamada = new MonitorLlamada(
            protegido('llamada → controlador', estado => this._alCambiarLlamada(estado)));
        this._calendario = new MonitorCalendario(
            protegido('calendario → controlador', datos => this._controlador?.actualizarCalendario(datos)));
        this._modos = new MonitorModos(
            protegido('modos → controlador', (modo, activo, estado) => this._alCambiarModo(modo, activo, estado)));

        // Primero lo que puede fallar por API de GNOME, luego los servicios.
        this._isla.montar(this.uuid);
        this._controlador.actualizarPista(null);
        this._notificaciones.iniciar();
        this._reloj.iniciar();
        this._osd.iniciar();
        this._portapapeles.iniciar();
        this._privacidad.iniciar();
        this._calendario.iniciar();
        this._grabacion.iniciar();
        intentar('iniciar llamadas', () => this._llamada.iniciar());
        this._modos.iniciar()
            .then(() => this._controlador?.actualizarModos(this._modos.estado))
            .catch(error => registrarError('iniciar modos (No molestar, modo avión)', error));
        this._energia.iniciar().catch(error => registrarError('iniciar energía (UPower)', error));

        this._multimedia.iniciar().catch(error => registrarError('iniciar multimedia', error));
        // AirPods necesita a Bluetooth (para saber qué audífonos ya están conectados).
        const airpodsListo = this._airpods.iniciar()
            .catch(error => registrarError('iniciar airpods (perfil AAP)', error));
        this._bluetooth.iniciar()
            .then(() => this._refrescarDispositivos())
            .then(() => airpodsListo)
            .then(() => this._bluetooth?.dispositivosConectados.forEach(d => this._airpods?.vincular(d)))
            .catch(error => registrarError('iniciar bluetooth', error));

        // Cualquier cambio en la ventana de ajustes se ve al instante (sin cerrar sesión).
        alCambiarCualquierAjuste(protegido('ajustes: cambio', clave => {
            registrarInfo(`Ajuste cambiado: ${clave} = ${ajuste(clave)}`);
            this._controlador?.refrescar();
        }), this);

        registrarInfo('Extensión activa.', true);
    }

    // ───────────────────────── Eventos de los servicios ─────────────────────────

    /**
     * @param {string} tipo - Uno de EVENTOS_BLUETOOTH.
     * @param {object} dispositivo - {ruta, nombre, icono, bateria}
     */
    _alEventoBluetooth(tipo, dispositivo) {
        // Unos AirPods recién conectados: se abre su canal para leer batería y estuche.
        if (tipo === EVENTOS_BLUETOOTH.CONECTADO)
            this._airpods?.vincular(dispositivo);
        else if (tipo === EVENTOS_BLUETOOTH.DESCONECTADO)
            this._airpods?.desvincular(dispositivo.ruta);

        this._refrescarDispositivos();

        const clave = `bluetooth-${dispositivo.ruta}`;

        if (tipo === EVENTOS_BLUETOOTH.BATERIA) {
            // La batería suele llegar un instante después de conectar: se actualiza la alerta si sigue visible.
            this._controlador?.actualizarAlerta(clave, {bateria: dispositivo.bateria});
            return;
        }

        const conectado = tipo === EVENTOS_BLUETOOTH.CONECTADO;
        this._controlador?.agregarAlerta({
            tipo: TIPOS_ALERTA.BLUETOOTH,
            clave,
            duracionMs: TIEMPO_ALERTA_BLUETOOTH_MS,
            datos: {
                titulo: dispositivo.nombre,
                detalle: conectado ? 'Conectados' : 'Desconectados',
                bateria: dispositivo.bateria,
                airpods: this._airpods?.estado(dispositivo.ruta) ?? null,
                conectado,
            },
        });
    }

    /**
     * Llegaron datos de unos AirPods (batería por pieza, estuche, modo de ruido...).
     * @param {string} ruta
     * @param {object|null} estado
     */
    _alCambiarAirPods(ruta, estado) {
        this._refrescarDispositivos();
        // Si la alerta de conexión sigue a la vista, se completa con los tres anillos.
        this._controlador?.actualizarAlerta(`bluetooth-${ruta}`, {airpods: estado});
    }

    /**
     * Llega una notificación: se guarda en recientes y se muestra como alerta.
     * Los mensajes del mismo chat se agrupan en una sola alerta ("3 mensajes nuevos").
     * @param {object} datos - Datos del capturador.
     */
    _alRecibirNotificacion(datos) {
        // Avisos de la herramienta de captura de GNOME: tienen sus propias alertas.
        if (datos.deCapturas && ajuste(AJUSTES.AVISAR_CAPTURAS)) {
            this._alAvisarCaptura(datos);
            return;
        }

        // Una llamada sonando: alerta propia, con sus botones. No entra en las recientes.
        if (datos.llamada && ajuste(AJUSTES.AVISAR_LLAMADAS)) {
            this._alSonarLlamada(datos);
            return;
        }

        this._controlador?.registrarNotificacion(datos);

        const esChat = datos.aplicacion.esChat;
        const {cantidad, mensajes} = esChat
            ? this._contarMensaje(datos.claveConversacion, datos.detalle)
            : {cantidad: 1, mensajes: [datos.detalle]};
        this._controlador?.agregarAlerta({
            tipo: TIPOS_ALERTA.NOTIFICACION,
            // Misma clave = la alerta del chat se actualiza en lugar de crear otra.
            clave: esChat ? `chat-${datos.claveConversacion}` : datos.id,
            // Las críticas (batería agotándose...) se quedan más tiempo.
            duracionMs: datos.critica
                ? Math.max(TIEMPO_ALERTA_CRITICA_MS, ajuste(AJUSTES.DURACION_NOTIFICACIONES_MS))
                : ajuste(AJUSTES.DURACION_NOTIFICACIONES_MS),
            datos: {...datos, cantidad, mensajes},
        });
    }

    /**
     * Suena una llamada (WhatsApp, Meet, Telegram...). Se ve mientras el aviso exista (al
     * contestar o colgar, la app lo quita y alCerrar la quita): en la alerta o, si se
     * oculta, en el círculo.
     * El monitor de llamadas lo recuerda: si enseguida el navegador usa el micrófono,
     * es esta llamada.
     * @param {object} datos - Datos del capturador (con `llamada`).
     */
    _alSonarLlamada(datos) {
        const {id, nombre} = datos.aplicacion;
        this._llamada?.registrarLlamadaEntrante({id: id ?? nombre ?? 'llamada', nombre: nombre || 'Llamada'});
        // Si su alerta se oculta mientras suena, la llamada queda en el círculo.
        this._controlador?.registrarLlamadaEntrante({clave: `llamada-${datos.id}`, datos});
    }

    /**
     * Empieza, avanza un segundo, se silencia o termina una llamada.
     * @param {{enLlamada: boolean, id: string|null, nombre: string, transcurridoMs: number, silenciado: boolean}} estado
     */
    _alCambiarLlamada(estado) {
        const mostrar = ajuste(AJUSTES.AVISAR_LLAMADAS);
        this._controlador?.actualizarLlamada(mostrar ? estado : {...estado, enLlamada: false});
    }

    /**
     * Cuenta los mensajes de un chat llegados dentro de VENTANA_AGRUPAR_MS y
     * guarda los últimos textos para mostrarlos juntos en la alerta.
     * @param {string} claveConversacion
     * @param {string} texto - Texto del mensaje nuevo.
     * @returns {{cantidad: number, mensajes: string[]}}
     */
    _contarMensaje(claveConversacion, texto) {
        const ahora = Date.now();
        for (const [clave, info] of this._conversaciones) {
            if (ahora - info.ultimoMs > VENTANA_AGRUPAR_MS)
                this._conversaciones.delete(clave);
        }
        const previo = this._conversaciones.get(claveConversacion);
        const cantidad = (previo?.cantidad ?? 0) + 1;
        const mensajes = [...(previo?.mensajes ?? []), texto].filter(Boolean).slice(-MENSAJES_EN_ALERTA);
        this._conversaciones.set(claveConversacion, {cantidad, ultimoMs: ahora, mensajes});
        return {cantidad, mensajes};
    }

    // ───────────────────────── Volumen, energía, temporizador, copiado ─────────────────────────

    /**
     * Volumen o brillo cambió: indicador compacto. Cada pulsación reinicia su tiempo
     * (misma clave) y, si no puede mostrarse ya, se descarta (sin cola).
     * @param {object} datos - {tipo, gicon, nivel, maximo}
     * @returns {boolean} false si la isla no puede mostrarlo (se usa el recuadro de GNOME).
     */
    _alCambiarIndicador(datos) {
        // Desactivado en ajustes, o con la isla abierta (no hay sitio): recuadro de GNOME de siempre.
        if (!ajuste(AJUSTES.MOSTRAR_VOLUMEN_BRILLO) || !this._controlador ||
            this._controlador.estado === ESTADOS.EXPANDIDO)
            return false;
        this._controlador.agregarAlerta({
            tipo: TIPOS_ALERTA.INDICADOR,
            clave: `indicador-${datos.tipo}`,
            duracionMs: TIEMPO_ALERTA_INDICADOR_MS,
            sinCola: true,
            datos,
        });
        return true;
    }

    /**
     * @param {string} evento - Uno de EVENTOS_ENERGIA.
     * @param {object} datos - {porcentaje, cargando, llena, minutosRestantes}
     */
    _alCambiarEnergia(evento, datos) {
        if (!ajuste(AJUSTES.AVISAR_CARGADOR))
            return;
        this._controlador?.agregarAlerta({
            tipo: TIPOS_ALERTA.ENERGIA,
            clave: 'energia',
            duracionMs: TIEMPO_ALERTA_ENERGIA_MS,
            datos: {...datos, enchufado: evento === EVENTOS_ENERGIA.ENCHUFADO},
        });
    }

    /**
     * El temporizador cambió (cada segundo mientras corre).
     * Al terminar se muestra "¡Tiempo cumplido!"; al cancelarlo, ese aviso se quita.
     * @param {{estado: string, totalMs: number, restanteMs: number}} resumen
     */
    _alCambiarTemporizador(resumen) {
        this._controlador?.actualizarTemporizador(resumen);
        if (resumen.estado === ESTADOS_TEMPORIZADOR.TERMINADO) {
            this._controlador?.agregarAlerta({
                tipo: TIPOS_ALERTA.TEMPORIZADOR,
                clave: 'temporizador',
                duracionMs: TIEMPO_ALERTA_TEMPORIZADOR_MS,
                datos: resumen,
            });
        } else {
            this._controlador?.descartarAlerta('temporizador');
        }
    }

    /** @param {object} datos - {tipo, aplicacion} */
    _alCopiar(datos) {
        if (!ajuste(AJUSTES.AVISAR_COPIADO))
            return;
        this._controlador?.agregarAlerta({
            tipo: TIPOS_ALERTA.PORTAPAPELES,
            clave: 'portapapeles',
            duracionMs: TIEMPO_ALERTA_PORTAPAPELES_MS,
            sinCola: true,
            datos,
        });
    }

    /**
     * Se activó o desactivó "No molestar" o el modo avión.
     * @param {string} modo - Uno de MODOS.
     * @param {boolean} activo
     * @param {{noMolestar: boolean, avion: boolean}} estado
     */
    _alCambiarModo(modo, activo, estado) {
        this._controlador?.actualizarModos(estado);
        if (!ajuste(AJUSTES.AVISAR_MODOS))
            return;
        this._controlador?.agregarAlerta({
            tipo: TIPOS_ALERTA.MODO,
            clave: 'modo',
            duracionMs: TIEMPO_ALERTA_MODO_MS,
            sinCola: true,
            datos: {modo, activo},
        });
    }

    /**
     * La grabación empezó, avanzó un segundo o terminó. Con el ajuste desactivado,
     * la isla no la muestra (y GNOME sigue con su indicador de siempre).
     * @param {{grabando: boolean, transcurridoMs: number}} estado
     */
    _alCambiarGrabacion(estado) {
        const mostrar = ajuste(AJUSTES.AVISAR_CAPTURAS);
        this._controlador?.actualizarGrabacion(mostrar ? estado : {grabando: false, transcurridoMs: 0});
    }

    /**
     * Aviso de la herramienta de captura: con imagen = captura hecha; sin imagen =
     * grabación terminada (o fallida: el título lo dice GNOME). Al tocarlo se abre
     * el archivo, como en la notificación de GNOME. No entra en las recientes.
     * @param {object} datos - Datos de la notificación (deCapturas: true).
     */
    _alAvisarCaptura(datos) {
        if (datos.miniatura) {
            this._controlador?.agregarAlerta({
                tipo: TIPOS_ALERTA.CAPTURA,
                clave: 'captura',
                duracionMs: TIEMPO_ALERTA_CAPTURA_MS,
                datos: {miniatura: datos.miniatura, activar: datos.activar},
            });
            return;
        }
        this._controlador?.agregarAlerta({
            tipo: TIPOS_ALERTA.GRABACION,
            clave: 'grabacion',
            duracionMs: TIEMPO_ALERTA_GRABACION_MS,
            datos: {
                titulo: datos.titulo,
                detalle: datos.detalle,
                duracionMs: this._grabacion?.ultimaDuracionMs ?? 0,
                activar: datos.activar,
            },
        });
    }

    /**
     * Lleva a donde suena la música (o el audio). Si el reproductor acepta Raise (Spotify,
     * VLC...), se lo pide; si no (Brave), se busca su ventana por el proceso dueño del
     * reproductor, prefiriendo la que muestra la canción (o la de la app del audio).
     * @param {object|null} reproductor - El de la música o el del audio.
     */
    async _mostrarReproductor(reproductor) {
        if (!reproductor)
            return;
        if (reproductor.puedeTraer) {
            reproductor.mostrarVentana();
            return;
        }
        const pid = await reproductor.obtenerPid();
        // Con un audio de chat, el título es la web ("web.whatsapp.com"): se busca la ventana
        // por el nombre de la app ("WhatsApp"), que es el título de su ventana.
        const {titulo, aplicacion, appAudio} = reproductor.obtenerPista();
        if (!pid || !activarVentanaDeProceso({pid, titulo: appAudio?.nombre ?? titulo}))
            registrarAviso(`Multimedia: no se encontró la ventana de ${aplicacion}.`);
    }

    /** Abre la app Calendario de GNOME; si no está instalada, el calendario del panel. */
    _abrirAppCalendario() {
        this._controlador?.establecerExpandido(false);
        const app = Shell.AppSystem.get_default().lookup_app('org.gnome.Calendar.desktop');
        if (app)
            app.activate();
        else
            this._isla?.abrirCalendarioGnome();
    }

    /** Abre el registro de errores con el editor de texto predeterminado. */
    _abrirRegistro() {
        const ruta = rutaRegistro();
        if (!GLib.file_test(ruta, GLib.FileTest.EXISTS)) {
            registrarAviso('El registro de errores todavía no existe: no hay nada que mostrar.');
            return;
        }
        Gio.AppInfo.launch_default_for_uri(GLib.filename_to_uri(ruta, null), null);
    }

    _buscarNotificacion(id) {
        return this._controlador?.notificacionesRecientes.find(n => n.id === id) ?? null;
    }

    /** Envía al controlador los audífonos conectados, con el detalle AirPods si lo hay. */
    _refrescarDispositivos() {
        if (!this._bluetooth)
            return;
        const dispositivos = this._bluetooth.dispositivosConectados.map(dispositivo => ({
            ...dispositivo,
            airpods: this._airpods?.estado(dispositivo.ruta) ?? null,
        }));
        this._controlador?.actualizarDispositivos(dispositivos);
    }
}

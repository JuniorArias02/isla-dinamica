// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * MonitorMultimedia — Capa 3 (servicio MPRIS2).
 *
 * Descubre los reproductores del bus de sesión (Brave, Spotify, VLC...)
 * mediante NameOwnerChanged, escucha sus cambios de PlaybackStatus y
 * Metadata, y decide cuál es el "reproductor activo":
 *   1. El último que empezó a sonar.
 *   2. Si ninguno suena, el último que tuvo actividad (queda en pausa).
 *
 * Al pasar de canción, Brave vacía los datos de la pista un momento. Mientras el
 * reproductor siga abierto, se entrega la pista con `cargando: true` (hasta
 * TIEMPO_ESPERA_PISTA_MS) en lugar de null: la isla muestra un esqueleto y no
 * pierde la página de música.
 *
 * También expone los comandos PlayPause / Next / Previous / Raise.
 *
 * Cada pista dice si es música o un audio de un chat (`tipo`, ver reconocedorAudio):
 * un audio de WhatsApp Web llega de Brave con la web como título y sin artista.
 * Son dos cosas distintas para la isla: la música va por `alCambiarPista` (reproductor
 * `activo`) y el audio de chat por `alCambiarAudio` (reproductor `activoAudio`).
 *
 * La música lleva también el color dominante de su carátula (`colorPortada`, ver
 * colorPortada.js): llega un instante después, cuando termina de leerse la imagen.
 * Al pasar de canción, el navegador publica un momento su logo en lugar de la
 * portada: ese logo no se muestra ni da color, y mientras tanto se mantiene el color
 * de la canción anterior (así el cambio va de un color al otro, sin saltos).
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {TIEMPO_ESPERA_PISTA_MS, TIPOS_PISTA} from '../constantes.js';
import {registrarInfo, registrarAviso, registrarError, protegido} from '../registro.js';
import {clasificarAudio} from './reconocedorAudio.js';
import {ExtractorColor} from './colorPortada.js';

const PREFIJO_MPRIS = 'org.mpris.MediaPlayer2';
const RUTA_MPRIS = '/org/mpris/MediaPlayer2';
const INTERFAZ_REPRODUCTOR = 'org.mpris.MediaPlayer2.Player';

const XML_REPRODUCTOR = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="PlayPause"/>
    <method name="Next"/>
    <method name="Previous"/>
    <method name="SetPosition">
      <arg type="o" name="TrackId" direction="in"/>
      <arg type="x" name="Position" direction="in"/>
    </method>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <signal name="Seeked"><arg type="x" name="Position"/></signal>
  </interface>
</node>`;

const XML_RAIZ = `
<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <property name="Identity" type="s" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
    <property name="CanRaise" type="b" access="read"/>
  </interface>
</node>`;

const ProxyReproductor = Gio.DBusProxy.makeProxyWrapper(XML_REPRODUCTOR);
const ProxyRaiz = Gio.DBusProxy.makeProxyWrapper(XML_RAIZ);

/**
 * Crea un proxy de forma asíncrona y lo devuelve en una promesa.
 * @returns {Promise<Gio.DBusProxy>}
 */
function crearProxy(Envoltorio, nombreBus, cancelable) {
    return new Promise((resolver, rechazar) => {
        Envoltorio(Gio.DBus.session, nombreBus, RUTA_MPRIS, (proxy, error) => {
            if (error)
                rechazar(error);
            else
                resolver(proxy);
        }, cancelable);
    });
}

/**
 * Representa un reproductor MPRIS concreto (por ejemplo una pestaña de Brave).
 */
class Reproductor {
    /**
     * @param {string} nombreBus - Nombre en el bus (org.mpris.MediaPlayer2.brave.instance123).
     * @param {Function} alCambiar - Se llama cuando cambian estado o metadatos.
     */
    constructor(nombreBus, alCambiar) {
        this.nombreBus = nombreBus;
        this.ultimaActividad = 0;
        this._alCambiar = alCambiar;
        this._cancelable = new Gio.Cancellable();
        this._proxy = null;
        this._raiz = null;
        this._idPropiedades = 0;
    }

    /** Crea los proxies D-Bus y empieza a escuchar PropertiesChanged. */
    async iniciar() {
        // Servicio org.mpris.MediaPlayer2.* · interfaz org.mpris.MediaPlayer2.Player
        this._proxy = await crearProxy(ProxyReproductor, this.nombreBus, this._cancelable);
        // Servicio org.mpris.MediaPlayer2.* · interfaz org.mpris.MediaPlayer2 (nombre de la app, Raise)
        this._raiz = await crearProxy(ProxyRaiz, this.nombreBus, this._cancelable);

        // Señal org.freedesktop.DBus.Properties.PropertiesChanged (expuesta como g-properties-changed)
        this._idPropiedades = this._proxy.connect('g-properties-changed',
            protegido(`multimedia: PropertiesChanged de ${this.nombreBus}`, (_proxy, cambios) => {
                const cambiosPlanos = cambios.deepUnpack();
                if ('PlaybackStatus' in cambiosPlanos && this.reproduciendo)
                    this.ultimaActividad = GLib.get_monotonic_time();
                this._alCambiar?.(this);
            }));

        if (this.reproduciendo)
            this.ultimaActividad = GLib.get_monotonic_time();
    }

    /** @returns {boolean} true si el reproductor está sonando. */
    get reproduciendo() {
        return this._proxy?.PlaybackStatus === 'Playing';
    }

    /** @returns {boolean} true si el reproductor tiene algo cargado (título). */
    get tienePista() {
        return Boolean(this._leerMetadatos()['xesam:title']);
    }

    /**
     * Devuelve los datos normalizados de la pista para la interfaz.
     * @returns {object}
     */
    obtenerPista() {
        const metadatos = this._leerMetadatos();
        const artistas = metadatos['xesam:artist'];
        const titulo = metadatos['xesam:title'] || 'Sin título';
        const artista = Array.isArray(artistas) ? artistas.filter(Boolean).join(', ') : (artistas ?? '');
        // Un audio de chat trae como imagen el logo del navegador: no se usa (la isla pone el de la app).
        const {tipo, app: appAudio} = clasificarAudio({titulo, artista});
        const urlCaratula = appAudio ? '' : metadatos['mpris:artUrl'] ?? '';

        return {
            nombreBus: this.nombreBus,
            aplicacion: this._raiz?.Identity || this._nombreCorto(),
            entradaEscritorio: this._raiz?.DesktopEntry || null,
            titulo,
            artista,
            // Música o audio de un chat (TIPOS_PISTA), y de qué chat: {id, nombre, entradasEscritorio}.
            tipo,
            appAudio,
            album: metadatos['xesam:album'] ?? '',
            // Solo se usan carátulas locales: las remotas (http) requerirían descargas dentro del Shell.
            urlCaratula: urlCaratula.startsWith('file://') ? urlCaratula : null,
            duracionUs: Number(metadatos['mpris:length'] ?? 0),
            reproduciendo: this.reproduciendo,
            puedeSiguiente: this._proxy?.CanGoNext ?? false,
            puedeAnterior: this._proxy?.CanGoPrevious ?? false,
            puedeAlternar: (this._proxy?.CanPlay || this._proxy?.CanPause) ?? false,
            // Siempre: si no acepta Raise (Brave), la isla busca su ventana por el proceso.
            puedeMostrar: true,
            // Saltar a un punto de la canción (clic en la barra de progreso).
            puedeBuscar: Boolean(this._proxy?.CanSeek && metadatos['mpris:trackid'] && metadatos['mpris:length']),
        };
    }

    /**
     * Consulta la posición actual. MPRIS no emite cambios de Position,
     * por eso se pide explícitamente (solo mientras la tarjeta está abierta).
     * @returns {Promise<number>} Posición en microsegundos.
     */
    async obtenerPosicion() {
        // Servicio org.mpris.MediaPlayer2.* · interfaz org.freedesktop.DBus.Properties · método Get
        const respuesta = await Gio.DBus.session.call(
            this.nombreBus, RUTA_MPRIS, 'org.freedesktop.DBus.Properties', 'Get',
            new GLib.Variant('(ss)', [INTERFAZ_REPRODUCTOR, 'Position']),
            new GLib.VariantType('(v)'), Gio.DBusCallFlags.NONE, 1000, this._cancelable);
        const [posicion] = respuesta.recursiveUnpack();
        return Number(posicion);
    }

    /** Método org.mpris.MediaPlayer2.Player.PlayPause */
    alternarReproduccion() {
        this._proxy?.PlayPauseAsync().catch(e => this._registrarError('PlayPause', e));
    }

    /** Método org.mpris.MediaPlayer2.Player.Next */
    siguiente() {
        this._proxy?.NextAsync().catch(e => this._registrarError('Next', e));
    }

    /** Método org.mpris.MediaPlayer2.Player.Previous */
    anterior() {
        this._proxy?.PreviousAsync().catch(e => this._registrarError('Previous', e));
    }

    /**
     * Método org.mpris.MediaPlayer2.Player.SetPosition: salta a un punto de la pista actual.
     * @param {number} posicionUs - Posición en microsegundos.
     */
    irAPosicion(posicionUs) {
        const idPista = this._leerMetadatos()['mpris:trackid'];
        if (!idPista)
            return;
        this._proxy?.SetPositionAsync(idPista, Math.max(0, Math.round(posicionUs)))
            .catch(e => this._registrarError('SetPosition', e));
    }

    /** Método org.mpris.MediaPlayer2.Raise (trae la ventana del reproductor al frente) */
    /** @returns {boolean} true si el reproductor acepta que lo traigan al frente (Raise). */
    get puedeTraer() {
        return Boolean(this._raiz?.CanRaise);
    }

    /** Trae al frente la ventana del reproductor (solo si puedeTraer). */
    mostrarVentana() {
        this._raiz?.RaiseAsync().catch(e => this._registrarError('Raise', e));
    }

    /**
     * Proceso dueño del reproductor en el bus (para buscar su ventana si no acepta Raise).
     * @returns {Promise<number|null>}
     */
    async obtenerPid() {
        try {
            // Servicio org.freedesktop.DBus · método GetConnectionUnixProcessID
            const respuesta = await Gio.DBus.session.call(
                'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
                'GetConnectionUnixProcessID', new GLib.Variant('(s)', [this.nombreBus]),
                new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, -1, this._cancelable);
            return respuesta.deepUnpack()[0];
        } catch (error) {
            this._registrarError('GetConnectionUnixProcessID', error);
            return null;
        }
    }

    destruir() {
        this._cancelable.cancel();
        if (this._proxy && this._idPropiedades)
            this._proxy.disconnect(this._idPropiedades);
        this._idPropiedades = 0;
        this._proxy = null;
        this._raiz = null;
        this._alCambiar = null;
    }

    _leerMetadatos() {
        return this._proxy?.get_cached_property('Metadata')?.recursiveUnpack() ?? {};
    }

    _nombreCorto() {
        // org.mpris.MediaPlayer2.spotify → spotify
        const parte = this.nombreBus.slice(PREFIJO_MPRIS.length + 1).split('.')[0];
        return parte.charAt(0).toUpperCase() + parte.slice(1);
    }

    _registrarError(metodo, error) {
        registrarAviso(`${this.nombreBus} no respondió a ${metodo}: ${error.message}`);
    }
}

export class MonitorMultimedia {
    /**
     * @param {Function} alCambiarPista - Recibe la música activa normalizada, o null.
     * @param {Function} [alCambiarAudio] - Recibe el audio de chat que suena (nota de voz), o null.
     * @param {object} [opciones]
     * @param {Function} [opciones.cargarIcono] - Icono de un reproductor (iconoApp.js), para
     *   reconocer el logo que publica el navegador en lugar de la portada.
     */
    constructor(alCambiarPista, alCambiarAudio = null, {cargarIcono = null} = {}) {
        this._alCambiarPista = alCambiarPista;
        this._alCambiarAudio = alCambiarAudio;
        // Cuando termina de leerse el color de una carátula, se vuelve a avisar la pista.
        this._colores = new ExtractorColor({alListo: () => this._programarActualizacion(), cargarIcono});
        /** Último color de portada conocido (se mantiene mientras llega el siguiente). */
        this._ultimoColor = null;
        /** Reproductor del audio de chat (en Brave suele ser el mismo que el de la música). */
        this._activoAudio = null;
        this._cancelable = new Gio.Cancellable();
        this._idNombres = 0;
        this._idActualizacion = 0;

        /** @type {Map<string, Reproductor>} */
        this._reproductores = new Map();
        this._activo = null;

        /** Última pista con datos (base del estado "cargando"). */
        this._ultimaPista = null;
        /** Temporizador de una sola vez: espera a la canción siguiente (TIEMPO_ESPERA_PISTA_MS). */
        this._idEspera = 0;
    }

    /** Lista los reproductores existentes y escucha la aparición de nuevos. */
    async iniciar() {
        // Servicio org.freedesktop.DBus · señal NameOwnerChanged (solo nombres org.mpris.MediaPlayer2.*)
        this._idNombres = Gio.DBus.session.signal_subscribe(
            'org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
            '/org/freedesktop/DBus', PREFIJO_MPRIS, Gio.DBusSignalFlags.MATCH_ARG0_NAMESPACE,
            protegido('multimedia: NameOwnerChanged', (_c, _e, _r, _i, _s, parametros) => {
                const [nombre, anterior, nuevo] = parametros.deepUnpack();
                if (anterior)
                    this._quitarReproductor(nombre);
                if (nuevo)
                    this._agregarReproductor(nombre);
            }));

        try {
            // Servicio org.freedesktop.DBus · método ListNames
            const respuesta = await Gio.DBus.session.call(
                'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames',
                null, new GLib.VariantType('(as)'), Gio.DBusCallFlags.NONE, -1, this._cancelable);
            const [nombres] = respuesta.deepUnpack();
            nombres.filter(n => n.startsWith(`${PREFIJO_MPRIS}.`))
                .forEach(n => this._agregarReproductor(n));
        } catch (error) {
            if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                registrarAviso(`No se pudieron listar los reproductores: ${error.message}`);
        }
    }

    /** @returns {Reproductor|null} Reproductor de la música que se muestra en la isla. */
    get activo() {
        return this._activo;
    }

    /** @returns {Reproductor|null} Reproductor del audio de chat (nota de voz), si suena uno. */
    get activoAudio() {
        return this._activoAudio;
    }

    destruir() {
        this._cancelable.cancel();
        if (this._idNombres)
            Gio.DBus.session.signal_unsubscribe(this._idNombres);
        this._idNombres = 0;
        if (this._idActualizacion)
            GLib.source_remove(this._idActualizacion);
        this._idActualizacion = 0;
        this._cancelarEspera();
        for (const reproductor of this._reproductores.values())
            reproductor.destruir();
        this._reproductores.clear();
        this._activo = null;
        this._activoAudio = null;
        this._colores.destruir();
        this._alCambiarPista = null;
        this._alCambiarAudio = null;
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    async _agregarReproductor(nombreBus) {
        if (this._reproductores.has(nombreBus))
            return;

        const reproductor = new Reproductor(nombreBus, () => this._programarActualizacion());
        this._reproductores.set(nombreBus, reproductor);

        try {
            await reproductor.iniciar();
            registrarInfo(`Reproductor detectado: ${nombreBus}`);
            this._programarActualizacion();
        } catch (error) {
            if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                registrarAviso(`No se pudo conectar con ${nombreBus}: ${error.message}`);
            if (this._reproductores.get(nombreBus) === reproductor) {
                this._reproductores.delete(nombreBus);
                reproductor.destruir();
            }
        }
    }

    _quitarReproductor(nombreBus) {
        const reproductor = this._reproductores.get(nombreBus);
        if (!reproductor)
            return;

        this._reproductores.delete(nombreBus);
        reproductor.destruir();
        registrarInfo(`Reproductor cerrado: ${nombreBus}`);
        this._programarActualizacion();
    }

    /**
     * Agrupa varios cambios seguidos (Brave suele enviar varios PropertiesChanged
     * juntos) en una sola actualización de la interfaz.
     */
    _programarActualizacion() {
        if (this._idActualizacion)
            return;

        this._idActualizacion = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idActualizacion = 0;
            try {
                this._actualizarActivo();
            } catch (error) {
                registrarError('multimedia: elegir reproductor activo', error);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _actualizarActivo() {
        const conPista = [...this._reproductores.values()]
            .filter(r => r.tienePista)
            .map(reproductor => ({reproductor, pista: reproductor.obtenerPista()}));
        const esAudio = ({pista}) => pista.tipo === TIPOS_PISTA.AUDIO;

        this._actualizarAudio(this._elegir(conPista.filter(esAudio)));

        const elegidoMusica = this._elegir(conPista.filter(candidato => !esAudio(candidato)));
        const elegido = elegidoMusica?.reproductor ?? null;

        // Cambio de canción: el reproductor activo sigue existiendo pero vació sus datos
        // mientras carga la siguiente. No es el fin de la música: se avisa "cargando".
        const anterior = this._activo;
        const sigueAbierto = anterior && this._reproductores.get(anterior.nombreBus) === anterior;
        if (!elegido && sigueAbierto && !anterior.tienePista && this._ultimaPista) {
            this._esperarSiguientePista();
            return;
        }

        // Brave publica una sola cosa a la vez: si su reproductor pasó de la canción a un
        // audio de chat, la canción no terminó, solo dejó de anunciarse. Se conserva (en
        // espera y sin controles, que ahora irían al audio) hasta que el audio termine y
        // Brave vuelva a anunciarla.
        const pasoAUnAudio = !elegido && sigueAbierto && anterior === this._activoAudio && this._ultimaPista;
        if (pasoAUnAudio) {
            this._cancelarEspera();
            this._emitir({
                ...this._ultimaPista,
                enEspera: true,
                reproduciendo: false,
                puedeAlternar: false,
                puedeSiguiente: false,
                puedeAnterior: false,
                puedeBuscar: false,
            });
            return;
        }

        this._cancelarEspera();
        this._activo = elegido;
        this._ultimaPista = this._conColor(elegidoMusica?.pista ?? null);
        this._emitir(this._ultimaPista);
    }

    /**
     * Añade a la pista el color de su carátula (null hasta que se conozca).
     * @param {object|null} pista
     * @returns {object|null}
     */
    _conColor(pista) {
        // Sin música, no hay color que mantener para la siguiente.
        if (!pista) {
            this._ultimoColor = null;
            return null;
        }
        const {color, relleno, pendiente} = this._colores.infoDe(pista.urlCaratula, pista.entradaEscritorio);
        // Portada real ya leída (o ninguna): su color, y queda como último conocido.
        if (!relleno && !pendiente) {
            this._ultimoColor = color;
            return {...pista, colorPortada: color};
        }
        // Leyéndose, o el logo del navegador: se mantiene el color anterior. El logo no
        // se muestra como carátula (no es la de la canción).
        return {...pista, colorPortada: this._ultimoColor, urlCaratula: relleno ? null : pista.urlCaratula};
    }

    /**
     * El que está sonando; si ninguno suena, el último con actividad (queda en pausa).
     * @param {Array<{reproductor: Reproductor, pista: object}>} candidatos
     * @returns {{reproductor: Reproductor, pista: object}|null}
     */
    _elegir(candidatos) {
        const porActividad = (a, b) => b.reproductor.ultimaActividad - a.reproductor.ultimaActividad;
        const sonando = candidatos.filter(c => c.reproductor.reproduciendo).sort(porActividad);
        const enPausa = candidatos.filter(c => !c.reproductor.reproduciendo).sort(porActividad);
        return sonando[0] ?? enPausa[0] ?? null;
    }

    /**
     * Audio de chat: no tiene espera de "cargando" (al terminar, se quita).
     * @param {{reproductor: Reproductor, pista: object}|null} elegido
     */
    _actualizarAudio(elegido) {
        this._activoAudio = elegido?.reproductor ?? null;
        try {
            this._alCambiarAudio?.(elegido?.pista ?? null);
        } catch (error) {
            registrarError('multimedia: procesar audio', error);
        }
    }

    /**
     * Emite la pista "cargando" (los datos de la app y los controles siguen; título y
     * portada no) y programa el final de la espera. Si la canción nueva no llega a
     * tiempo, la música se da por terminada.
     */
    _esperarSiguientePista() {
        if (!this._idEspera) {
            this._idEspera = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIEMPO_ESPERA_PISTA_MS, () => {
                this._idEspera = 0;
                protegido('multimedia: fin de la espera de la siguiente pista', () => {
                    this._activo = null;
                    this._ultimaPista = null;
                    this._actualizarActivo();
                })();
                return GLib.SOURCE_REMOVE;
            });
        }
        this._emitir({
            ...this._ultimaPista,
            cargando: true,
            // Sigue "sonando": la cápsula no debe saltar a la hora durante el cambio.
            reproduciendo: true,
            urlCaratula: null,
            duracionUs: 0,
            puedeBuscar: false,
        });
    }

    _cancelarEspera() {
        if (this._idEspera) {
            GLib.source_remove(this._idEspera);
            this._idEspera = 0;
        }
    }

    _emitir(pista) {
        try {
            this._alCambiarPista?.(pista);
        } catch (error) {
            registrarError('multimedia: procesar pista', error);
        }
    }
}

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
 * También expone los comandos PlayPause / Next / Previous / Raise.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {registrarInfo, registrarAviso, registrarError, protegido} from '../registro.js';

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
        const urlCaratula = metadatos['mpris:artUrl'] ?? '';

        return {
            nombreBus: this.nombreBus,
            aplicacion: this._raiz?.Identity || this._nombreCorto(),
            entradaEscritorio: this._raiz?.DesktopEntry || null,
            titulo: metadatos['xesam:title'] || 'Sin título',
            artista: Array.isArray(artistas) ? artistas.filter(Boolean).join(', ') : (artistas ?? ''),
            album: metadatos['xesam:album'] ?? '',
            // Solo se usan carátulas locales: las remotas (http) requerirían descargas dentro del Shell.
            urlCaratula: urlCaratula.startsWith('file://') ? urlCaratula : null,
            duracionUs: Number(metadatos['mpris:length'] ?? 0),
            reproduciendo: this.reproduciendo,
            puedeSiguiente: this._proxy?.CanGoNext ?? false,
            puedeAnterior: this._proxy?.CanGoPrevious ?? false,
            puedeAlternar: (this._proxy?.CanPlay || this._proxy?.CanPause) ?? false,
            puedeMostrar: this._raiz?.CanRaise ?? false,
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
    mostrarVentana() {
        this._raiz?.RaiseAsync().catch(e => this._registrarError('Raise', e));
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
     * @param {Function} alCambiarPista - Recibe la pista activa normalizada, o null.
     */
    constructor(alCambiarPista) {
        this._alCambiarPista = alCambiarPista;
        this._cancelable = new Gio.Cancellable();
        this._idNombres = 0;
        this._idActualizacion = 0;

        /** @type {Map<string, Reproductor>} */
        this._reproductores = new Map();
        this._activo = null;
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

    /** @returns {Reproductor|null} Reproductor que se muestra en la isla. */
    get activo() {
        return this._activo;
    }

    destruir() {
        this._cancelable.cancel();
        if (this._idNombres)
            Gio.DBus.session.signal_unsubscribe(this._idNombres);
        this._idNombres = 0;
        if (this._idActualizacion)
            GLib.source_remove(this._idActualizacion);
        this._idActualizacion = 0;
        for (const reproductor of this._reproductores.values())
            reproductor.destruir();
        this._reproductores.clear();
        this._activo = null;
        this._alCambiarPista = null;
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
        const candidatos = [...this._reproductores.values()].filter(r => r.tienePista);
        const porActividad = (a, b) => b.ultimaActividad - a.ultimaActividad;

        const sonando = candidatos.filter(r => r.reproduciendo).sort(porActividad);
        const enPausa = candidatos.filter(r => !r.reproduciendo).sort(porActividad);

        this._activo = sonando[0] ?? enPausa[0] ?? null;

        try {
            this._alCambiarPista?.(this._activo?.obtenerPista() ?? null);
        } catch (error) {
            registrarError('multimedia: procesar pista', error);
        }
    }
}

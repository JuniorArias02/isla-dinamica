/**
 * MonitorBluetooth — Capa 3 (servicio Bluetooth).
 *
 * Escucha a BlueZ en el bus de sistema y avisa cuando un dispositivo de
 * audio (AirPods, auriculares, parlantes) se conecta, se desconecta o
 * cambia su nivel de batería. No usa sondeo: todo llega por señales D-Bus.
 *
 * Objetos de BlueZ que se leen:
 *   - org.bluez.Device1   → Name, Alias, Icon, Connected
 *   - org.bluez.Battery1  → Percentage (0–100), puede aparecer segundos después de conectar
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {registrarInfo, registrarAviso, registrarError, protegido} from '../registro.js';

const SERVICIO_BLUEZ = 'org.bluez';
const INTERFAZ_DISPOSITIVO = 'org.bluez.Device1';
const INTERFAZ_BATERIA = 'org.bluez.Battery1';
const INTERFAZ_PROPIEDADES = 'org.freedesktop.DBus.Properties';
const INTERFAZ_GESTOR_OBJETOS = 'org.freedesktop.DBus.ObjectManager';

/** Nombres típicos de dispositivos de audio cuando BlueZ no informa un icono de audio. */
const PATRON_NOMBRE_AUDIO = /airpods|buds|headphone|headset|auricular|audífono|audifono|beats/i;

/**
 * Tipos de evento que emite el monitor.
 * @enum {string}
 */
export const EVENTOS_BLUETOOTH = Object.freeze({
    CONECTADO: 'conectado',
    DESCONECTADO: 'desconectado',
    BATERIA: 'bateria',
});

export class MonitorBluetooth {
    /**
     * @param {Function} alEvento - Recibe `(tipoEvento, dispositivo)`, donde
     *   dispositivo = {ruta, nombre, icono, bateria}.
     */
    constructor(alEvento) {
        this._alEvento = alEvento;
        this._conexion = null;
        this._cancelable = new Gio.Cancellable();
        this._idsSuscripciones = [];

        /** @type {Map<string, object>} Ruta D-Bus → datos del dispositivo. */
        this._dispositivos = new Map();
    }

    /**
     * Se conecta al bus de sistema, lee el estado inicial y empieza a escuchar.
     * Los dispositivos que ya estaban conectados no generan alerta.
     */
    async iniciar() {
        this._conexion = Gio.DBus.system;

        // Servicio org.bluez · interfaz org.freedesktop.DBus.Properties · señal PropertiesChanged
        this._idsSuscripciones.push(this._conexion.signal_subscribe(
            SERVICIO_BLUEZ, INTERFAZ_PROPIEDADES, 'PropertiesChanged',
            null, null, Gio.DBusSignalFlags.NONE,
            protegido('bluetooth: PropertiesChanged', this._alCambiarPropiedades.bind(this))));

        // Servicio org.bluez · interfaz ObjectManager · señal InterfacesAdded
        this._idsSuscripciones.push(this._conexion.signal_subscribe(
            SERVICIO_BLUEZ, INTERFAZ_GESTOR_OBJETOS, 'InterfacesAdded',
            '/', null, Gio.DBusSignalFlags.NONE,
            protegido('bluetooth: InterfacesAdded', this._alAgregarInterfaces.bind(this))));

        // Servicio org.bluez · interfaz ObjectManager · señal InterfacesRemoved
        this._idsSuscripciones.push(this._conexion.signal_subscribe(
            SERVICIO_BLUEZ, INTERFAZ_GESTOR_OBJETOS, 'InterfacesRemoved',
            '/', null, Gio.DBusSignalFlags.NONE,
            protegido('bluetooth: InterfacesRemoved', this._alQuitarInterfaces.bind(this))));

        try {
            // Servicio org.bluez · interfaz ObjectManager · método GetManagedObjects
            const respuesta = await this._conexion.call(
                SERVICIO_BLUEZ, '/', INTERFAZ_GESTOR_OBJETOS, 'GetManagedObjects',
                null, new GLib.VariantType('(a{oa{sa{sv}}})'),
                Gio.DBusCallFlags.NONE, -1, this._cancelable);

            const [objetos] = respuesta.recursiveUnpack();
            for (const [ruta, interfaces] of Object.entries(objetos))
                this._registrarInterfaces(ruta, interfaces, false);

            registrarInfo(`Bluetooth listo: ${this.dispositivosConectados.length} dispositivo(s) de audio conectado(s).`);
        } catch (error) {
            if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                registrarAviso(`No se pudo leer BlueZ (¿Bluetooth apagado?): ${error.message}`);
        }
    }

    /** @returns {object[]} Dispositivos de audio conectados en este momento. */
    get dispositivosConectados() {
        return [...this._dispositivos.values()]
            .filter(d => d.conectado && this._esAudio(d))
            .map(d => this._resumen(d));
    }

    /** Cancela las llamadas pendientes y cancela todas las suscripciones D-Bus. */
    destruir() {
        this._cancelable.cancel();
        if (this._conexion) {
            for (const id of this._idsSuscripciones)
                this._conexion.signal_unsubscribe(id);
        }
        this._idsSuscripciones = [];
        this._dispositivos.clear();
        this._conexion = null;
        this._alEvento = null;
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    /**
     * Guarda las interfaces de un objeto BlueZ.
     * @param {string} ruta - Ruta del objeto (ej. /org/bluez/hci0/dev_XX).
     * @param {object} interfaces - Mapa interfaz → propiedades ya desempaquetadas.
     * @param {boolean} notificar - Si debe emitir eventos (false durante la carga inicial).
     */
    _registrarInterfaces(ruta, interfaces, notificar) {
        const propiedadesDispositivo = interfaces[INTERFAZ_DISPOSITIVO];
        if (propiedadesDispositivo) {
            const dispositivo = this._obtenerDispositivo(ruta);
            this._aplicarPropiedadesDispositivo(dispositivo, propiedadesDispositivo, notificar);
        }

        const propiedadesBateria = interfaces[INTERFAZ_BATERIA];
        if (propiedadesBateria)
            this._aplicarBateria(ruta, propiedadesBateria.Percentage, notificar);
    }

    _obtenerDispositivo(ruta) {
        let dispositivo = this._dispositivos.get(ruta);
        if (!dispositivo) {
            dispositivo = {ruta, nombre: '', alias: '', icono: '', conectado: false, bateria: null, uuids: []};
            this._dispositivos.set(ruta, dispositivo);
        }
        return dispositivo;
    }

    _aplicarPropiedadesDispositivo(dispositivo, propiedades, notificar) {
        const estabaConectado = dispositivo.conectado;

        if ('Name' in propiedades)
            dispositivo.nombre = propiedades.Name;
        if ('Alias' in propiedades)
            dispositivo.alias = propiedades.Alias;
        if ('Icon' in propiedades)
            dispositivo.icono = propiedades.Icon;
        if ('UUIDs' in propiedades)
            dispositivo.uuids = propiedades.UUIDs;
        if ('Connected' in propiedades)
            dispositivo.conectado = propiedades.Connected;

        if (!notificar || estabaConectado === dispositivo.conectado || !this._esAudio(dispositivo))
            return;

        registrarInfo(`${this._nombreVisible(dispositivo)} ${dispositivo.conectado ? 'conectado' : 'desconectado'}.`);
        this._emitir(dispositivo.conectado ? EVENTOS_BLUETOOTH.CONECTADO : EVENTOS_BLUETOOTH.DESCONECTADO, dispositivo);
    }

    _aplicarBateria(ruta, porcentaje, notificar) {
        const dispositivo = this._obtenerDispositivo(ruta);
        const nuevo = Number.isFinite(porcentaje) ? porcentaje : null;
        if (dispositivo.bateria === nuevo)
            return;

        dispositivo.bateria = nuevo;
        if (notificar && dispositivo.conectado && this._esAudio(dispositivo))
            this._emitir(EVENTOS_BLUETOOTH.BATERIA, dispositivo);
    }

    /** Servicio org.bluez · señal PropertiesChanged (s interfaz, a{sv} cambios, as invalidadas). */
    _alCambiarPropiedades(_conexion, _emisor, ruta, _interfaz, _senal, parametros) {
        const [interfaz, cambios] = parametros.recursiveUnpack();

        if (interfaz === INTERFAZ_DISPOSITIVO) {
            this._aplicarPropiedadesDispositivo(this._obtenerDispositivo(ruta), cambios, true);
        } else if (interfaz === INTERFAZ_BATERIA && 'Percentage' in cambios) {
            this._aplicarBateria(ruta, cambios.Percentage, true);
        }
    }

    /** Servicio org.bluez · señal InterfacesAdded (o ruta, a{sa{sv}} interfaces). */
    _alAgregarInterfaces(_conexion, _emisor, _ruta, _interfaz, _senal, parametros) {
        const [ruta, interfaces] = parametros.recursiveUnpack();
        this._registrarInterfaces(ruta, interfaces, true);
    }

    /** Servicio org.bluez · señal InterfacesRemoved (o ruta, as interfaces). */
    _alQuitarInterfaces(_conexion, _emisor, _ruta, _interfaz, _senal, parametros) {
        const [ruta, interfaces] = parametros.recursiveUnpack();

        if (interfaces.includes(INTERFAZ_DISPOSITIVO)) {
            this._dispositivos.delete(ruta);
            return;
        }

        if (interfaces.includes(INTERFAZ_BATERIA) && this._dispositivos.has(ruta))
            this._dispositivos.get(ruta).bateria = null;
    }

    _esAudio(dispositivo) {
        return dispositivo.icono?.startsWith('audio-') ||
            PATRON_NOMBRE_AUDIO.test(dispositivo.alias || dispositivo.nombre);
    }

    _nombreVisible(dispositivo) {
        return dispositivo.alias || dispositivo.nombre || 'Dispositivo Bluetooth';
    }

    _resumen(dispositivo) {
        return {
            ruta: dispositivo.ruta,
            nombre: this._nombreVisible(dispositivo),
            icono: `${dispositivo.icono || 'audio-headphones'}-symbolic`,
            bateria: dispositivo.bateria,
            // Servicios que anuncia (sirve para saber si habla el protocolo de los AirPods).
            uuids: dispositivo.uuids,
        };
    }

    _emitir(tipo, dispositivo) {
        try {
            this._alEvento?.(tipo, this._resumen(dispositivo));
        } catch (error) {
            registrarError(`bluetooth: procesar evento "${tipo}"`, error);
        }
    }
}

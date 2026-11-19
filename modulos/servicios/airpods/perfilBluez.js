// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * PerfilAap — puente entre BlueZ y el protocolo AAP de los AirPods.
 *
 * Cómo funciona (todo por D-Bus, sin programas externos):
 *   1. La isla publica un objeto org.bluez.Profile1 en el bus de sistema y lo
 *      registra en BlueZ (ProfileManager1.RegisterProfile) para el UUID AAP.
 *   2. Pide a BlueZ que se conecte a ese perfil en los audífonos
 *      (Device1.ConnectProfile). BlueZ abre el canal L2CAP 0x1001.
 *   3. BlueZ llama a nuestro NewConnection() y nos entrega el descriptor del
 *      canal ya abierto. Con él se crea una SesionAap que lee y escribe paquetes.
 *
 * Lectura asíncrona por eventos (read_bytes_async): nada de sondeo.
 */

import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';

import {registrarInfo, registrarAviso, registrarError, registrarDepuracion} from '../../registro.js';
import {UUID_AAP, PSM_AAP, aHex} from './protocolo.js';

const RUTA_PERFIL = '/org/gnome/shell/extensions/isla_dinamica/perfil_aap';
const TAMANO_MAXIMO_PAQUETE = 1024;

const XML_PERFIL = `
<node>
  <interface name="org.bluez.Profile1">
    <method name="Release"/>
    <method name="NewConnection">
      <arg type="o" name="dispositivo" direction="in"/>
      <arg type="h" name="descriptor" direction="in"/>
      <arg type="a{sv}" name="propiedades" direction="in"/>
    </method>
    <method name="RequestDisconnection">
      <arg type="o" name="dispositivo" direction="in"/>
    </method>
  </interface>
</node>`;

/**
 * Una conexión AAP abierta con unos audífonos concretos.
 */
export class SesionAap {
    /**
     * @param {string} rutaDispositivo - Ruta BlueZ del dispositivo.
     * @param {number} descriptor - Descriptor del canal L2CAP (lo entrega BlueZ).
     * @param {object} manejadores
     * @param {Function} manejadores.alRecibir - Recibe (Uint8Array).
     * @param {Function} manejadores.alCerrarse - Se llama una vez al terminar.
     */
    constructor(rutaDispositivo, descriptor, {alRecibir, alCerrarse}) {
        this.rutaDispositivo = rutaDispositivo;
        this._alRecibir = alRecibir;
        this._alCerrarse = alCerrarse;
        this._cancelable = new Gio.Cancellable();
        this._cerrada = false;

        // El canal admite una sola escritura a la vez: los paquetes esperan en cola.
        this._colaEnvio = [];
        this._escribiendo = false;

        // El mismo descriptor sirve para leer y escribir; solo la entrada lo cierra al final.
        this._entrada = new GioUnix.InputStream({fd: descriptor, close_fd: true});
        this._salida = new GioUnix.OutputStream({fd: descriptor, close_fd: false});

        this._leerSiguiente();
    }

    /**
     * Envía un paquete (cada escritura es un paquete completo).
     * @param {Uint8Array} bytes
     */
    enviar(bytes) {
        if (this._cerrada)
            return;
        this._colaEnvio.push(bytes);
        if (!this._escribiendo)
            this._escribirSiguiente();
    }

    _escribirSiguiente() {
        const bytes = this._colaEnvio.shift();
        if (!bytes || this._cerrada) {
            this._escribiendo = false;
            return;
        }
        this._escribiendo = true;
        registrarDepuracion(`AAP → ${aHex(bytes)}`);
        this._salida.write_bytes_async(new GLib.Bytes(bytes), GLib.PRIORITY_DEFAULT, this._cancelable,
            (_flujo, resultado) => {
                try {
                    this._salida.write_bytes_finish(resultado);
                } catch (error) {
                    if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        registrarError('airpods: enviar paquete', error);
                }
                this._escribirSiguiente();
            });
    }

    /** Cierra el canal (idempotente). */
    cerrar() {
        if (this._cerrada)
            return;
        this._cerrada = true;
        this._cancelable.cancel();
        try {
            this._salida.close(null);
            this._entrada.close(null);
        } catch (error) {
            registrarDepuracion(`AAP: error al cerrar el canal: ${error.message}`);
        }
        const alCerrarse = this._alCerrarse;
        this._alCerrarse = null;
        this._alRecibir = null;
        alCerrarse?.(this);
    }

    _leerSiguiente() {
        // Canal SEQPACKET: cada lectura devuelve exactamente un paquete.
        this._entrada.read_bytes_async(TAMANO_MAXIMO_PAQUETE, GLib.PRIORITY_DEFAULT, this._cancelable,
            (_flujo, resultado) => {
                let datos;
                try {
                    datos = this._entrada.read_bytes_finish(resultado);
                } catch (error) {
                    if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        registrarAviso(`AAP: el canal se cerró con error: ${error.message}`);
                    this.cerrar();
                    return;
                }

                if (datos.get_size() === 0) {
                    registrarInfo('AAP: los audífonos cerraron el canal.');
                    this.cerrar();
                    return;
                }

                const bytes = new Uint8Array(datos.toArray());
                registrarDepuracion(`AAP ← ${aHex(bytes)}`);
                try {
                    this._alRecibir?.(bytes);
                } catch (error) {
                    registrarError('airpods: procesar paquete', error);
                }
                if (!this._cerrada)
                    this._leerSiguiente();
            });
    }
}

/**
 * El perfil registrado en BlueZ. Entrega una SesionAap por cada conexión.
 */
export class PerfilAap {
    /**
     * @param {Function} alNuevaConexion - Recibe (rutaDispositivo, descriptor).
     */
    constructor(alNuevaConexion) {
        this._alNuevaConexion = alNuevaConexion;
        this._exportado = null;
        this._registrado = false;
        this._cancelable = new Gio.Cancellable();
    }

    /** Publica el objeto Profile1 y lo registra en BlueZ. */
    async registrar() {
        this._exportado = Gio.DBusExportedObject.wrapJSObject(XML_PERFIL, this);
        this._exportado.export(Gio.DBus.system, RUTA_PERFIL);

        const opciones = {
            Name: new GLib.Variant('s', 'Isla Dinámica (AirPods)'),
            Role: new GLib.Variant('s', 'client'),
            PSM: new GLib.Variant('q', PSM_AAP),
            RequireAuthentication: new GLib.Variant('b', false),
            RequireAuthorization: new GLib.Variant('b', false),
            AutoConnect: new GLib.Variant('b', false),
        };

        try {
            await this._registrarEnBluez(opciones);
        } catch (error) {
            // Un registro anterior de la isla aún no se retiró (desactivar y activar rápido):
            // se retira y se intenta una vez más.
            if (!error.message?.includes('already registered'))
                throw error;
            registrarInfo('AAP: había un registro anterior; se retira y se vuelve a registrar.');
            await this._retirarDeBluez();
            await this._registrarEnBluez(opciones);
        }
        this._registrado = true;
        registrarInfo('Perfil AAP registrado en BlueZ.');
    }

    async _registrarEnBluez(opciones) {
        // Servicio org.bluez · interfaz org.bluez.ProfileManager1 · método RegisterProfile
        await Gio.DBus.system.call(
            'org.bluez', '/org/bluez', 'org.bluez.ProfileManager1', 'RegisterProfile',
            new GLib.Variant('(osa{sv})', [RUTA_PERFIL, UUID_AAP, opciones]),
            null, Gio.DBusCallFlags.NONE, -1, this._cancelable);
    }

    async _retirarDeBluez() {
        try {
            // Servicio org.bluez · interfaz org.bluez.ProfileManager1 · método UnregisterProfile
            await Gio.DBus.system.call(
                'org.bluez', '/org/bluez', 'org.bluez.ProfileManager1', 'UnregisterProfile',
                new GLib.Variant('(o)', [RUTA_PERFIL]),
                null, Gio.DBusCallFlags.NONE, -1, null);
        } catch (error) {
            registrarDepuracion(`AAP: no se pudo retirar el perfil: ${error.message}`);
        }
    }

    /**
     * Pide a BlueZ que abra el canal AAP con un dispositivo.
     * @param {string} rutaDispositivo
     */
    async conectar(rutaDispositivo) {
        // Servicio org.bluez · interfaz org.bluez.Device1 · método ConnectProfile
        await Gio.DBus.system.call(
            'org.bluez', rutaDispositivo, 'org.bluez.Device1', 'ConnectProfile',
            new GLib.Variant('(s)', [UUID_AAP]),
            null, Gio.DBusCallFlags.NONE, 15000, this._cancelable);
    }

    /** Retira el perfil de BlueZ y deja de publicar el objeto. */
    async destruir() {
        this._cancelable.cancel();
        this._alNuevaConexion = null;
        if (this._registrado) {
            this._registrado = false;
            await this._retirarDeBluez();
        }
        this._exportado?.unexport();
        this._exportado = null;
    }

    // ───────────── Métodos de org.bluez.Profile1 (los llama BlueZ) ─────────────

    /** BlueZ retira el perfil (por ejemplo, si bluetoothd se reinicia). */
    Release() {
        registrarAviso('BlueZ retiró el perfil AAP.');
        this._registrado = false;
    }

    /**
     * BlueZ abrió el canal: el descriptor viene en la lista de descriptores del mensaje.
     * @param {Array} parametros - [rutaDispositivo, índiceDescriptor, propiedades]
     * @param {Gio.DBusMethodInvocation} invocacion
     */
    NewConnectionAsync(parametros, invocacion) {
        try {
            const [rutaDispositivo, indice] = parametros;
            const descriptor = invocacion.get_message().get_unix_fd_list().get(indice);
            registrarInfo(`AAP: canal abierto con ${rutaDispositivo}.`);
            this._alNuevaConexion?.(rutaDispositivo, descriptor);
            invocacion.return_value(null);
        } catch (error) {
            registrarError('airpods: NewConnection', error);
            invocacion.return_dbus_error('org.bluez.Error.Rejected', error.message);
        }
    }

    /** BlueZ avisa de que el canal se va a cerrar. */
    RequestDisconnection(rutaDispositivo) {
        registrarInfo(`AAP: BlueZ cierra el canal con ${rutaDispositivo}.`);
    }
}

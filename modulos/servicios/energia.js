/**
 * MonitorEnergia — Capa 3 (servicio de batería del portátil).
 *
 * Escucha a UPower (bus de sistema) en su "dispositivo de pantalla"
 * (DisplayDevice: la batería combinada del equipo) y avisa cuando se
 * ENCHUFA o DESENCHUFA el cargador. Todo por PropertiesChanged, sin sondeo.
 *
 * El aviso de batería baja no se hace aquí: GNOME (gsd-power) ya envía una
 * notificación, y la isla la muestra como cualquier otra.
 */

import Gio from 'gi://Gio';

import {registrarInfo, registrarError, protegido} from '../registro.js';

const XML_DISPOSITIVO = `
<node>
  <interface name="org.freedesktop.UPower.Device">
    <property name="Type" type="u" access="read"/>
    <property name="IsPresent" type="b" access="read"/>
    <property name="State" type="u" access="read"/>
    <property name="Percentage" type="d" access="read"/>
    <property name="TimeToEmpty" type="x" access="read"/>
    <property name="TimeToFull" type="x" access="read"/>
  </interface>
</node>`;

const ProxyDispositivo = Gio.DBusProxy.makeProxyWrapper(XML_DISPOSITIVO);

/** Valores de org.freedesktop.UPower.Device.State */
const ESTADOS_UPOWER = Object.freeze({
    DESCONOCIDO: 0,
    CARGANDO: 1,
    DESCARGANDO: 2,
    VACIA: 3,
    LLENA: 4,
    CARGA_PENDIENTE: 5,
    DESCARGA_PENDIENTE: 6,
});

/** Valor de org.freedesktop.UPower.Device.Type para baterías. */
const TIPO_BATERIA = 2;

/**
 * Eventos que emite el monitor.
 * @enum {string}
 */
export const EVENTOS_ENERGIA = Object.freeze({
    ENCHUFADO: 'enchufado',
    DESENCHUFADO: 'desenchufado',
});

export class MonitorEnergia {
    /**
     * @param {Function} alEvento - Recibe (evento, {porcentaje, cargando, llena, minutosRestantes}).
     */
    constructor(alEvento) {
        this._alEvento = alEvento;
        this._proxy = null;
        this._idPropiedades = 0;
        this._cancelable = new Gio.Cancellable();
        /** @type {boolean|null} null hasta conocer el estado inicial. */
        this._enchufado = null;
    }

    /** Conecta con UPower. Si el equipo no tiene batería, no hace nada. */
    async iniciar() {
        // Servicio org.freedesktop.UPower · objeto DisplayDevice · interfaz org.freedesktop.UPower.Device
        this._proxy = await new Promise((resolver, rechazar) => {
            ProxyDispositivo(Gio.DBus.system, 'org.freedesktop.UPower',
                '/org/freedesktop/UPower/devices/DisplayDevice',
                (proxy, error) => (error ? rechazar(error) : resolver(proxy)), this._cancelable);
        });

        if (this._proxy.Type !== TIPO_BATERIA || !this._proxy.IsPresent) {
            registrarInfo('Energía: el equipo no tiene batería; no hay avisos de cargador.');
            return;
        }

        this._enchufado = this._calcularEnchufado(this._proxy.State, null);
        // Señal org.freedesktop.DBus.Properties.PropertiesChanged (g-properties-changed).
        this._idPropiedades = this._proxy.connect('g-properties-changed',
            protegido('energía: cambio en UPower', () => this._alCambiar()));
        registrarInfo(`Energía lista: ${Math.round(this._proxy.Percentage)} %, ${this._enchufado ? 'enchufado' : 'con batería'}.`);
    }

    destruir() {
        this._cancelable.cancel();
        if (this._proxy && this._idPropiedades)
            this._proxy.disconnect(this._idPropiedades);
        this._idPropiedades = 0;
        this._proxy = null;
        this._alEvento = null;
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    /**
     * ¿Está el cargador enchufado según el estado de UPower?
     * Los estados "desconocido" no cambian nada (UPower los emite de paso).
     */
    _calcularEnchufado(estado, anterior) {
        switch (estado) {
        case ESTADOS_UPOWER.CARGANDO:
        case ESTADOS_UPOWER.LLENA:
        case ESTADOS_UPOWER.CARGA_PENDIENTE:
            return true;
        case ESTADOS_UPOWER.DESCARGANDO:
        case ESTADOS_UPOWER.DESCARGA_PENDIENTE:
        case ESTADOS_UPOWER.VACIA:
            return false;
        default:
            return anterior;
        }
    }

    _alCambiar() {
        const enchufado = this._calcularEnchufado(this._proxy.State, this._enchufado);
        if (enchufado === null || enchufado === this._enchufado)
            return;
        this._enchufado = enchufado;

        const estado = this._proxy.State;
        const segundos = enchufado ? this._proxy.TimeToFull : this._proxy.TimeToEmpty;
        const datos = {
            porcentaje: Math.round(this._proxy.Percentage),
            cargando: estado === ESTADOS_UPOWER.CARGANDO,
            llena: estado === ESTADOS_UPOWER.LLENA,
            minutosRestantes: segundos > 0 ? Math.round(segundos / 60) : null,
        };
        registrarInfo(`Energía: ${enchufado ? 'cargador enchufado' : 'cargador desenchufado'} (${datos.porcentaje} %).`);

        try {
            this._alEvento?.(enchufado ? EVENTOS_ENERGIA.ENCHUFADO : EVENTOS_ENERGIA.DESENCHUFADO, datos);
        } catch (error) {
            registrarError('energía: avisar a la isla', error);
        }
    }
}

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * MonitorLlamada — Capa 3 (servicio). ¿Estoy en una llamada o videollamada?
 *
 * Quién usa el micrófono lo dice el mezclador de audio de GNOME (Gvc, el mismo
 * que usa el indicador de micrófono de los Ajustes rápidos): cada app que graba
 * sonido es un "flujo de grabación". Con eso y los títulos de las ventanas,
 * reconocedorLlamadas.detectarLlamada decide si es una llamada (Meet, WhatsApp,
 * Zoom, Teams... en cualquier navegador o en su app).
 *
 * Se vuelve a mirar cuando cambia algo: empieza o termina un flujo, se abre una
 * ventana, cambia la ventana activa o suena una llamada. Nada de sondeo.
 * Mientras dura la llamada, un temporizador de una sola vez por segundo hace
 * avanzar el contador (como en la grabación de pantalla).
 *
 * También silencia o reactiva el micrófono (el de entrada por defecto, como el
 * interruptor de los Ajustes rápidos) y lleva a la ventana de la llamada.
 *
 * Entrega {enLlamada, id, nombre, transcurridoMs, silenciado}.
 */

import GLib from 'gi://GLib';
import Gvc from 'gi://Gvc';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';

import {registrarInfo, registrarError, protegido} from '../../registro.js';
import {detectarLlamada} from './reconocedorLlamadas.js';

/** Programas que "graban" solo para mostrar el nivel del micrófono (igual que omite GNOME). */
const APPS_OMITIDAS = ['org.gnome.VolumeControl', 'org.PulseAudio.pavucontrol'];

const MICROSEGUNDOS_POR_MS = 1000;

/** Sin llamada. */
const SIN_LLAMADA = Object.freeze({enLlamada: false, id: null, nombre: '', transcurridoMs: 0, silenciado: false});

export class MonitorLlamada {
    /**
     * @param {Function} alCambiar - Recibe {enLlamada, id, nombre, transcurridoMs, silenciado}.
     */
    constructor(alCambiar) {
        this._alCambiar = alCambiar;
        this._control = null;
        this._microfono = null;
        this._llamada = null;
        this._ventana = null;
        this._inicioUs = 0;
        this._idTic = 0;
        /** Última llamada que sonó: {id, nombre, cuandoUs}. */
        this._entrante = null;
    }

    iniciar() {
        const evaluar = protegido('llamada: revisar', () => this._evaluar());
        // Mezclador de GNOME (único por sesión; lo comparte con el indicador de volumen).
        this._control = Volume.getMixerControl();
        this._control.connectObject(
            'state-changed', evaluar,
            'stream-added', evaluar,
            'stream-removed', evaluar,
            'default-source-changed', protegido('llamada: micrófono por defecto', () => this._seguirMicrofono()),
            this);
        global.display.connectObject(
            'window-created', evaluar,
            'notify::focus-window', evaluar,
            this);
        this._seguirMicrofono();
        this._evaluar();
        registrarInfo('Llamadas listas.');
    }

    /** @returns {{enLlamada: boolean, id: string|null, nombre: string, transcurridoMs: number, silenciado: boolean}} */
    get estado() {
        if (!this._llamada)
            return {...SIN_LLAMADA, silenciado: this._silenciado()};
        return {
            enLlamada: true,
            id: this._llamada.id,
            nombre: this._llamada.nombre,
            transcurridoMs: this._transcurridoMs(),
            silenciado: this._silenciado(),
        };
    }

    /**
     * Sonó una llamada (aviso de WhatsApp, Telegram...): si justo después el navegador
     * usa el micrófono, es esa llamada.
     * @param {{id: string, nombre: string}} app
     */
    registrarLlamadaEntrante({id, nombre}) {
        this._entrante = {id, nombre, cuandoUs: GLib.get_monotonic_time()};
        this._evaluar();
    }

    /** Silencia o reactiva el micrófono. */
    alternarSilencio() {
        if (!this._microfono)
            return;
        this._microfono.change_is_muted(!this._microfono.is_muted);
    }

    /** Lleva a la ventana de la llamada (o, si no se sabe cuál es, a la app). */
    mostrar() {
        // La ventana guardada puede haberse cerrado: solo se usa si sigue entre las abiertas.
        if (this._ventana && global.display.list_all_windows().includes(this._ventana)) {
            Main.activateWindow(this._ventana);
            return;
        }
        registrarInfo(`Llamada: no se encontró la ventana de ${this._llamada?.nombre ?? 'la llamada'}.`);
    }

    destruir() {
        this._control?.disconnectObject(this);
        this._control = null;
        this._microfono?.disconnectObject(this);
        this._microfono = null;
        global.display.disconnectObject(this);
        this._detenerTic();
        this._ventana = null;
        this._alCambiar = null;
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    /** Sigue al micrófono por defecto para saber si está silenciado. */
    _seguirMicrofono() {
        this._microfono?.disconnectObject(this);
        this._microfono = this._control?.get_default_source() ?? null;
        this._microfono?.connectObject('notify::is-muted',
            protegido('llamada: silencio del micrófono', () => this._emitir()), this);
        this._emitir();
    }

    _silenciado() {
        return Boolean(this._microfono?.is_muted);
    }

    _evaluar() {
        const llamada = this._detectar();
        const antes = this._llamada;
        if (llamada?.id === antes?.id && Boolean(llamada) === Boolean(antes)) {
            // Misma llamada: puede haber cambiado su ventana (ej. se abrió la de la llamada).
            if (llamada?.ventanaMeta)
                this._ventana = llamada.ventanaMeta;
            return;
        }

        if (llamada && !antes) {
            this._inicioUs = GLib.get_monotonic_time();
            registrarInfo(`Llamada: empieza (${llamada.nombre}).`);
        } else if (!llamada && antes) {
            registrarInfo(`Llamada: termina (${Math.round(this._transcurridoMs() / 1000)} s).`);
            this._inicioUs = 0;
        }
        this._llamada = llamada ? {id: llamada.id, nombre: llamada.nombre} : null;
        this._ventana = llamada?.ventanaMeta ?? null;
        if (this._llamada)
            this._programarTic();
        else
            this._detenerTic();
        this._emitir();
    }

    /** @returns {{id: string, nombre: string, ventanaMeta: Meta.Window|null}|null} */
    _detectar() {
        if (!this._control || this._control.get_state() !== Gvc.MixerControlState.READY)
            return null;

        const flujos = this._control.get_source_outputs()
            .filter(flujo => !APPS_OMITIDAS.includes(flujo.get_application_id()))
            .map(flujo => ({
                idApp: flujo.get_application_id() ?? '',
                nombre: flujo.get_name() ?? '',
                icono: flujo.get_icon_name() ?? '',
            }));
        if (flujos.length === 0)
            return null;

        const rastreador = Shell.WindowTracker.get_default();
        const metas = global.display.list_all_windows()
            .filter(ventana => ventana.get_window_type() === Meta.WindowType.NORMAL);
        const ventanas = metas.map(ventana => ({
            titulo: ventana.get_title() ?? '',
            idApp: rastreador.get_window_app(ventana)?.get_id() ?? '',
            clase: ventana.get_wm_class() ?? '',
        }));

        const entrante = this._entrante
            ? {...this._entrante, hace: (GLib.get_monotonic_time() - this._entrante.cuandoUs) / MICROSEGUNDOS_POR_MS}
            : null;
        const llamada = detectarLlamada({flujos, ventanas, entrante});
        if (!llamada)
            return null;
        return {id: llamada.id, nombre: llamada.nombre, ventanaMeta: metas[llamada.ventana] ?? null};
    }

    _transcurridoMs() {
        if (!this._llamada || !this._inicioUs)
            return 0;
        return Math.floor((GLib.get_monotonic_time() - this._inicioUs) / MICROSEGUNDOS_POR_MS);
    }

    /** Un aviso al siguiente cambio de segundo (no se acumula desfase). */
    _programarTic() {
        this._detenerTic();
        const espera = 1000 - (this._transcurridoMs() % 1000);
        this._idTic = GLib.timeout_add(GLib.PRIORITY_DEFAULT, espera, () => {
            this._idTic = 0;
            protegido('llamada: segundo', () => {
                if (!this._llamada)
                    return;
                this._emitir();
                this._programarTic();
            })();
            return GLib.SOURCE_REMOVE;
        });
    }

    _detenerTic() {
        if (this._idTic) {
            GLib.source_remove(this._idTic);
            this._idTic = 0;
        }
    }

    _emitir() {
        try {
            this._alCambiar?.(this.estado);
        } catch (error) {
            registrarError('llamada: avisar a la isla', error);
        }
    }
}

/**
 * CapturadorOsd — Capa 3 (servicio de volumen y brillo).
 *
 * GNOME muestra un recuadro flotante (OSD) al cambiar el volumen o el brillo,
 * llamando a Main.osdWindowManager.show / showOne / showAll (showOne usa show).
 * La isla reemplaza show y showAll en la instancia: si el aviso es de volumen,
 * brillo o teclado retroiluminado y trae un nivel, lo entrega a la isla y
 * GNOME no dibuja su recuadro. Cualquier otro aviso (Bloq Mayús, modo avión...)
 * sigue yendo al recuadro de GNOME.
 *
 * Al desactivar la extensión se restauran los métodos originales.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {TIPOS_INDICADOR} from '../constantes.js';
import {registrarAviso, registrarError} from '../registro.js';

/** Icono de GNOME → tipo de indicador. */
const PATRONES = [
    [/microphone/, TIPOS_INDICADOR.MICROFONO],
    [/audio-volume|audio-speakers|audio-headphones|audio-headset/, TIPOS_INDICADOR.VOLUMEN],
    [/keyboard-brightness/, TIPOS_INDICADOR.TECLADO],
    [/display-brightness|brightness/, TIPOS_INDICADOR.BRILLO],
];

/**
 * @param {Gio.Icon|null} icono
 * @returns {string|null} Uno de TIPOS_INDICADOR, o null si no es un indicador conocido.
 */
function tipoDeIcono(icono) {
    const nombres = (icono?.get_names?.() ?? [icono?.to_string?.() ?? '']).join(' ');
    return PATRONES.find(([patron]) => patron.test(nombres))?.[1] ?? null;
}

export class CapturadorOsd {
    /**
     * @param {Function} alMostrar - Recibe {tipo, gicon, nivel, maximo, etiqueta}.
     *   `nivel` va de 0 a `maximo` (1, o 1,5 con volumen amplificado).
     *   Si devuelve false, la isla no puede mostrarlo ahora y se usa el recuadro de GNOME.
     */
    constructor(alMostrar) {
        this._alMostrar = alMostrar;
        this._originales = null;
        this._propios = null;
    }

    /** Reemplaza show/showAll de Main.osdWindowManager. */
    iniciar() {
        const gestor = Main.osdWindowManager;
        const capturador = this;
        this._originales = {show: gestor.show, showAll: gestor.showAll};

        this._propios = {
            // show(icon, label, {indiceMonitor: {level, maxLevel}}) — también lo usa showOne.
            show(icono, etiqueta, niveles) {
                const primero = Object.values(niveles ?? {}).find(Boolean);
                if (capturador._capturar(icono, etiqueta, primero?.level, primero?.maxLevel))
                    return undefined;
                return capturador._originales.show.call(this, icono, etiqueta, niveles);
            },
            // showAll(icon, label, level, maxLevel) — la usa el control de volumen del Shell.
            showAll(icono, etiqueta, nivel, nivelMaximo) {
                if (capturador._capturar(icono, etiqueta, nivel, nivelMaximo))
                    return undefined;
                return capturador._originales.showAll.call(this, icono, etiqueta, nivel, nivelMaximo);
            },
        };

        gestor.show = this._propios.show;
        gestor.showAll = this._propios.showAll;
    }

    /** Restaura los métodos originales de GNOME. */
    destruir() {
        const gestor = Main.osdWindowManager;
        const prototipo = Object.getPrototypeOf(gestor);
        for (const nombre of ['show', 'showAll']) {
            if (!this._propios)
                break;
            if (gestor[nombre] !== this._propios[nombre]) {
                registrarAviso(`OSD: otra extensión modificó ${nombre} después; no se restaura.`);
                continue;
            }
            if (this._originales[nombre] === prototipo[nombre])
                delete gestor[nombre];
            else
                gestor[nombre] = this._originales[nombre];
        }
        this._originales = null;
        this._propios = null;
        this._alMostrar = null;
    }

    /**
     * @returns {boolean} true si la isla se encargó (GNOME no debe dibujar su recuadro).
     */
    _capturar(icono, etiqueta, nivel, nivelMaximo) {
        const tipo = tipoDeIcono(icono);
        if (!tipo || typeof nivel !== 'number' || !this._alMostrar)
            return false;
        try {
            const manejado = this._alMostrar({
                tipo,
                gicon: icono,
                nivel,
                maximo: nivelMaximo > 0 ? nivelMaximo : 1,
                etiqueta: etiqueta ?? null,
            });
            return manejado !== false;
        } catch (error) {
            // Si la isla falla, el usuario igual ve el recuadro de GNOME.
            registrarError('osd: mostrar en la isla', error);
            return false;
        }
    }
}

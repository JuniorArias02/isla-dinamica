// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * MonitorPortapapeles — Capa 3 (servicio). Avisa cuando se copia algo.
 *
 * Mutter emite `owner-changed` en su Meta.Selection cada vez que una app
 * toma el portapapeles (Ctrl+C). La isla muestra un "Copiado ✓" breve.
 *
 * Privacidad: NUNCA se lee el contenido copiado (podría ser una contraseña).
 * Solo se mira el TIPO (por los formatos que ofrece) y la app enfocada.
 *
 * Se ignoran:
 *   - la selección primaria (texto seleccionado con el ratón) y arrastrar/soltar;
 *   - las fuentes en memoria del propio Shell (MetaSelectionSourceMemory): por
 *     ejemplo, cuando GNOME conserva el portapapeles de una app que se cierra;
 *   - avisos repetidos casi a la vez (algunas apps toman el portapapeles dos veces).
 */

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {MARGEN_REPETICION_PORTAPAPELES_MS, TIPOS_COPIA} from '../constantes.js';
import {registrarError, protegido} from '../registro.js';

/**
 * Deduce el tipo por los formatos ofrecidos (sin leer el contenido).
 * @param {string[]} formatos - Tipos MIME.
 * @returns {string} Uno de TIPOS_COPIA.
 */
export function tipoDeCopia(formatos) {
    if (formatos.some(f => f === 'x-special/gnome-copied-files' || f === 'text/uri-list'))
        return TIPOS_COPIA.ARCHIVOS;
    if (formatos.some(f => f.startsWith('image/')))
        return TIPOS_COPIA.IMAGEN;
    if (formatos.some(f => f.startsWith('text/') || f === 'UTF8_STRING' || f === 'STRING'))
        return TIPOS_COPIA.TEXTO;
    return TIPOS_COPIA.OTRO;
}

export class MonitorPortapapeles {
    /**
     * @param {Function} alCopiar - Recibe {tipo, aplicacion} (nombre de la app o null).
     */
    constructor(alCopiar) {
        this._alCopiar = alCopiar;
        this._ultimaCopiaMs = 0;
    }

    iniciar() {
        // Señal owner-changed de Meta.Selection (selection_type, selection_source).
        global.display.get_selection().connectObject('owner-changed',
            protegido('portapapeles: cambio de dueño', (_seleccion, tipo, fuente) => this._alCambiarDueno(tipo, fuente)),
            this);
    }

    destruir() {
        global.display.get_selection().disconnectObject(this);
        this._alCopiar = null;
    }

    _alCambiarDueno(tipo, fuente) {
        if (tipo !== Meta.SelectionType.SELECTION_CLIPBOARD || !fuente)
            return;
        // Fuentes en memoria = el propio Shell (no es una copia hecha por el usuario en una app).
        if (fuente instanceof Meta.SelectionSourceMemory)
            return;

        const ahora = Date.now();
        if (ahora - this._ultimaCopiaMs < MARGEN_REPETICION_PORTAPAPELES_MS)
            return;
        this._ultimaCopiaMs = ahora;

        const datos = {
            tipo: tipoDeCopia(fuente.get_mimetypes() ?? []),
            aplicacion: Shell.WindowTracker.get_default().focus_app?.get_name() ?? null,
        };
        try {
            this._alCopiar?.(datos);
        } catch (error) {
            registrarError('portapapeles: avisar a la isla', error);
        }
    }
}

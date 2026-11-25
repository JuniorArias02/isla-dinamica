// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Icono de una app instalada, como imagen (para compararlo con una carátula).
 *
 * Capa 3 (servicios). Necesita el Shell (Shell.AppSystem y el tema de iconos de St),
 * por eso vive aparte: extension.js se lo pasa a MonitorMultimedia y el resto del
 * servicio de música se puede probar fuera de GNOME Shell.
 */

import Shell from 'gi://Shell';
import St from 'gi://St';

/**
 * @param {string} entradaEscritorio - Nombre del .desktop sin extensión (ej. "brave-browser").
 * @param {number} lado - Tamaño en píxeles.
 * @param {Gio.Cancellable} [cancelable]
 * @returns {Promise<GdkPixbuf.Pixbuf|null>} null si la app o su icono no existen.
 */
export async function cargarIconoDeApp(entradaEscritorio, lado, cancelable = null) {
    const icono = Shell.AppSystem.get_default().lookup_app(`${entradaEscritorio}.desktop`)?.get_icon();
    const info = icono ? new St.IconTheme().lookup_by_gicon(icono, lado, St.IconLookupFlags.FORCE_SIZE) : null;
    if (!info)
        return null;
    return new Promise((resolver, rechazar) => {
        info.load_icon_async(cancelable, (_info, resultado) => {
            try {
                resolver(info.load_icon_finish(resultado));
            } catch (error) {
                rechazar(error);
            }
        });
    });
}

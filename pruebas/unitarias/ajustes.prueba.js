// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas de los ajustes: el esquema GSettings y ajustes.js deben coincidir.
 */

import GLib from 'gi://GLib';

import {ejecutar, prueba, igual} from '../utilidades.js';
import {AJUSTES, ARRASTRE_CAPSULA, ajuste} from '../../modulos/ajustes.js';

const RUTA_ESQUEMA = GLib.Uri.resolve_relative(import.meta.url,
    '../../schemas/org.gnome.shell.extensions.isla-dinamica.gschema.xml', GLib.UriFlags.NONE);

/** Lee las claves del esquema con su tipo y valor por defecto. */
function leerEsquema() {
    const [, contenido] = GLib.file_get_contents(GLib.filename_from_uri(RUTA_ESQUEMA)[0]);
    const xml = new TextDecoder().decode(contenido);
    const claves = {};
    for (const [, nombre, tipo, cuerpo] of xml.matchAll(/<key name="([^"]+)" type="([^"]+)">([\s\S]*?)<\/key>/g)) {
        const textoDefecto = cuerpo.match(/<default>([^<]+)<\/default>/)[1].trim();
        if (tipo === 'b')
            claves[nombre] = textoDefecto === 'true';
        else if (tipo === 's')
            claves[nombre] = textoDefecto.replace(/^'|'$/g, '');
        else
            claves[nombre] = Number(textoDefecto);
    }
    return claves;
}

ejecutar('Ajustes', async () => {
    const esquema = leerEsquema();

    await prueba('ajustes.js declara las mismas claves que el esquema', () => {
        igual(Object.values(AJUSTES).sort(), Object.keys(esquema).sort());
    });

    await prueba('los valores por defecto coinciden con el esquema', () => {
        for (const [clave, valor] of Object.entries(esquema))
            igual(ajuste(clave), valor, clave);
    });

    await prueba('el estilo de arrastre por defecto es "asomar" y sus valores son los del esquema', () => {
        igual(ajuste(AJUSTES.ARRASTRE_CAPSULA), ARRASTRE_CAPSULA.ASOMAR);
        const [, contenido] = GLib.file_get_contents(GLib.filename_from_uri(RUTA_ESQUEMA)[0]);
        const xml = new TextDecoder().decode(contenido);
        const opciones = [...xml.matchAll(/<choice value="([^"]+)"\/>/g)].map(([, valor]) => valor);
        igual(opciones.sort(), Object.values(ARRASTRE_CAPSULA).sort());
    });
});

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas de los ajustes: el esquema GSettings y ajustes.js deben coincidir.
 */

import GLib from 'gi://GLib';

import {ejecutar, prueba, igual} from '../utilidades.js';
import {AJUSTES, ARRASTRE_CAPSULA, ESTILOS_ISLA, ajuste} from '../../modulos/ajustes.js';

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

    /** Valores permitidos (<choices>) de una clave de texto del esquema. */
    const opcionesDe = clave => {
        const [, contenido] = GLib.file_get_contents(GLib.filename_from_uri(RUTA_ESQUEMA)[0]);
        const xml = new TextDecoder().decode(contenido);
        const bloque = xml.match(new RegExp(`<key name="${clave}"[\\s\\S]*?</key>`))[0];
        return [...bloque.matchAll(/<choice value="([^"]+)"\/>/g)].map(([, valor]) => valor).sort();
    };

    await prueba('el estilo de arrastre por defecto es "asomar" y sus valores son los del esquema', () => {
        igual(ajuste(AJUSTES.ARRASTRE_CAPSULA), ARRASTRE_CAPSULA.ASOMAR);
        igual(opcionesDe(AJUSTES.ARRASTRE_CAPSULA), Object.values(ARRASTRE_CAPSULA).sort());
    });

    await prueba('el estilo de la isla por defecto es Liquid Glass y sus valores son los del esquema', () => {
        igual(ajuste(AJUSTES.ESTILO_ISLA), ESTILOS_ISLA.CRISTAL);
        igual(opcionesDe(AJUSTES.ESTILO_ISLA), Object.values(ESTILOS_ISLA).sort());
    });
});

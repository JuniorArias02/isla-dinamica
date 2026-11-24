// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Ventanas — encontrar y traer al frente la ventana de un programa.
 *
 * Capa 3 (servicios). Se usa cuando un reproductor no permite que lo traigan
 * por MPRIS (Brave responde CanRaise = false): se busca entre las ventanas del
 * proceso dueño del reproductor, prefiriendo la que muestra la canción en su
 * título (en YouTube, el título de la pestaña es el de la canción).
 */

import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {registrarDepuracion} from '../registro.js';

/**
 * Trae al frente la ventana del proceso indicado.
 * @param {object} opciones
 * @param {number} opciones.pid - Proceso dueño del reproductor.
 * @param {string} [opciones.titulo] - Título de la canción (para elegir la ventana correcta).
 * @returns {boolean} true si encontró y activó una ventana.
 */
export function activarVentanaDeProceso({pid, titulo = ''}) {
    const ventanas = global.display.list_all_windows()
        .filter(ventana => ventana.get_pid() === pid && ventana.get_window_type() === Meta.WindowType.NORMAL);
    if (ventanas.length === 0)
        return false;

    const buscado = titulo.trim().toLocaleLowerCase();
    const conLaCancion = buscado
        ? ventanas.find(ventana => ventana.get_title()?.toLocaleLowerCase().includes(buscado))
        : null;
    // Si ninguna muestra la canción (pestaña en segundo plano), la última que se usó.
    const elegida = conLaCancion ?? ventanas.sort((a, b) => b.get_user_time() - a.get_user_time())[0];

    registrarDepuracion(`Ventanas: se trae al frente una de ${ventanas.length} (${conLaCancion ? 'con la canción' : 'la más reciente'}).`);
    Main.activateWindow(elegida);
    return true;
}

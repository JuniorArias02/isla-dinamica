// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas del MonitorMultimedia: el cambio de canción no debe quitar la música
 * (estado "cargando"), pero cerrar el reproductor sí.
 */

import {ejecutar, prueba, igual, verdadero, esperar} from '../utilidades.js';
import {MonitorMultimedia} from '../../modulos/servicios/mpris.js';
import {TIEMPO_ESPERA_PISTA_MS} from '../../modulos/constantes.js';

const BUS = 'org.mpris.MediaPlayer2.brave.instance1';

/** Reproductor falso con la misma forma que Reproductor. */
function crearReproductor(titulo) {
    return {
        nombreBus: BUS,
        titulo,
        reproduciendo: true,
        ultimaActividad: 1,
        get tienePista() {
            return Boolean(this.titulo);
        },
        obtenerPista() {
            return {nombreBus: BUS, aplicacion: 'Brave', titulo: this.titulo, reproduciendo: this.reproduciendo,
                urlCaratula: 'file:///tmp/portada.png', duracionUs: 200_000_000, puedeBuscar: true, puedeSiguiente: true};
        },
        destruir() {},
    };
}

/** Monitor con un reproductor falso ya registrado; guarda cada pista emitida. */
function crear(titulo = 'Canción A') {
    const emitidas = [];
    const monitor = new MonitorMultimedia(pista => emitidas.push(pista));
    const reproductor = crearReproductor(titulo);
    monitor._reproductores.set(BUS, reproductor);
    monitor._actualizarActivo();
    return {monitor, reproductor, emitidas, ultima: () => emitidas[emitidas.length - 1]};
}

ejecutar('Multimedia', async () => {
    await prueba('una canción con datos se muestra normal', () => {
        const {monitor, ultima} = crear();
        igual(ultima().titulo, 'Canción A');
        verdadero(!ultima().cargando, 'no debe estar cargando');
        monitor.destruir();
    });

    await prueba('al pasar de canción (datos vacíos) se avisa "cargando" en lugar de null', () => {
        const {monitor, reproductor, ultima} = crear();
        reproductor.titulo = '';
        reproductor.reproduciendo = false;
        monitor._actualizarActivo();
        verdadero(ultima() !== null, 'no debe quitar la música');
        igual(ultima().cargando, true);
        igual(ultima().reproduciendo, true, 'la cápsula no debe saltar a la hora');
        igual(ultima().urlCaratula, null, 'sin la portada anterior');
        igual(ultima().puedeSiguiente, true, 'los controles siguen activos');
        igual(monitor.activo, reproductor, 'los botones siguen yendo al mismo reproductor');
        monitor.destruir();
    });

    await prueba('cuando llega la canción nueva se muestra y termina la espera', () => {
        const {monitor, reproductor, ultima} = crear();
        reproductor.titulo = '';
        monitor._actualizarActivo();
        reproductor.titulo = 'Canción B';
        monitor._actualizarActivo();
        igual(ultima().titulo, 'Canción B');
        verdadero(!ultima().cargando, 'ya no está cargando');
        igual(monitor._idEspera, 0, 'sin temporizador pendiente');
        monitor.destruir();
    });

    await prueba('si el reproductor se cierra, la música se quita al instante', () => {
        const {monitor, reproductor, ultima} = crear();
        reproductor.titulo = '';
        monitor._actualizarActivo();
        monitor._reproductores.delete(BUS);
        monitor._actualizarActivo();
        igual(ultima(), null);
        igual(monitor._idEspera, 0, 'sin temporizador pendiente');
        monitor.destruir();
    });

    await prueba('un audio de WhatsApp va aparte y la canción se queda en espera (no desaparece); al terminar, vuelve', () => {
        const musica = [];
        const audios = [];
        const monitor = new MonitorMultimedia(pista => musica.push(pista), audio => audios.push(audio));
        const reproductor = crearReproductor('Canción A');
        monitor._reproductores.set(BUS, reproductor);
        monitor._actualizarActivo();
        igual(musica.at(-1).titulo, 'Canción A');
        igual(audios.at(-1), null);

        // Brave pasa a sonar el audio (mismo reproductor, otra pista).
        const obtenerCancion = reproductor.obtenerPista.bind(reproductor);
        reproductor.obtenerPista = () => ({...obtenerCancion(), titulo: 'web.whatsapp.com', tipo: 'audio'});
        monitor._actualizarActivo();
        igual(audios.at(-1).titulo, 'web.whatsapp.com', 'el audio llega por su lado');
        const enEspera = musica.at(-1);
        verdadero(enEspera?.titulo === 'Canción A' && enEspera.enEspera && !enEspera.cargando,
            'la canción sigue, en espera (no desaparece ni muestra el esqueleto de "cargando")');
        verdadero(!enEspera.puedeAlternar && !enEspera.puedeSiguiente, 'sin controles: ahora irían al audio');
        igual(monitor._idEspera, 0);
        verdadero(monitor.activoAudio === reproductor, 'los controles del audio van a su reproductor');

        reproductor.obtenerPista = obtenerCancion;
        monitor._actualizarActivo();
        igual(musica.at(-1).titulo, 'Canción A');
        verdadero(!musica.at(-1).enEspera, 'al terminar el audio, la canción vuelve con sus controles');
        igual(audios.at(-1), null);
        monitor.destruir();
    });

    await prueba('destruir() elimina la espera pendiente', () => {
        const {monitor, reproductor} = crear();
        reproductor.titulo = '';
        monitor._actualizarActivo();
        verdadero(monitor._idEspera !== 0, 'la espera debe estar programada');
        monitor.destruir();
        igual(monitor._idEspera, 0);
    });

    await prueba(`si la canción no llega en ${TIEMPO_ESPERA_PISTA_MS / 1000} s, la música se da por terminada`, async () => {
        const {monitor, reproductor, ultima} = crear();
        reproductor.titulo = '';
        monitor._actualizarActivo();
        igual(ultima().cargando, true);
        await esperar(TIEMPO_ESPERA_PISTA_MS + 300);
        igual(ultima(), null);
        monitor.destruir();
    });
});

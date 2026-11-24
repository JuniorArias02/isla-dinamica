// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Pruebas del ControladorIsla: estados, cola de alertas, actividades y vistas de la cápsula.
 */

import {ejecutar, prueba, igual, verdadero, esperar} from '../utilidades.js';
import {ControladorIsla} from '../../modulos/controlador.js';
import {ESTADOS, ESTADOS_TEMPORIZADOR} from '../../modulos/constantes.js';

/** Crea un controlador que guarda la última vista emitida. */
function crear() {
    const registro = {vista: null};
    const controlador = new ControladorIsla({mostrarVista: vista => {
        registro.vista = vista;
    }});
    return {controlador, registro};
}

const AURICULARES = [{ruta: '/org/bluez/hci0/dev_00', nombre: 'AirPods', bateria: 40}];
const SONANDO = {titulo: 'Canción', reproduciendo: true};
const PAUSADA = {titulo: 'Canción', reproduciendo: false};
const TEMPORIZADOR_EN_MARCHA = {estado: ESTADOS_TEMPORIZADOR.CORRIENDO, totalMs: 60000, restanteMs: 50000};
const TEMPORIZADOR_INACTIVO = {estado: ESTADOS_TEMPORIZADOR.INACTIVO, totalMs: 0, restanteMs: 0};

const actividades = registro => {
    const {principal, secundaria} = registro.vista.actividades;
    return `${principal}/${secundaria}`;
};

ejecutar('Controlador', async () => {
    // ───────────── Estados ─────────────

    await prueba('empieza en reposo', () => {
        const {controlador} = crear();
        igual(controlador.estado, ESTADOS.REPOSO);
        controlador.destruir();
    });

    await prueba('pasa a multimedia al sonar música y vuelve al pausar', () => {
        const {controlador} = crear();
        controlador.actualizarPista(SONANDO);
        igual(controlador.estado, ESTADOS.MULTIMEDIA);
        controlador.actualizarPista(PAUSADA);
        igual(controlador.estado, ESTADOS.REPOSO);
        controlador.destruir();
    });

    await prueba('una alerta expira y vuelve al estado base', async () => {
        const {controlador} = crear();
        controlador.actualizarPista(SONANDO);
        controlador.agregarAlerta({tipo: 'notificacion', clave: 'n', duracionMs: 50, datos: {}});
        igual(controlador.estado, ESTADOS.ALERTA);
        await esperar(150);
        igual(controlador.estado, ESTADOS.MULTIMEDIA);
        controlador.destruir();
    });

    // ───────────── Cola de alertas ─────────────

    await prueba('una alerta más prioritaria interrumpe y la interrumpida vuelve después', () => {
        const {controlador} = crear();
        controlador.agregarAlerta({tipo: 'notificacion', clave: 'n', duracionMs: 10000, datos: {}});
        controlador.agregarAlerta({tipo: 'indicador', clave: 'v', duracionMs: 10000, datos: {}, sinCola: true});
        igual(controlador.alertaActual.tipo, 'indicador');
        controlador.descartarAlerta('v');
        igual(controlador.alertaActual?.tipo, 'notificacion');
        controlador.destruir();
    });

    await prueba('una alerta "sin cola" que no puede mostrarse se descarta', () => {
        const {controlador} = crear();
        controlador.agregarAlerta({tipo: 'indicador', clave: 'v', duracionMs: 10000, datos: {}, sinCola: true});
        controlador.agregarAlerta({tipo: 'portapapeles', clave: 'p', duracionMs: 10000, datos: {}, sinCola: true});
        controlador.descartarAlerta('v');
        igual(controlador.alertaActual, null);
        controlador.destruir();
    });

    await prueba('con la isla abierta las alertas esperan y las "sin cola" se pierden', () => {
        const {controlador} = crear();
        controlador.establecerExpandido(true);
        igual(controlador.estado, ESTADOS.EXPANDIDO);
        controlador.agregarAlerta({tipo: 'notificacion', clave: 'n', duracionMs: 10000, datos: {}});
        controlador.agregarAlerta({tipo: 'indicador', clave: 'v', duracionMs: 10000, datos: {}, sinCola: true});
        igual(controlador.estado, ESTADOS.EXPANDIDO);
        controlador.establecerExpandido(false);
        igual(controlador.alertaActual?.tipo, 'notificacion');
        controlador.descartarAlerta('n');
        igual(controlador.alertaActual, null);
        controlador.destruir();
    });

    await prueba('una alerta con la misma clave reemplaza a la visible', () => {
        const {controlador, registro} = crear();
        controlador.agregarAlerta({tipo: 'notificacion', clave: 'chat', duracionMs: 10000, datos: {cantidad: 1}});
        controlador.agregarAlerta({tipo: 'notificacion', clave: 'chat', duracionMs: 10000, datos: {cantidad: 2}});
        igual(registro.vista.alerta.datos.cantidad, 2);
        controlador.descartarAlerta('chat');
        igual(controlador.alertaActual, null, 'no debe quedar una copia en cola');
        controlador.destruir();
    });

    // ───────────── Actividades (cápsula y círculo) ─────────────

    await prueba('sin actividades: la hora en la cápsula y los auriculares en el círculo', () => {
        const {controlador, registro} = crear();
        controlador.actualizarDispositivos(AURICULARES);
        igual(actividades(registro), 'hora/auriculares');
        controlador.destruir();
    });

    await prueba('temporizador y música: el temporizador va primero por defecto', () => {
        const {controlador, registro} = crear();
        controlador.actualizarDispositivos(AURICULARES);
        controlador.actualizarPista(SONANDO);
        igual(actividades(registro), 'musica/auriculares');
        controlador.actualizarTemporizador(TEMPORIZADOR_EN_MARCHA);
        igual(actividades(registro), 'temporizador/musica');
        controlador.destruir();
    });

    await prueba('la actividad preferida se recuerda aunque se pause y vuelva', () => {
        const {controlador, registro} = crear();
        controlador.actualizarDispositivos(AURICULARES);
        controlador.actualizarPista(SONANDO);
        controlador.actualizarTemporizador(TEMPORIZADOR_EN_MARCHA);
        controlador.establecerActividadPreferida('musica');
        igual(actividades(registro), 'musica/temporizador');
        controlador.actualizarPista(PAUSADA);
        igual(actividades(registro), 'temporizador/auriculares');
        controlador.actualizarPista(SONANDO);
        igual(actividades(registro), 'musica/temporizador');
        controlador.actualizarTemporizador(TEMPORIZADOR_INACTIVO);
        igual(actividades(registro), 'musica/auriculares');
        controlador.destruir();
    });

    // ───────────── Vistas de la cápsula ─────────────

    await prueba('deslizar recorre hora ↔ música ↔ temporizador y rebota en los extremos', () => {
        const {controlador, registro} = crear();
        controlador.actualizarDispositivos(AURICULARES);
        verdadero(!controlador.cambiarVistaCompacta(+1), 'con solo la hora no debe cambiar');

        controlador.actualizarPista(SONANDO);
        controlador.actualizarTemporizador(TEMPORIZADOR_EN_MARCHA);
        igual(registro.vista.actividades.vistas, ['hora', 'musica', 'temporizador']);

        verdadero(controlador.cambiarVistaCompacta(-1), 'debe retroceder');
        igual(actividades(registro), 'musica/temporizador');
        verdadero(controlador.cambiarVistaCompacta(-1), 'debe llegar a la hora');
        igual(actividades(registro), 'hora/temporizador');
        verdadero(!controlador.cambiarVistaCompacta(-1), 'en el extremo debe rebotar');
        verdadero(controlador.cambiarVistaCompacta(+1), 'debe avanzar');
        igual(actividades(registro), 'musica/temporizador');
        controlador.destruir();
    });

    await prueba('la vista de al lado (para asomarse) es circular y no existe con una sola vista', () => {
        const {controlador} = crear();
        igual(controlador.vistaVecina(+1), null, 'con solo la hora no hay a dónde asomarse');

        controlador.actualizarPista(SONANDO);
        controlador.establecerActividadPreferida('hora');
        igual(controlador.vistaVecina(+1), 'musica', 'desde la hora, la siguiente es la música');
        igual(controlador.vistaVecina(-1), 'musica', 'con dos vistas, las dos direcciones llevan a la otra');

        controlador.actualizarTemporizador(TEMPORIZADOR_EN_MARCHA);
        controlador.establecerActividadPreferida('hora');
        igual(controlador.vistaVecina(+1), 'musica');
        igual(controlador.vistaVecina(-1), 'temporizador', 'desde la primera, hacia atrás da la vuelta');

        controlador.actualizarGrabacion({grabando: true, transcurridoMs: 0});
        igual(controlador.vistaVecina(+1), null, 'grabando no se puede cambiar la cápsula');
        controlador.destruir();
    });

    // ───────────── Notificaciones y privacidad ─────────────

    await prueba('las notificaciones recientes se guardan y se pueden quitar', () => {
        const {controlador} = crear();
        controlador.registrarNotificacion({id: 1, titulo: 'Ana'});
        controlador.registrarNotificacion({id: 2, titulo: 'Luis'});
        igual(controlador.notificacionesRecientes.length, 2);
        controlador.quitarNotificacion(1);
        igual(controlador.notificacionesRecientes.map(n => n.id), [2]);
        controlador.limpiarNotificaciones();
        igual(controlador.notificacionesRecientes.length, 0);
        controlador.destruir();
    });

    await prueba('el estado de los modos llega a la vista', () => {
        const {controlador, registro} = crear();
        controlador.actualizarModos({noMolestar: true, avion: false});
        igual(registro.vista.modos, {noMolestar: true, avion: false});
        controlador.destruir();
    });

    await prueba('el aviso de un modo es "sin cola": con la isla abierta no aparece después', () => {
        const {controlador} = crear();
        controlador.establecerExpandido(true);
        controlador.agregarAlerta({tipo: 'modo', clave: 'modo', duracionMs: 2000, datos: {}, sinCola: true});
        controlador.establecerExpandido(false);
        igual(controlador.alertaActual, null);
        controlador.destruir();
    });

    await prueba('grabando la pantalla, la grabación ocupa la cápsula y la música pasa al círculo', () => {
        const {controlador, registro} = crear();
        controlador.actualizarPista(SONANDO);
        controlador.actualizarGrabacion({grabando: true, transcurridoMs: 4000});
        igual(actividades(registro), 'grabacion/musica');
        igual(registro.vista.grabacion, {grabando: true, transcurridoMs: 4000});
        verdadero(!controlador.cambiarVistaCompacta(-1), 'deslizar la cápsula rebota mientras se graba');
        controlador.actualizarGrabacion({grabando: false, transcurridoMs: 0});
        igual(actividades(registro), 'musica/null');
        controlador.destruir();
    });

    await prueba('los eventos del calendario llegan a la vista', () => {
        const {controlador, registro} = crear();
        const calendario = {hayCalendarios: true, inicioSemana: 1, eventos: [{id: 'a', titulo: 'Reunión'}]};
        controlador.actualizarCalendario(calendario);
        igual(registro.vista.calendario, calendario);
        controlador.destruir();
    });

    await prueba('en llamada, la llamada ocupa la cápsula (por delante de la grabación) y no se puede deslizar', () => {
        const {controlador, registro} = crear();
        controlador.actualizarPista(SONANDO);
        controlador.actualizarGrabacion({grabando: true, transcurridoMs: 1000});
        controlador.actualizarLlamada({enLlamada: true, id: 'meet', nombre: 'Google Meet', transcurridoMs: 3000, silenciado: false});
        igual(actividades(registro), 'llamada/musica');
        igual(registro.vista.llamada.nombre, 'Google Meet');
        verdadero(!controlador.cambiarVistaCompacta(+1), 'deslizar rebota durante la llamada');
        igual(controlador.vistaVecina(+1), null, 'no hay a dónde asomarse durante la llamada');
        controlador.actualizarLlamada({enLlamada: false, id: null, nombre: '', transcurridoMs: 0, silenciado: false});
        igual(actividades(registro), 'grabacion/musica');
        controlador.destruir();
    });

    await prueba('una llamada sonando va por delante de una notificación', () => {
        const {controlador} = crear();
        controlador.agregarAlerta({tipo: 'notificacion', clave: 'n', duracionMs: 4000, datos: {}});
        controlador.agregarAlerta({tipo: 'llamada', clave: 'llamada-1', duracionMs: 45000, datos: {}});
        igual(controlador.alertaActual.tipo, 'llamada');
        controlador.descartarAlerta('llamada-1');
        igual(controlador.alertaActual?.tipo, 'notificacion', 'al dejar de sonar vuelve la notificación');
        controlador.destruir();
    });

    await prueba('un audio de WhatsApp es una vista aparte de la música (y va primero mientras suena)', () => {
        const {controlador, registro} = crear();
        controlador.actualizarPista(SONANDO);
        controlador.actualizarAudio({titulo: 'web.whatsapp.com', tipo: 'audio', reproduciendo: true});
        igual(registro.vista.actividades.vistas, ['hora', 'musica', 'audio']);
        igual(actividades(registro), 'audio/musica');
        igual(registro.vista.audio.titulo, 'web.whatsapp.com');
        verdadero(controlador.cambiarVistaCompacta(-1), 'se puede pasar a la música');
        igual(actividades(registro), 'musica/audio');
        controlador.actualizarAudio(null);
        igual(registro.vista.actividades.vistas, ['hora', 'musica']);
        controlador.destruir();
    });

    await prueba('una llamada que suena: al ocultar su aviso queda en el círculo, y al tocarlo vuelve', () => {
        const {controlador, registro} = crear();
        controlador.actualizarDispositivos(AURICULARES);
        controlador.registrarLlamadaEntrante({clave: 'llamada-1', datos: {titulo: 'Ana'}});
        igual(controlador.alertaActual?.tipo, 'llamada');
        igual(registro.vista.actividades.secundaria, 'auriculares', 'con el aviso a la vista, el círculo no cambia');

        controlador.descartarAlerta('llamada-1');
        igual(registro.vista.actividades.secundaria, 'llamada-entrante', 'aviso oculto → círculo de la llamada');

        controlador.mostrarLlamadaEntrante();
        igual(controlador.alertaActual?.clave, 'llamada-1', 'tocar el círculo vuelve a mostrar el aviso');

        controlador.quitarLlamadaEntrante('llamada-1');
        igual(controlador.alertaActual, null);
        igual(registro.vista.actividades.secundaria, 'auriculares', 'al dejar de sonar, el círculo vuelve a lo de antes');
        controlador.destruir();
    });

    await prueba('el estado de privacidad llega a la vista', () => {
        const {controlador, registro} = crear();
        igual(registro.vista?.privacidad ?? {microfono: false, camara: false, pantalla: false},
            {microfono: false, camara: false, pantalla: false});
        controlador.actualizarPrivacidad({microfono: true, camara: false, pantalla: true});
        igual(registro.vista.privacidad, {microfono: true, camara: false, pantalla: true});
        controlador.destruir();
    });
});

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

    await prueba('el estado de privacidad llega a la vista', () => {
        const {controlador, registro} = crear();
        igual(registro.vista?.privacidad ?? {microfono: false, camara: false, pantalla: false},
            {microfono: false, camara: false, pantalla: false});
        controlador.actualizarPrivacidad({microfono: true, camara: false, pantalla: true});
        igual(registro.vista.privacidad, {microfono: true, camara: false, pantalla: true});
        controlador.destruir();
    });
});

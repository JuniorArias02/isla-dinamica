// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Extensión SOLO DE PRUEBA. La carga aislado.sh junto a la Isla Dinámica en un
 * GNOME Shell sin pantalla y comprueba que la isla se activa, funciona y se
 * desactiva sin dejar nada atrás. Escribe sus resultados con el prefijo [prueba].
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

const UUID_ISLA = 'isla-dinamica@juniorarias02';
const ESTADO_ACTIVA = 1;

const esperar = ms => new Promise(resolver => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolver();
        return GLib.SOURCE_REMOVE;
    });
});

/**
 * GNOME reinicia esta extensión cuando la prueba desactiva y reactiva la isla
 * (reinicia las que se activaron después). La prueba debe correr una sola vez.
 */
let yaEjecutada = false;

const anotar = mensaje => console.log(`[prueba] ${mensaje}`);
const comprobar = (condicion, descripcion) => anotar(`${condicion ? '✔' : '✘'} ${descripcion}`);

/** Actores de la isla que siguen en pantalla (por su clase CSS). */
function actoresDeLaIsla() {
    const encontrados = [];
    const recorrer = actor => {
        if (actor.style_class?.split(' ').some(clase => clase.startsWith('isla-')))
            encontrados.push(actor.style_class);
        actor.get_children().forEach(recorrer);
    };
    recorrer(global.stage);
    return encontrados;
}

export default class PruebaIsla extends Extension {
    enable() {
        if (yaEjecutada)
            return;
        yaEjecutada = true;
        this._ejecutar()
            .catch(error => anotar(`✘ Error inesperado: ${error}\n${error.stack}`))
            .finally(() => anotar('FIN'));
    }

    disable() {}

    async _ejecutar() {
        await esperar(2500);
        const relojGnome = Main.panel.statusArea.dateMenu._clockDisplay;

        // ───── Activación ─────
        const info = Main.extensionManager.lookup(UUID_ISLA);
        comprobar(info?.state === ESTADO_ACTIVA, 'la isla se activa');
        const isla = info.stateObj;
        comprobar(Boolean(Main.panel.statusArea[UUID_ISLA]), 'la cápsula está en el panel');
        comprobar(!relojGnome.visible, 'el texto del reloj de Ubuntu está oculto');

        // ───── Funcionamiento ─────
        isla._controlador.agregarAlerta({
            tipo: 'notificacion',
            clave: 'prueba',
            duracionMs: 5000,
            datos: {titulo: 'Prueba', detalle: 'Mensaje de prueba', aplicacion: null},
        });
        await esperar(800);
        comprobar(isla._isla._tarjeta.visible, 'una alerta abre la tarjeta flotante');
        isla._controlador.descartarAlerta('prueba');
        await esperar(1000);

        // Morfosis con contenido que cambia de tamaño: volumen y la página de música.
        // aislado.sh revisa después que GNOME no avise de actores sin tamaño válido.
        isla._controlador.agregarAlerta({
            tipo: 'indicador',
            clave: 'indicador',
            duracionMs: 1500,
            sinCola: true,
            datos: {tipo: 'volumen', gicon: new Gio.ThemedIcon({name: 'audio-volume-high-symbolic'}), nivel: 0.6, maximo: 1},
        });
        await esperar(2500);
        comprobar(!isla._isla._tarjeta.visible, 'la alerta de volumen se abre y se cierra');

        isla._controlador.actualizarPista({
            titulo: 'Canción de prueba', artista: 'Artista', album: '', aplicacion: 'Reproductor',
            reproduciendo: true, duracionUs: 200_000_000, puedeBuscar: true, puedeAlternar: true,
            puedeSiguiente: true, puedeAnterior: true, puedeMostrar: false, urlCaratula: null,
            nombreBus: 'org.mpris.MediaPlayer2.prueba', entradaEscritorio: null,
        });
        isla._controlador.establecerActividadPreferida('musica');
        // Como el usuario: clic con la música en la cápsula → la isla se abre en Música.
        isla._isla._abrir();
        await esperar(1500);
        // Al pasar de canción, Brave vacía los datos un momento: la página de música no debe desaparecer.
        const pistaPrueba = isla._controlador._pista;
        isla._controlador.actualizarPista({...pistaPrueba, cargando: true, duracionUs: 0});
        await esperar(400);
        comprobar(isla._isla._expandida.paginaVisible === 'musica', 'al pasar de canción se queda en Música (esqueleto)');
        isla._controlador.actualizarPista(pistaPrueba);
        await esperar(400);
        isla._controlador.establecerExpandido(false);
        await esperar(1500);
        comprobar(!isla._isla._tarjeta.visible, 'la isla abierta en Música se cierra del todo');

        // Con la cápsula en la hora, la isla se abre en el calendario.
        isla._controlador.actualizarPista(null);
        isla._isla._abrir();
        await esperar(1200);
        comprobar(isla._isla._expandida.paginaVisible === 'calendario', 'desde la hora, la isla se abre en el calendario');
        isla._controlador.establecerExpandido(false);
        await esperar(1200);

        // Temporizador: arrastrar una rueda con el ratón la mueve y NO cierra la isla.
        isla._isla._paginaSolicitada = 'temporizador';
        isla._controlador.establecerExpandido(true);
        await esperar(1200);
        const selector = isla._isla._expandida._paginaTemporizador._selector;
        const raton = Clutter.get_default_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const ahora = () => GLib.get_monotonic_time();
        raton.notify_absolute_motion(ahora(), 640, 500);
        await esperar(600);
        const [rx, ry] = selector._minutos.get_transformed_position();
        const [cx, cy] = [rx + selector._minutos.width / 2, ry + selector._minutos.height / 2];
        const minutosAntes = selector._minutos.valor;
        raton.notify_absolute_motion(ahora(), cx, cy);
        await esperar(200);
        raton.notify_button(ahora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        for (let paso = 1; paso <= 8; paso++) {
            await esperar(20);
            raton.notify_absolute_motion(ahora(), cx, cy - paso * 8);
        }
        raton.notify_button(ahora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        await esperar(900);
        comprobar(isla._controlador.estado === 'expandido' && selector._minutos.valor !== minutosAntes,
            'arrastrar una rueda del temporizador la mueve sin cerrar la isla');
        const elegidos = selector.segundos;
        isla._isla._expandida._paginaTemporizador._botonIniciar.emit('clicked', 1);
        await esperar(400);
        comprobar(isla._temporizador.resumen.totalMs === elegidos * 1000, '"Iniciar" usa la duración de las ruedas');
        isla._temporizador.cancelar();
        isla._controlador.establecerExpandido(false);
        await esperar(1200);

        // Grabación de pantalla: la cápsula muestra el contador y el indicador de GNOME se oculta.
        // (Aquí no existe el servicio de grabación real: sin la marca "arrancando", GNOME la
        // daría por fallida al instante.)
        Main.screenshotUI._screencastStarting = true;
        Main.screenshotUI._setScreencastInProgress(true);
        await esperar(1300);
        const pildora = isla._isla._boton.pildora;
        comprobar(pildora._grabacion.visible && pildora._tiempoGrabacion.text === '0:01',
            'grabando la pantalla, la cápsula muestra el contador');
        comprobar(!Main.panel.statusArea.screenRecording.container.visible, 'el indicador de grabación de GNOME se oculta');
        delete Main.screenshotUI._screencastStarting;
        isla._grabacion.detener();
        await esperar(800);
        comprobar(!pildora._grabacion.visible && Main.panel.statusArea.screenRecording.container.visible,
            'al detener, la cápsula vuelve y el indicador de GNOME también');

        // Aviso de la herramienta de captura (misma fuente que GNOME): alerta propia, no notificación.
        const fuenteCapturas = new MessageTray.Source({title: 'Captura de pantalla', iconName: 'screenshooter-symbolic'});
        Main.messageTray.add(fuenteCapturas);
        fuenteCapturas.addNotification(new MessageTray.Notification({
            source: fuenteCapturas, title: 'Grabación de pantalla guardada', isTransient: true,
        }));
        await esperar(800);
        comprobar(isla._controlador.alertaActual?.tipo === 'grabacion', 'el aviso de GNOME de grabación guardada se muestra como alerta propia');
        isla._controlador.descartarAlerta('grabacion');
        await esperar(1200);

        // Cambio de vista en la cápsula: morfosis contraer → círculo → florecer.
        const capsula = isla._isla._boton.pildora;
        isla._controlador.establecerActividadPreferida('hora');
        isla._controlador.actualizarPista({...pistaPrueba, reproduciendo: true});
        await esperar(1000);
        isla._isla._cambiarVista(+1);
        let anchoMinimo = Infinity;
        for (let paso = 0; paso < 12; paso++) {
            await esperar(25);
            anchoMinimo = Math.min(anchoMinimo, capsula.width);
        }
        await esperar(900);
        comprobar(anchoMinimo <= capsula.height + 6 && capsula._modo === 'musica' &&
            capsula._hijosDeContenido().every(hijo => hijo.opacity === 255 && hijo.scale_x === 1),
        'al deslizar, la cápsula pasa por un círculo y florece con el contenido nuevo nítido');

        // Arrastrar la cápsula: la vista de al lado se asoma siguiendo al puntero y solo se queda al soltar.
        const boton = isla._isla._boton;
        const [qx, qy] = capsula.get_transformed_position();
        const [ax, ay] = [qx + capsula.width / 2, qy + capsula.height / 2];
        const arrastrar = async (desde, hasta) => {
            for (let paso = 1; paso <= 8; paso++) {
                raton.notify_absolute_motion(ahora(), ax + desde + (hasta - desde) * paso / 8, ay);
                await esperar(20);
            }
        };
        const principal = () => isla._controlador._calcularActividades().principal;
        const vistaAntes = principal();
        raton.notify_absolute_motion(ahora(), ax, ay);
        await esperar(200);
        raton.notify_button(ahora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        await arrastrar(0, 60);
        const progresoIda = boton.progresoAsomo;
        const vistaDeAlLado = boton.objetivoAsomo;
        await arrastrar(60, -20);
        const progresoVuelta = boton.progresoAsomo;
        raton.notify_button(ahora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        await esperar(900);
        comprobar(progresoIda > 0.3 && progresoIda < 0.7 && progresoVuelta === 0 &&
            principal() === vistaAntes && !boton.asomoActivo,
        'arrastrar la cápsula asoma la vista de al lado y, al volver sin soltar, no cambia');

        raton.notify_absolute_motion(ahora(), ax, ay);
        await esperar(200);
        raton.notify_button(ahora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        await arrastrar(0, 160);
        raton.notify_button(ahora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        await esperar(1200);
        comprobar(Boolean(vistaDeAlLado) && principal() === vistaDeAlLado && !boton.asomoActivo &&
            boton._caja.visible && !Main.panel.statusArea.dateMenu.menu.isOpen,
        'al soltar pasada la mitad se queda la vista de al lado (aunque el puntero salga de la cápsula)');

        // Estilo: Liquid Glass por defecto; "Negro clásico" quita el vidrio al instante.
        const conVidrio = () => isla._isla._boton.has_style_class_name('isla-cristal') &&
            isla._isla._tarjeta.has_style_class_name('isla-cristal') &&
            isla._isla._boton._raiz.vidrios[0].vidrio.visible && isla._isla._tarjeta._vidrio.visible;
        const vidrioAlEmpezar = conVidrio();
        isla.getSettings().set_string('estilo-isla', 'clasico');
        await esperar(300);
        const sinVidrio = !isla._isla._boton.has_style_class_name('isla-cristal') &&
            !isla._isla._boton._raiz.vidrios[0].vidrio.visible && !isla._isla._tarjeta._vidrio.visible;
        isla.getSettings().set_string('estilo-isla', 'cristal');
        await esperar(300);
        comprobar(vidrioAlEmpezar && sinVidrio && conVidrio(), 'el estilo Liquid Glass se aplica por defecto y se puede cambiar a negro clásico');

        // Ajuste "Cambiar al instante" (el arrastre de la 1.0): sin asomo; al soltar cambia por el círculo.
        const configuracion = isla.getSettings();
        configuracion.set_string('arrastre-capsula', 'cambiar');
        await esperar(300);
        const {vistas} = isla._controlador._calcularActividades();
        const vistaAntesDirecto = principal();
        const esperada = vistas[vistas.indexOf(vistaAntesDirecto) - 1] ?? vistaAntesDirecto;
        const [bx, by] = capsula.get_transformed_position();
        const [mx, my] = [bx + capsula.width / 2, by + capsula.height / 2];
        raton.notify_absolute_motion(ahora(), mx, my);
        await esperar(200);
        raton.notify_button(ahora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        for (let paso = 1; paso <= 8; paso++) {
            raton.notify_absolute_motion(ahora(), mx + paso * 7, my);
            await esperar(20);
        }
        const sinAsomo = !boton.asomoActivo && capsula.translation_x > 0;
        raton.notify_button(ahora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        await esperar(1200);
        comprobar(sinAsomo && principal() === esperada && capsula.translation_x === 0,
            'con "Cambiar al instante", arrastrar estira la cápsula y al soltar cambia de vista como en la 1.0');
        configuracion.set_string('arrastre-capsula', 'asomar');

        // Llamada sonando (WhatsApp con botones): alerta propia; el botón verde pulsa "Contestar".
        let botonPulsado = null;
        const fuenteLlamada = new MessageTray.Source({title: 'WhatsApp Web', iconName: 'call-start-symbolic'});
        Main.messageTray.add(fuenteLlamada);
        const avisoLlamada = new MessageTray.Notification({
            source: fuenteLlamada, title: 'Ana', body: 'web.whatsapp.com\nLlamada de voz entrante',
        });
        avisoLlamada.addAction('Rechazar', () => {
            botonPulsado = 'rechazar';
        });
        avisoLlamada.addAction('Contestar', () => {
            botonPulsado = 'contestar';
        });
        fuenteLlamada.addNotification(avisoLlamada);
        await esperar(1200);
        comprobar(isla._controlador.alertaActual?.tipo === 'llamada', 'una llamada de WhatsApp sale como llamada entrante');
        const botonContestar = isla._isla._alertas.llamada.vista._botonContestar;
        const [lx, ly] = botonContestar.get_transformed_position();
        raton.notify_absolute_motion(ahora(), lx + botonContestar.width / 2, ly + botonContestar.height / 2);
        await esperar(200);
        raton.notify_button(ahora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        await esperar(80);
        raton.notify_button(ahora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        await esperar(800);
        comprobar(botonPulsado === 'contestar' && isla._controlador.alertaActual?.tipo !== 'llamada',
            'el botón verde de la isla contesta con el botón del aviso');
        raton.notify_absolute_motion(ahora(), 640, 500);

        // Llamada en curso: la cápsula la muestra y al tocarla se abre su página.
        isla._controlador.actualizarLlamada({enLlamada: true, id: 'meet', nombre: 'Google Meet', transcurridoMs: 5000, silenciado: false});
        await esperar(1000);
        isla._isla._abrir();
        await esperar(1200);
        comprobar(capsula.modo === 'llamada' && isla._isla._expandida.paginaVisible === 'llamada',
            'en llamada, la cápsula muestra el contador y abre la página de la llamada');
        isla._controlador.establecerExpandido(false);
        isla._controlador.actualizarLlamada({enLlamada: false, id: null, nombre: '', transcurridoMs: 0, silenciado: false});
        await esperar(1200);

        // Audio de WhatsApp (como lo manda Brave): vista y página propias, solo reproducir/pausa.
        isla._controlador.actualizarAudio({
            ...pistaPrueba, reproduciendo: true, titulo: 'web.whatsapp.com', artista: '', duracionUs: 30000000,
            tipo: 'audio', appAudio: {id: 'whatsapp', nombre: 'WhatsApp', entradasEscritorio: []},
        });
        await esperar(1200);
        // (Con notificaciones sin ver, la isla se abriría en ellas: se pide la página directamente.)
        isla._isla._paginaSolicitada = 'audio';
        isla._controlador.establecerExpandido(true);
        await esperar(1200);
        const paginaAudio = isla._isla._expandida._paginaAudio;
        comprobar(capsula.modo === 'audio' && isla._isla._expandida.paginaVisible === 'audio' &&
            !paginaAudio._botonSiguiente.visible && paginaAudio._titulo.text === 'Audio de WhatsApp',
        'un audio de WhatsApp tiene su propia vista y página (sin anterior ni siguiente), aparte de la música');
        isla._controlador.establecerExpandido(false);
        isla._controlador.actualizarAudio(null);
        await esperar(1200);

        // Una llamada que suena y se oculta queda en el círculo; al tocarlo, vuelve.
        isla._controlador.registrarLlamadaEntrante({clave: 'llamada-prueba', datos: {
            titulo: 'Ana', aplicacion: {id: 'whatsapp', nombre: 'WhatsApp'}, llamada: {esVideo: false, contestar: null, rechazar: null},
        }});
        await esperar(1000);
        isla._isla._descartarDeslizando();
        await esperar(1200);
        const enCirculo = isla._isla._boton.burbuja.tipo === 'llamada-entrante';
        isla._controlador.mostrarLlamadaEntrante();
        await esperar(800);
        comprobar(enCirculo && isla._controlador.alertaActual?.clave === 'llamada-prueba',
            'una llamada que suena y se oculta queda en el círculo, y vuelve al tocarlo');
        isla._controlador.quitarLlamadaEntrante('llamada-prueba');
        await esperar(1200);

        // "No molestar" por la vía real (lo mismo que el interruptor de Ajustes rápidos).
        const notificaciones = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        notificaciones.set_boolean('show-banners', false);
        await esperar(800);
        const alerta = isla._controlador.alertaActual;
        comprobar(alerta?.tipo === 'modo' && alerta.datos.activo, 'activar "No molestar" muestra su aviso');
        await esperar(2500);
        // Por defecto, "No molestar" también silencia la isla.
        GLib.spawn_async(null, ['notify-send', '-a', 'Brave Web Browser', 'Ana', 'web.whatsapp.com\nHola'],
            null, GLib.SpawnFlags.SEARCH_PATH, null);
        await esperar(1200);
        comprobar(isla._controlador.alertaActual?.tipo !== 'notificacion', 'con "No molestar", un mensaje no aparece en la isla');
        notificaciones.set_boolean('show-banners', true);
        await esperar(3000);

        // Menú del clic derecho y ventana de ajustes.
        isla._isla._abrirMenu();
        await esperar(400);
        comprobar(isla._isla._menu.abierto, 'el clic derecho abre el menú');
        isla._isla._menu.alternar();
        await esperar(400);
        isla._isla._acciones.abrirAjustes();
        let ventanaAjustes = false;
        for (let intento = 0; intento < 20 && !ventanaAjustes; intento++) {
            await esperar(500);
            ventanaAjustes = global.get_window_actors().some(a => a.meta_window.get_title() === 'Isla Dinámica');
        }
        comprobar(ventanaAjustes, '"Ajustes de la isla" abre la ventana de ajustes');

        isla._controlador.actualizarPrivacidad({microfono: true, camara: false, pantalla: false});
        await esperar(300);
        comprobar(isla._isla._boton.pildora._puntosPrivacidad.microfono.visible, 'se ve el punto del micrófono');

        // ───── Desactivación: no debe quedar nada ─────
        Main.extensionManager.disableExtension(UUID_ISLA);
        await esperar(800);
        comprobar(!Main.panel.statusArea[UUID_ISLA], 'al desactivar, la cápsula sale del panel');
        comprobar(relojGnome.visible, 'al desactivar, el reloj de Ubuntu vuelve');
        comprobar(!Object.prototype.hasOwnProperty.call(Main.messageTray, '_showNotification'),
            'al desactivar, las notificaciones vuelven a GNOME');
        comprobar(!Object.prototype.hasOwnProperty.call(Main.osdWindowManager, 'show') &&
            !Object.prototype.hasOwnProperty.call(Main.osdWindowManager, 'showAll'),
        'al desactivar, el volumen y el brillo vuelven a GNOME');
        const restos = actoresDeLaIsla();
        comprobar(restos.length === 0, `al desactivar no quedan actores de la isla${restos.length ? `: ${restos.join(', ')}` : ''}`);

        // ───── Reactivación ─────
        Main.extensionManager.enableExtension(UUID_ISLA);
        await esperar(1000);
        comprobar(Main.extensionManager.lookup(UUID_ISLA)?.state === ESTADO_ACTIVA, 'se vuelve a activar sin errores');
    }
}

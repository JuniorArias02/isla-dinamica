// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * CapturadorNotificaciones — Capa 3 (servicio de notificaciones).
 *
 * GNOME Shell decide en Main.messageTray cuándo debe mostrarse una
 * notificación como banner (respeta "No molestar", pantalla completa,
 * urgencia baja y la configuración de cada app). Justo en ese punto
 * (_showNotification) la isla toma la notificación y la muestra en la
 * cápsula en lugar del banner nativo, así no aparece duplicada.
 *
 * La notificación se marca como vista igual que hace GNOME y sigue
 * guardada en el historial del calendario.
 *
 * Excepción: las notificaciones CRÍTICAS (ej. batería agotándose) siguen
 * usando el banner nativo porque requieren más espacio y atención.
 *
 * Al desactivar la extensión se restaura el método original.
 *
 * "No molestar": GNOME descarta el aviso antes de llegar a _showNotification.
 * Por eso, mientras está activo, la isla escucha un paso antes (la señal
 * 'notification-added' de cada fuente) y muestra la notificación en modo
 * SILENCIOSO (sin sonido, con una luna). La notificación queda sin leer en GNOME.
 *
 * Además enriquece los datos para la isla: de qué app viene realmente
 * (WhatsApp Web llega como "Brave"), su icono real, la foto del contacto si
 * la hay, y una clave de conversación para agrupar mensajes del mismo chat.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {ajuste, AJUSTES} from '../../ajustes.js';
import {registrarAviso, registrarDepuracion, registrarError, protegido} from '../../registro.js';
import {reconocerApp, separarOrigen} from './reconocedorApps.js';

/**
 * Copia propia de las fotos de las notificaciones: los navegadores las guardan en
 * /tmp y las BORRAN al cerrarse la notificación, y la isla las sigue mostrando
 * después (página "Notificaciones"). Es solo caché: se vacía al iniciar.
 */
const CARPETA_FOTOS = GLib.build_filenamev([GLib.get_user_cache_dir(), 'isla-dinamica', 'fotos']);

export class CapturadorNotificaciones {
    /**
     * @param {object} manejadores
     * @param {Function} manejadores.alRecibir - Recibe (id, datos) de la notificación.
     * @param {Function} manejadores.alCerrar - Recibe el id de una notificación cerrada.
     */
    constructor({alRecibir, alCerrar}) {
        this._alRecibir = alRecibir;
        this._alCerrar = alCerrar;
        this._metodoOriginal = null;
        this._metodoPropio = null;
        this._idReintento = 0;
        this._contador = 0;

        /** @type {Map<object, number>} notificación → id de su señal 'destroy'. */
        this._senalesDestruccion = new Map();
    }

    /** Reemplaza MessageTray._showNotification por la versión de la isla. */
    iniciar() {
        this._vaciarCacheFotos();

        const bandeja = Main.messageTray;
        if (Object.prototype.hasOwnProperty.call(bandeja, '_showNotification'))
            registrarAviso(`Otra extensión ya modificó las notificaciones; se encadena con ella.`);

        this._metodoOriginal = bandeja._showNotification;
        const capturador = this;

        this._metodoPropio = function () {
            // `this` es Main.messageTray.
            const siguiente = this._notificationQueue[0];
            if (!siguiente || siguiente.urgency === MessageTray.Urgency.CRITICAL)
                return capturador._metodoOriginal.call(this);

            try {
                this._notificationQueue.shift();
                this.emit('queue-changed');

                // Mismo efecto que el banner nativo: se marca como vista y suena.
                siguiente.acknowledged = true;
                siguiente.playSound();

                capturador._entregar(siguiente);
            } catch (error) {
                // Si la isla falla, la notificación no se pierde: va al banner nativo.
                registrarError('notificaciones: capturar banner', error);
                if (!this._notificationQueue.includes(siguiente))
                    this._notificationQueue.unshift(siguiente);
                return capturador._metodoOriginal.call(this);
            }

            // GNOME procesa un elemento por ciclo: si quedan más en cola, se revisan luego.
            if (this._notificationQueue.length > 0)
                capturador._programarRevision();
            return undefined;
        };

        bandeja._showNotification = this._metodoPropio;

        this._escucharNoMolestar();
    }

    /**
     * Sigue el interruptor "No molestar" de GNOME y, por si se activa, escucha
     * la llegada de notificaciones en todas las fuentes (apps).
     */
    _escucharNoMolestar() {
        // Esquema org.gnome.desktop.notifications · clave show-banners (false = "No molestar").
        this._ajustes = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        this._ajustes.connectObject('changed::show-banners',
            protegido('notificaciones: cambio de No molestar', () => this._actualizarNoMolestar()), this);
        this._actualizarNoMolestar();

        const alAgregarse = protegido('notificaciones: llegada en No molestar',
            (_fuente, notificacion) => this._alAgregarseNotificacion(notificacion));
        const escucharFuente = fuente => fuente.connectObject('notification-added', alAgregarse, this);

        // Señal source-added de Main.messageTray (una por app que notifica).
        Main.messageTray.connectObject('source-added',
            protegido('notificaciones: nueva fuente', (_bandeja, fuente) => escucharFuente(fuente)), this);
        Main.messageTray.getSources().forEach(escucharFuente);
    }

    _actualizarNoMolestar() {
        this._noMolestar = !this._ajustes.get_boolean('show-banners');
        registrarDepuracion(`"No molestar" ${this._noMolestar ? 'activado' : 'desactivado'}` +
            `${this._noMolestar && ajuste(AJUSTES.NOTIFICAR_EN_NO_MOLESTAR) ? ': la isla seguirá avisando en silencio.' : '.'}`);
    }

    /**
     * Llega una notificación a GNOME. Solo se usa con "No molestar" activo
     * (si no, la captura normal en _showNotification ya se encarga).
     * @param {MessageTray.Notification} notificacion
     */
    _alAgregarseNotificacion(notificacion) {
        if (!this._noMolestar || !ajuste(AJUSTES.NOTIFICAR_EN_NO_MOLESTAR))
            return;
        // Baja urgencia: tampoco se muestra normalmente. Críticas: GNOME ya muestra su aviso.
        if (notificacion.urgency === MessageTray.Urgency.LOW ||
            notificacion.urgency === MessageTray.Urgency.CRITICAL ||
            notificacion.acknowledged)
            return;
        // Con una ventana en pantalla completa (película, presentación), ni la isla molesta.
        if (Main.layoutManager.primaryMonitor?.inFullscreen)
            return;
        // Silenciosa: sin sonido y sin marcarla como vista (sigue sin leer en GNOME).
        this._entregar(notificacion, {silenciosa: true});
    }

    /** Restaura el comportamiento original de GNOME y suelta las señales. */
    destruir() {
        const bandeja = Main.messageTray;
        bandeja.disconnectObject(this);
        bandeja.getSources().forEach(fuente => fuente.disconnectObject(this));
        this._ajustes?.disconnectObject(this);
        this._ajustes = null;

        if (bandeja._showNotification === this._metodoPropio) {
            // Si el original venía del prototipo, basta con borrar la propiedad propia.
            if (this._metodoOriginal === Object.getPrototypeOf(bandeja)._showNotification)
                delete bandeja._showNotification;
            else
                bandeja._showNotification = this._metodoOriginal;
        } else if (this._metodoPropio) {
            registrarAviso(`Otra extensión modificó las notificaciones después; no se puede restaurar limpiamente.`);
        }

        if (this._idReintento) {
            GLib.source_remove(this._idReintento);
            this._idReintento = 0;
        }

        for (const [notificacion, id] of this._senalesDestruccion)
            notificacion.disconnect(id);
        this._senalesDestruccion.clear();

        this._metodoOriginal = null;
        this._metodoPropio = null;
        this._alRecibir = null;
        this._alCerrar = null;
    }

    // ───────────────────────── Métodos privados ─────────────────────────

    _programarRevision() {
        if (this._idReintento)
            return;

        this._idReintento = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._idReintento = 0;
            try {
                Main.messageTray._updateState();
            } catch (error) {
                registrarError('notificaciones: revisar cola', error);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Extrae los datos de la notificación y se los entrega a la isla.
     * @param {MessageTray.Notification} notificacion
     */
    /**
     * @param {MessageTray.Notification} notificacion
     * @param {object} [opciones]
     * @param {boolean} [opciones.silenciosa=false] - Llegó con "No molestar" activo.
     */
    _entregar(notificacion, {silenciosa = false} = {}) {
        const id = `notificacion-${this._contador++}`;

        if (!this._senalesDestruccion.has(notificacion)) {
            const idSenal = notificacion.connect('destroy', () => {
                this._senalesDestruccion.delete(notificacion);
                this._alCerrar?.(id);
            });
            this._senalesDestruccion.set(notificacion, idSenal);
        }

        const fuente = notificacion.source;
        const nombreFuente = fuente?.title ?? '';
        const idAppFuente = fuente?.app?.get_id?.() ?? null;

        // El navegador a veces pone la web de origen en una línea aparte: se separa del texto.
        const {origen, texto} = separarOrigen(this._quitarMarcado(notificacion.body, notificacion.useBodyMarkup));
        const app = reconocerApp({nombreApp: nombreFuente, idApp: idAppFuente, origen});
        const titulo = notificacion.title || nombreFuente || 'Notificación';

        const viva = () => this._senalesDestruccion.has(notificacion);
        const datos = {
            id,
            titulo,
            detalle: texto,
            aplicacion: {
                id: app?.id ?? null,
                nombre: app?.nombre ?? nombreFuente,
                esChat: app?.esChat ?? false,
            },
            // Mensajes del mismo chat (misma app + mismo remitente) se agrupan.
            claveConversacion: `${app?.id ?? nombreFuente}|${titulo}`,
            // Imagen propia de la notificación (normalmente la foto del contacto), con copia propia.
            imagen: this._conservarImagen(notificacion.gicon ?? null),
            // Icono de la app (el real de WhatsApp/Telegram si están instaladas como app).
            iconoApp: this._iconoDeApp(app) ?? fuente?.app?.get_icon?.() ?? fuente?.icon ?? null,
            marcaTiempoMs: Math.floor(GLib.get_real_time() / 1000),
            silenciosa,
            // Al hacer clic se abre la app emisora (como al pulsar el banner nativo).
            activar: () => {
                if (viva())
                    notificacion.activate();
                else if (fuente?.app)
                    fuente.app.activate();
            },
            // Descartarla también la quita del historial de GNOME.
            descartar: () => {
                if (viva())
                    notificacion.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
            },
        };

        // Diagnóstico SIN el contenido del mensaje (privacidad): solo datos técnicos.
        // Solo con depuración activa: una línea por notificación llenaría el journal.
        registrarDepuracion(`Notificación: fuente="${nombreFuente}" appId=${idAppFuente ?? '-'} ` +
            `reconocida=${app?.id ?? 'no'} origen=${origen ?? '-'} ` +
            `imagen=${notificacion.gicon?.constructor?.name ?? 'ninguna'} acciones=${notificacion.actions?.length ?? 0}` +
            `${silenciosa ? ' (No molestar)' : ''}`);

        try {
            this._alRecibir?.(id, datos);
        } catch (error) {
            registrarError('notificaciones: entregar a la isla', error);
        }
    }

    /**
     * Si la foto es un archivo temporal, guarda una copia en la caché de la isla
     * (el navegador lo borrará al cerrarse la notificación).
     * El nombre es la huella del contenido: fotos distintas nunca comparten nombre
     * (St guarda en memoria las imágenes por ruta) y las repetidas no se duplican.
     * @param {Gio.Icon|null} imagen
     * @returns {Gio.Icon|null}
     */
    _conservarImagen(imagen) {
        if (!(imagen instanceof Gio.FileIcon))
            return imagen;
        const origen = imagen.get_file();
        const ruta = origen.get_path();
        if (!ruta || ruta.startsWith(CARPETA_FOTOS))
            return imagen;
        try {
            // Archivos pequeños (unos KB) en /tmp: copia directa, sin coste apreciable.
            const [, contenido] = origen.load_contents(null);
            const huella = GLib.compute_checksum_for_data(GLib.ChecksumType.MD5, contenido);
            GLib.mkdir_with_parents(CARPETA_FOTOS, 0o700);
            const destino = Gio.File.new_for_path(GLib.build_filenamev([CARPETA_FOTOS, `${huella}.img`]));
            if (!destino.query_exists(null))
                destino.replace_contents(contenido, null, false, Gio.FileCreateFlags.PRIVATE, null);
            return new Gio.FileIcon({file: destino});
        } catch (error) {
            // El navegador ya borró el archivo (pasa con carpetas temporales que limpia enseguida):
            // sin foto, la isla muestra el icono de la app (ej. WhatsApp) en vez de un círculo vacío.
            if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                registrarDepuracion(`Notificaciones: la foto ya no existe (${ruta}); se usa el icono de la app.`);
                return null;
            }
            registrarAviso(`Notificaciones: no se pudo copiar la foto (${error.message}); se usa la original.`);
            return imagen;
        }
    }

    /** Borra las fotos guardadas en sesiones anteriores (asíncrono). */
    _vaciarCacheFotos() {
        const carpeta = Gio.File.new_for_path(CARPETA_FOTOS);
        carpeta.enumerate_children_async('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_LOW, null, (_carpeta, resultado) => {
                let enumerador;
                try {
                    enumerador = carpeta.enumerate_children_finish(resultado);
                } catch (error) {
                    // Normalmente la carpeta aún no existe: no hay nada que borrar.
                    registrarDepuracion(`Notificaciones: caché de fotos no vaciada (${error.message}).`);
                    return;
                }
                let info;
                while ((info = enumerador.next_file(null)))
                    enumerador.get_child(info).delete_async(GLib.PRIORITY_LOW, null, null);
                enumerador.close(null);
            });
    }

    /** Icono real de una app reconocida, si está instalada (ej. la app "WhatsApp Web" de Brave). */
    _iconoDeApp(app) {
        if (!app)
            return null;
        const sistema = Shell.AppSystem.get_default();
        for (const entrada of app.entradasEscritorio) {
            const instalada = sistema.lookup_app(`${entrada}.desktop`);
            if (instalada)
                return instalada.get_icon();
        }
        return null;
    }

    /** Quita etiquetas de marcado (conserva los saltos de línea para separar el origen). */
    _quitarMarcado(texto, tieneMarcado) {
        if (!texto)
            return '';
        if (!tieneMarcado)
            return texto;
        return texto.replace(/<[^>]*>/g, '')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
    }
}

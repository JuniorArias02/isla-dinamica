/**
 * PaginaNotificaciones — página del carrusel con las notificaciones recientes,
 * AGRUPADAS POR CHAT (una fila por persona/conversación).
 *
 *   Notificaciones                                   Borrar
 *   [foto] Juan Pérez        WhatsApp · hace 2 min      ✕
 *          3 mensajes nuevos
 *          Quedó brutal la animación 🔥
 *   [foto] Mamá              WhatsApp · hace 5 min      ✕
 *          Ya llegué
 *
 * Clic en una fila → abre ese chat (la última notificación del grupo).
 * ✕ → descarta todo el chat (también de GNOME). "Borrar" → descarta todas.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {protegido} from '../../registro.js';
import {agregarEfectoPulsacion} from '../animaciones.js';
import {formatearHace, textoMensajesNuevos} from '../formato.js';
import {Avatar} from '../componentes/avatar.js';
import {textoVisible} from './alertaNotificacion.js';

/** Filas visibles como máximo (para que la isla no crezca demasiado). */
const FILAS_VISIBLES = 4;

/**
 * Agrupa las notificaciones por chat, conservando el orden (el chat más reciente primero).
 * Las que no son de chat (sistema, correo...) van cada una en su propio grupo.
 * @param {object[]} notificaciones - La más nueva primero.
 * @returns {{clave: string, ultima: object, ids: string[], cantidad: number}[]}
 */
export function agruparPorChat(notificaciones) {
    const grupos = new Map();
    for (const notificacion of notificaciones) {
        const clave = notificacion.aplicacion?.esChat ? notificacion.claveConversacion : notificacion.id;
        let grupo = grupos.get(clave);
        if (!grupo) {
            grupo = {clave, ultima: notificacion, ids: [], cantidad: 0};
            grupos.set(clave, grupo);
        }
        grupo.ids.push(notificacion.id);
        grupo.cantidad++;
    }
    return [...grupos.values()];
}

/** Una notificación de la lista. */
const FilaNotificacion = GObject.registerClass(
class FilaNotificacion extends St.BoxLayout {
    /**
     * @param {object} acciones - {activar(id), descartar(id)}
     */
    _init(acciones) {
        super._init({style_class: 'isla-fila-notificacion'});
        this._grupo = null;

        const contenido = new St.BoxLayout({
            style_class: 'isla-fila-notificacion-contenido',
            // St.Button centra a su hijo: se fuerza a ocupar todo y alinear a la izquierda.
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._avatar = new Avatar({tamano: 34, tamanoInsignia: 15});

        const textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        const cabecera = new St.BoxLayout({style_class: 'isla-fila-notificacion-cabecera'});
        this._titulo = new St.Label({style_class: 'isla-fila-notificacion-titulo', x_expand: true});
        this._meta = new St.Label({style_class: 'isla-fila-notificacion-meta', y_align: Clutter.ActorAlign.CENTER});
        cabecera.add_child(this._titulo);
        cabecera.add_child(this._meta);
        this._contador = new St.Label({style_class: 'isla-alerta-contador'});
        this._cuerpo = new St.Label({style_class: 'isla-fila-notificacion-cuerpo'});
        textos.add_child(cabecera);
        textos.add_child(this._contador);
        textos.add_child(this._cuerpo);

        contenido.add_child(this._avatar);
        contenido.add_child(textos);

        // Fila y botón de cerrar son hermanos (no anidados) para que cada clic vaya a su sitio.
        const botonAbrir = new St.Button({
            style_class: 'isla-fila-notificacion-boton',
            child: contenido,
            x_expand: true,
            can_focus: true,
        });
        // Abre el chat con la notificación más reciente del grupo; las demás del chat se retiran.
        botonAbrir.connect('clicked', protegido('notificaciones: abrir chat', () => {
            const [ultimaId, ...anteriores] = this._grupo?.ids ?? [];
            anteriores.forEach(id => acciones.descartar(id));
            if (ultimaId)
                acciones.activar(ultimaId);
        }));

        const botonCerrar = new St.Button({
            style_class: 'isla-fila-notificacion-cerrar',
            child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 12}),
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
        });
        botonCerrar.connect('clicked', protegido('notificaciones: descartar chat',
            () => (this._grupo?.ids ?? []).forEach(id => acciones.descartar(id))));
        agregarEfectoPulsacion(botonCerrar);

        this.add_child(botonAbrir);
        this.add_child(botonCerrar);
    }

    /** @param {{ultima: object, ids: string[], cantidad: number}} grupo - Un chat. */
    actualizar(grupo) {
        this._grupo = grupo;
        const datos = grupo.ultima;
        this._titulo.text = datos.titulo;
        const nombreApp = datos.aplicacion?.nombre ?? '';
        const hace = formatearHace(datos.marcaTiempoMs);
        this._meta.text = nombreApp ? `${nombreApp} · ${hace}` : hace;

        this._contador.text = grupo.cantidad > 1 ? textoMensajesNuevos(grupo.cantidad) : '';
        this._contador.visible = grupo.cantidad > 1;

        this._cuerpo.text = textoVisible({...datos, cantidad: grupo.cantidad});
        this._cuerpo.visible = Boolean(this._cuerpo.text);
        this._avatar.establecer({imagen: datos.imagen ?? null, iconoApp: datos.iconoApp ?? null});
    }
});

export const PaginaNotificaciones = GObject.registerClass(
class PaginaNotificaciones extends St.BoxLayout {
    /**
     * @param {object} acciones - {activar(id), descartar(id), limpiar()}
     */
    _init(acciones) {
        super._init({
            style_class: 'isla-pagina isla-pagina-notificaciones',
            orientation: Clutter.Orientation.VERTICAL,
        });

        const cabecera = new St.BoxLayout({style_class: 'isla-pagina-notificaciones-cabecera'});
        cabecera.add_child(new St.Label({
            text: 'Notificaciones',
            style_class: 'isla-pagina-encabezado',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        const botonBorrar = new St.Button({
            label: 'Borrar',
            style_class: 'isla-boton-borrar',
            can_focus: true,
        });
        botonBorrar.connect('clicked', protegido('notificaciones: borrar todas', () => acciones.limpiar()));
        cabecera.add_child(botonBorrar);
        this.add_child(cabecera);

        this._lista = new St.BoxLayout({
            style_class: 'isla-lista-notificaciones',
            orientation: Clutter.Orientation.VERTICAL,
        });
        this.add_child(this._lista);

        this._filas = Array.from({length: FILAS_VISIBLES}, () => {
            const fila = new FilaNotificacion(acciones);
            fila.hide();
            this._lista.add_child(fila);
            return fila;
        });

        this._mas = new St.Label({style_class: 'isla-notificaciones-mas', x_align: Clutter.ActorAlign.CENTER});
        this.add_child(this._mas);
    }

    /**
     * @param {object[]} notificaciones - La más nueva primero.
     */
    actualizar(notificaciones) {
        const grupos = agruparPorChat(notificaciones);
        this._filas.forEach((fila, indice) => {
            const grupo = grupos[indice];
            fila.visible = Boolean(grupo);
            if (grupo)
                fila.actualizar(grupo);
        });
        const restantes = grupos.length - FILAS_VISIBLES;
        this._mas.text = restantes > 0 ? `y ${restantes} más` : '';
        this._mas.visible = restantes > 0;
    }
});

// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * PaginaDispositivos — página del carrusel con los auriculares conectados.
 *
 * Auriculares normales: icono, nombre y un anillo con la batería general.
 * AirPods (o clones con protocolo AAP): además, anillos de izquierdo, derecho
 * y estuche (con rayo si cargan), si están puestos, y el selector de ruido.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {icono, ICONOS} from '../iconos.js';
import {aparecerConRebote} from '../animaciones.js';
import {IndicadorBateria} from '../componentes/anilloBateria.js';
import {BateriasAirPods, tieneBateriasDetalladas} from '../componentes/bateriasAirpods.js';
import {SelectorRuido} from '../componentes/selectorRuido.js';

/**
 * Texto del estado según dónde están los auriculares.
 * @param {object|null} airpods
 * @returns {string}
 */
function describirEstado(airpods) {
    const posiciones = [airpods?.oido?.primario, airpods?.oido?.secundario].filter(Boolean);
    const enOido = posiciones.filter(p => p === 'en_oido').length;
    const enEstuche = posiciones.filter(p => p === 'en_estuche').length;

    if (enOido === 2)
        return 'Puestos';
    if (enOido === 1)
        return 'Uno puesto';
    if (enEstuche === 2)
        return 'En el estuche';
    return 'Conectados';
}

/** Tarjeta de un dispositivo. */
const FilaDispositivo = GObject.registerClass(
class FilaDispositivo extends St.BoxLayout {
    /**
     * @param {Function} alCambiarModoRuido - Recibe (ruta, modo).
     */
    _init(alCambiarModoRuido) {
        super._init({
            style_class: 'isla-fila-dispositivo',
            orientation: Clutter.Orientation.VERTICAL,
        });

        // Cabecera: icono, nombre/estado y (si no hay detalle AAP) un anillo general.
        const cabecera = new St.BoxLayout({style_class: 'isla-dispositivo-cabecera'});
        this._cajaIcono = new St.Bin({
            style_class: 'isla-dispositivo-icono-caja',
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({gicon: icono(ICONOS.AURICULARES), style_class: 'isla-dispositivo-icono'}),
        });
        const textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._nombre = new St.Label({style_class: 'isla-dispositivo-nombre'});
        this._estado = new St.Label({text: 'Conectados', style_class: 'isla-dispositivo-estado'});
        textos.add_child(this._nombre);
        textos.add_child(this._estado);
        this._bateriaGeneral = new IndicadorBateria({diametro: 54, grosor: 5});

        cabecera.add_child(this._cajaIcono);
        cabecera.add_child(textos);
        cabecera.add_child(this._bateriaGeneral);
        this.add_child(cabecera);

        // Detalle AirPods: tres anillos + selector de ruido.
        this._baterias = new BateriasAirPods();
        this._selector = new SelectorRuido(modo => alCambiarModoRuido(this._dispositivo?.ruta, modo));
        this.add_child(this._baterias);
        this.add_child(this._selector);
    }

    /** @param {object} dispositivo - {ruta, nombre, bateria, airpods} */
    actualizar(dispositivo) {
        this._dispositivo = dispositivo;
        const detalle = tieneBateriasDetalladas(dispositivo.airpods);

        this._nombre.text = dispositivo.nombre;
        this._estado.text = describirEstado(dispositivo.airpods);

        this._bateriaGeneral.visible = !detalle && dispositivo.bateria !== null;
        this._bateriaGeneral.establecer(dispositivo.bateria);

        this._baterias.visible = detalle;
        this._baterias.actualizar(dispositivo.airpods);

        // El selector solo tiene sentido con el canal AAP abierto.
        this._selector.visible = Boolean(dispositivo.airpods);
        this._selector.establecerModo(dispositivo.airpods?.modoRuido ?? null);
    }

    animarEntrada(retraso) {
        aparecerConRebote(this._cajaIcono, {retraso});
        if (this._baterias.visible)
            this._baterias.animarEntrada(retraso + 60);
        else if (this._bateriaGeneral.visible)
            this._bateriaGeneral.establecer(this._dispositivo.bateria, {desdeCero: true});
    }
});

export const PaginaDispositivos = GObject.registerClass(
class PaginaDispositivos extends St.BoxLayout {
    /**
     * @param {Function} alCambiarModoRuido - Recibe (ruta, modo).
     */
    _init(alCambiarModoRuido) {
        super._init({
            style_class: 'isla-pagina isla-pagina-dispositivos',
            orientation: Clutter.Orientation.VERTICAL,
        });

        this._alCambiarModoRuido = alCambiarModoRuido;

        this._encabezado = new St.Label({text: 'Dispositivos', style_class: 'isla-pagina-encabezado'});
        this.add_child(this._encabezado);

        this._lista = new St.BoxLayout({
            style_class: 'isla-lista-dispositivos',
            orientation: Clutter.Orientation.VERTICAL,
        });
        this.add_child(this._lista);
        this._filas = new Map();
    }

    /**
     * @param {object[]} dispositivos - [{ruta, nombre, icono, bateria, airpods}]
     */
    actualizar(dispositivos) {
        const rutas = new Set(dispositivos.map(d => d.ruta));

        for (const [ruta, fila] of this._filas) {
            if (!rutas.has(ruta)) {
                fila.destroy();
                this._filas.delete(ruta);
            }
        }

        for (const dispositivo of dispositivos) {
            let fila = this._filas.get(dispositivo.ruta);
            if (!fila) {
                fila = new FilaDispositivo((ruta, modo) => this._alCambiarModoRuido(ruta, modo));
                this._filas.set(dispositivo.ruta, fila);
                this._lista.add_child(fila);
            }
            fila.actualizar(dispositivo);
        }
    }

    /** Se llama cuando la página entra en pantalla: los anillos se llenan de nuevo. */
    animarEntrada() {
        [...this._filas.values()].forEach((fila, indice) => fila.animarEntrada(80 + indice * 70));
    }
});

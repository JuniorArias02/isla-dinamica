/**
 * AlertaBluetooth — contenido de la tarjeta al conectar o desconectar
 * unos auriculares: icono grande, nombre, estado y batería.
 * Con AirPods (protocolo AAP) muestra tres anillos: izquierdo, derecho y estuche.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {icono, ICONOS} from '../iconos.js';
import {aparecerConRebote, deslizarEntrada} from '../animaciones.js';
import {IndicadorBateria} from '../componentes/anilloBateria.js';
import {BateriasAirPods, tieneBateriasDetalladas} from '../componentes/bateriasAirpods.js';

export const AlertaBluetooth = GObject.registerClass(
class AlertaBluetooth extends St.BoxLayout {
    _init() {
        super._init({style_class: 'isla-alerta isla-alerta-bluetooth'});

        this._cajaIcono = new St.Bin({
            style_class: 'isla-alerta-icono-caja',
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({gicon: icono(ICONOS.AURICULARES), style_class: 'isla-alerta-icono'}),
        });

        this._textos = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._titulo = new St.Label({style_class: 'isla-alerta-titulo'});
        this._detalle = new St.Label({style_class: 'isla-alerta-detalle'});
        this._textos.add_child(this._titulo);
        this._textos.add_child(this._detalle);

        this._bateria = new IndicadorBateria({diametro: 42, grosor: 4});
        this._baterias = new BateriasAirPods({compacto: true});

        this.add_child(this._cajaIcono);
        this.add_child(this._textos);
        this.add_child(this._bateria);
        this.add_child(this._baterias);

        this._datos = null;
    }

    /**
     * @param {object} datos - {titulo, detalle, conectado, bateria, airpods}
     */
    actualizar(datos) {
        const detalleAnterior = this._baterias.visible;
        this._datos = datos;
        this._titulo.text = datos.titulo;
        this._detalle.text = datos.detalle;

        this.remove_style_class_name('conectado');
        this.remove_style_class_name('desconectado');
        this.add_style_class_name(datos.conectado ? 'conectado' : 'desconectado');

        const detalle = datos.conectado && tieneBateriasDetalladas(datos.airpods);
        this._baterias.visible = detalle;
        this._baterias.actualizar(datos.airpods);
        this._bateria.visible = !detalle && datos.conectado && datos.bateria !== null;
        this._bateria.establecer(datos.bateria);

        // Los datos AAP llegan un instante después de conectar: sus anillos entran animados.
        if (detalle && !detalleAnterior)
            this._baterias.animarEntrada();
    }

    /** Animación de entrada: el icono salta, el texto se desliza y el anillo se llena. */
    animarEntrada() {
        aparecerConRebote(this._cajaIcono, {retraso: 60});
        deslizarEntrada(this._textos, {retraso: 120});
        if (this._baterias.visible) {
            this._baterias.animarEntrada(160);
        } else if (this._bateria.visible) {
            aparecerConRebote(this._bateria, {retraso: 160, escalaInicial: 0.6});
            this._bateria.establecer(this._datos.bateria, {desdeCero: true});
        }
    }
});

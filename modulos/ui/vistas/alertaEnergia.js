/**
 * AlertaEnergia — aviso al enchufar o desenchufar el cargador del portátil.
 *
 *   [⚡]  Cargando                              (64)   ← anillo verde
 *        64 % · llena en 1 h 20 min
 *
 *   [🔋]  Usando batería                        (63)   ← anillo por nivel
 *        63 % · quedan 3 h
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {icono, ICONOS} from '../iconos.js';
import {aparecerConRebote, deslizarEntrada} from '../animaciones.js';
import {formatearDuracionMin} from '../formato.js';
import {IndicadorBateria} from '../componentes/anilloBateria.js';
import {COLORES_ARO} from '../componentes/anilloProgreso.js';

/**
 * Textos del aviso según el estado.
 * @param {object} datos - {enchufado, porcentaje, cargando, llena, minutosRestantes}
 * @returns {{titulo: string, detalle: string}}
 */
function textosEnergia(datos) {
    const porcentaje = `${datos.porcentaje} %`;
    if (datos.enchufado) {
        if (datos.llena)
            return {titulo: 'Batería cargada', detalle: porcentaje};
        const tiempo = datos.minutosRestantes ? ` · llena en ${formatearDuracionMin(datos.minutosRestantes)}` : '';
        return {titulo: 'Cargando', detalle: `${porcentaje}${tiempo}`};
    }
    const tiempo = datos.minutosRestantes ? ` · quedan ${formatearDuracionMin(datos.minutosRestantes)}` : '';
    return {titulo: 'Usando batería', detalle: `${porcentaje}${tiempo}`};
}

export const AlertaEnergia = GObject.registerClass(
class AlertaEnergia extends St.BoxLayout {
    _init() {
        super._init({style_class: 'isla-alerta isla-alerta-energia'});

        this._iconoEstado = new St.Icon({style_class: 'isla-alerta-icono'});
        this._cajaIcono = new St.Bin({
            style_class: 'isla-alerta-icono-caja',
            y_align: Clutter.ActorAlign.CENTER,
            child: this._iconoEstado,
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

        this.add_child(this._cajaIcono);
        this.add_child(this._textos);
        this.add_child(this._bateria);
        this._datos = null;
    }

    /** @param {object} datos - {enchufado, porcentaje, cargando, llena, minutosRestantes} */
    actualizar(datos) {
        this._datos = datos;
        const {titulo, detalle} = textosEnergia(datos);
        this._titulo.text = titulo;
        this._detalle.text = detalle;

        this._iconoEstado.gicon = icono(datos.enchufado ? ICONOS.RAYO : ICONOS.BATERIA);
        this.remove_style_class_name('enchufado');
        this.remove_style_class_name('desenchufado');
        this.add_style_class_name(datos.enchufado ? 'enchufado' : 'desenchufado');

        // Cargando: anillo verde siempre (como el iPhone). Con batería: color por nivel.
        this._bateria.establecerColorFijo(datos.enchufado ? COLORES_ARO.VERDE : null);
        this._bateria.establecer(datos.porcentaje);
    }

    animarEntrada() {
        aparecerConRebote(this._cajaIcono, {retraso: 60});
        deslizarEntrada(this._textos, {retraso: 120});
        aparecerConRebote(this._bateria, {retraso: 160, escalaInicial: 0.6});
        if (this._datos)
            this._bateria.establecer(this._datos.porcentaje, {desdeCero: true});
    }
});

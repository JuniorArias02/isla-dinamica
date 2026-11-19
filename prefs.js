/**
 * Ventana de ajustes de la Isla Dinámica (Autor: JuniorArias02).
 *
 * Se abre desde Extensiones → Isla Dinámica → ⚙️ (o `gnome-extensions prefs
 * isla-dinamica@juniorarias02`). Corre en un proceso aparte (GTK 4 + libadwaita),
 * sin acceso al Shell: solo escribe en GSettings. La isla lee cada opción en el
 * momento de usarla, así que los cambios se ven al instante.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {AJUSTES} from './modulos/ajustes.js';
import {registrarAviso} from './modulos/registro.js';

const RUTA_REGISTRO = GLib.build_filenamev([GLib.get_user_cache_dir(), 'isla-dinamica', 'registro.log']);

export default class PreferenciasIslaDinamica extends ExtensionPreferences {
    /**
     * @param {Adw.PreferencesWindow} ventana
     */
    fillPreferencesWindow(ventana) {
        this._ajustes = this.getSettings();
        ventana.set_default_size(560, 720);
        ventana.search_enabled = true;

        ventana.add(this._crearPaginaIsla());
        ventana.add(this._crearPaginaAcercaDe(ventana));
    }

    // ───────────────────────── Página principal ─────────────────────────

    _crearPaginaIsla() {
        const pagina = new Adw.PreferencesPage({
            title: 'Isla',
            icon_name: 'preferences-system-symbolic',
        });

        // Notificaciones
        const notificaciones = new Adw.PreferencesGroup({
            title: 'Notificaciones',
            description: 'Cómo muestra la isla los mensajes (WhatsApp, Telegram, avisos del sistema).',
        });
        notificaciones.add(this._interruptor(AJUSTES.NOTIFICACIONES_PRIVADAS, 'Modo privado',
            'Muestra quién escribió, pero no el texto del mensaje. Útil al compartir pantalla.'));
        notificaciones.add(this._interruptor(AJUSTES.NOTIFICAR_EN_NO_MOLESTAR, 'Avisar con "No molestar"',
            'Con "No molestar" activado, la isla sigue avisando en silencio (con una luna 🌙).'));
        notificaciones.add(this._segundos(AJUSTES.DURACION_NOTIFICACIONES_MS, 'Duración en pantalla',
            'Segundos que se ve cada notificación.', 1.5, 15));
        pagina.add(notificaciones);

        // Isla
        const isla = new Adw.PreferencesGroup({title: 'Isla'});
        isla.add(this._interruptor(AJUSTES.ABRIR_CON_PUNTERO, 'Abrir con el puntero encima',
            'Además del clic, la isla se abre al dejar el puntero sobre la cápsula.'));
        isla.add(this._segundos(AJUSTES.TIEMPO_CIERRE_MS, 'Cierre automático',
            'Segundos que la isla abierta sigue visible después de sacar el puntero.', 1, 15));
        isla.add(this._interruptor(AJUSTES.OCULTAR_RELOJ_GNOME, 'Ocultar el reloj de Ubuntu',
            'La isla ya muestra la hora. El botón del calendario sigue funcionando.'));
        isla.add(this._interruptor(AJUSTES.FORZAR_ANIMACIONES, 'Animaciones siempre',
            'La isla anima aunque las animaciones del sistema estén desactivadas.'));
        pagina.add(isla);

        // Avisos
        const avisos = new Adw.PreferencesGroup({
            title: 'Avisos',
            description: 'Qué más aparece en la isla.',
        });
        avisos.add(this._interruptor(AJUSTES.MOSTRAR_VOLUMEN_BRILLO, 'Volumen y brillo',
            'En la isla, en lugar del recuadro flotante de GNOME.'));
        avisos.add(this._interruptor(AJUSTES.AVISAR_CARGADOR, 'Cargador',
            'Aviso al enchufar o desenchufar el cargador del portátil.'));
        avisos.add(this._interruptor(AJUSTES.AVISAR_COPIADO, '"Copiado"',
            'Aviso breve al copiar algo (nunca se muestra lo copiado).'));
        avisos.add(this._interruptor(AJUSTES.MOSTRAR_PRIVACIDAD, 'Puntitos de privacidad',
            'Naranja = micrófono, verde = cámara, rojo = pantalla en uso.'));
        pagina.add(avisos);

        return pagina;
    }

    // ───────────────────────── Acerca de ─────────────────────────

    _crearPaginaAcercaDe(ventana) {
        const pagina = new Adw.PreferencesPage({
            title: 'Acerca de',
            icon_name: 'help-about-symbolic',
        });

        const proyecto = new Adw.PreferencesGroup({title: 'Isla Dinámica'});
        proyecto.add(new Adw.ActionRow({title: 'Autor', subtitle: 'JuniorArias02'}));
        proyecto.add(new Adw.ActionRow({title: 'Versión', subtitle: `${this.metadata.version}`}));
        proyecto.add(new Adw.ActionRow({title: 'Compatible con', subtitle: 'GNOME Shell 50 · Wayland'}));
        pagina.add(proyecto);

        const diagnostico = new Adw.PreferencesGroup({
            title: 'Diagnóstico',
            description: 'Si algo falla, este archivo tiene los detalles (nunca el texto de tus mensajes).',
        });
        const filaRegistro = new Adw.ActionRow({title: 'Registro de errores', subtitle: RUTA_REGISTRO});
        const botonAbrir = new Gtk.Button({label: 'Abrir', valign: Gtk.Align.CENTER});
        botonAbrir.connect('clicked', () => {
            const lanzador = new Gtk.FileLauncher({file: Gio.File.new_for_path(RUTA_REGISTRO)});
            lanzador.launch(ventana, null, (fuente, resultado) => {
                try {
                    lanzador.launch_finish(resultado);
                } catch (error) {
                    registrarAviso(`Ajustes: no se pudo abrir el registro: ${error.message}`);
                }
            });
        });
        filaRegistro.add_suffix(botonAbrir);
        diagnostico.add(filaRegistro);
        pagina.add(diagnostico);

        return pagina;
    }

    // ───────────────────────── Filas reutilizables ─────────────────────────

    /** Fila con interruptor enlazada a una opción booleana. */
    _interruptor(clave, titulo, subtitulo) {
        const fila = new Adw.SwitchRow({title: titulo, subtitle: subtitulo});
        this._ajustes.bind(clave, fila, 'active', Gio.SettingsBindFlags.DEFAULT);
        return fila;
    }

    /**
     * Fila numérica en SEGUNDOS para una opción guardada en milisegundos.
     * @param {string} clave
     * @param {string} titulo
     * @param {string} subtitulo
     * @param {number} minimo - Segundos.
     * @param {number} maximo - Segundos.
     */
    _segundos(clave, titulo, subtitulo, minimo, maximo) {
        const fila = new Adw.SpinRow({
            title: titulo,
            subtitle: subtitulo,
            digits: 1,
            adjustment: new Gtk.Adjustment({lower: minimo, upper: maximo, step_increment: 0.5, page_increment: 1}),
        });
        fila.value = this._ajustes.get_int(clave) / 1000;
        fila.connect('notify::value', () => {
            const milisegundos = Math.round(fila.value * 1000);
            if (milisegundos !== this._ajustes.get_int(clave))
                this._ajustes.set_int(clave, milisegundos);
        });
        // Si cambia desde otro sitio, la ventana se actualiza.
        this._ajustes.connect(`changed::${clave}`, () => {
            const segundos = this._ajustes.get_int(clave) / 1000;
            if (Math.abs(segundos - fila.value) > 0.001)
                fila.value = segundos;
        });
        return fila;
    }
}

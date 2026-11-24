# Consideraciones del sistema

Compatibilidad, particularidades de Wayland y herramientas para probar y depurar la extensión.

---

## Compatibilidad

### Entorno de referencia

| Componente | Versión requerida | Versión de referencia |
| :--- | :--- | :--- |
| GNOME Shell | **50.x** (`metadata.json` → `"shell-version": ["50"]`) | 50.1 |
| Mutter / Clutter | la de GNOME 50 | 50.1 |
| GJS | la de GNOME 50 | 1.88 |
| GLib | la de GNOME 50 | 2.88 |
| Sesión gráfica | **Wayland** (GNOME 50 ya no incluye sesión X11) | Wayland |
| BlueZ | 5.x con `ProfileManager1` (para AirPods) | 5.85 |
| Distribución | cualquiera con GNOME 50 | Ubuntu 26.04 LTS |

### Por qué solo GNOME 50

La extensión usa APIs que cambiaron en las últimas versiones de GNOME. En versiones anteriores lo más probable es que no cargue:

| API | Detalle |
| :--- | :--- |
| Gestos de Clutter | Clics y arrastres con `Clutter.ClickGesture` / `Clutter.PanGesture`. Las versiones antiguas usaban `button-press-event` |
| `Main.layoutManager.addTopChrome` | En GNOME 50 solo acepta `trackFullscreen` y `affectsStruts` |
| `St.BoxLayout.orientation` | Reemplaza a la antigua propiedad `vertical` |
| Módulos ESM | `import ... from 'gi://...'` (GNOME 45+) |
| `animationRequired` en `ease()` | Para animar aunque el sistema tenga las animaciones apagadas |
| `Adw.SwitchRow` / `Adw.SpinRow` | Ventana de ajustes (libadwaita 1.4+) |

### Partes internas de GNOME

Estas piezas no son API pública y pueden cambiar en cualquier versión. Son lo primero que hay que revisar al probar una versión nueva:

| Pieza | Para qué |
| :--- | :--- |
| `Main.messageTray._showNotification` | Capturar notificaciones |
| `Main.osdWindowManager.show` / `showAll` | Volumen y brillo |
| `Main.panel.statusArea.dateMenu._clockDisplay` | Ocultar el texto del reloj |
| `Main.panel.statusArea.quickSettings._volumeInput._indicator` | Saber si el micrófono está en uso |
| `Main.panel.statusArea.dateMenu._eventSource` | Eventos del calendario (fuente compartida con el panel) |
| `Main.panel.statusArea.screenRecording.container` | Ocultar el indicador de grabación de GNOME mientras la isla muestra la suya |
| `status/volume.js · getMixerControl()` y `get_source_outputs()` | Saber qué app usa el micrófono (llamada en curso) y silenciarlo. Es la función que exporta el módulo de volumen de GNOME |
| `MessageTray.Notification.actions` | Pulsar "Contestar" / "Rechazar" de una llamada desde la isla |
| `Main.panel.menuManager.removeMenu(boton.menu)` | Quitar el menú vacío que GNOME registra para la cápsula; si no, al arrastrarla sobre el reloj se abre su menú y el arrastre se corta |

### Al salir una versión nueva de GNOME

1. Ejecutar `npm run probar:todo` en la versión nueva.
2. Revisar `~/.cache/isla-dinamica/registro.log`: no debe haber líneas `ERROR`, sobre todo en notificaciones, OSD, reloj y privacidad.
3. Si todo funciona, añadir la versión en `metadata.json` (por ejemplo `"shell-version": ["50", "51"]`) y actualizar esta tabla y el README.

### AirPods

La batería por auricular y estuche, la detección de oído y el modo de ruido funcionan con **AirPods originales** y con **clones que implementan el protocolo de Apple (AAP)**, que se anuncian con el servicio `74ec2172-0bad-4d01-8f77-997b2be0722a`. Cualquier otro auricular Bluetooth muestra la batería general, si la informa.

---

## Recargar la extensión en Wayland

En X11 se recargaba GNOME con `Alt + F2` → `r`.

> [!CAUTION]
> En Wayland **no existe** esa recarga: reiniciar el compositor cierra la sesión y todas las aplicaciones abiertas.

> [!IMPORTANT]
> `gnome-extensions disable … && gnome-extensions enable …` **no carga el código nuevo**: GJS guarda en caché los módulos ESM. Sirve para comprobar que `disable()` limpia todo y para recargar `stylesheet.css`, pero los cambios en `.js` solo se ven al **cerrar sesión y volver a entrar**.

La ventana de ajustes (`prefs.js`) corre en otro proceso y sí se recarga cada vez que se abre.

Para probar sin cerrar sesión hay dos alternativas.

### Sesión anidada en una ventana

Requiere `mutter-dev-bin`:

```bash
sudo apt install mutter-dev-bin
dbus-run-session gnome-shell --devkit --wayland
```

### GNOME Shell aislado

Un GNOME sin pantalla, con bus de sesión, configuración, datos y caché propios. No afecta a la sesión real.

```bash
./pruebas/aislado/aislado.sh
```

El script enlaza la extensión y una extensión de prueba (`pruebas/aislado/prueba-isla@local/`) en una carpeta temporal, arranca `gnome-shell --headless` con `dbus-run-session` y muestra el resultado de cada comprobación. Termina con error si alguna falla, si hay un `JS ERROR` o si el registro de la isla contiene líneas `ERROR`.

Para probar algo nuevo, la extensión de prueba puede:

* acceder a la isla con `Main.extensionManager.lookup('isla-dinamica@juniorarias02').stateObj` y simular estados (por ejemplo `isla._controlador.actualizarPrivacidad({...})`);
* crear un puntero o teclado virtual con `Clutter.get_default_backend().get_default_seat().create_virtual_device(...)`;
* hacer capturas con `Shell.Screenshot.screenshot_area(...)`.

> Al desactivar y reactivar la isla, GNOME también reinicia las extensiones que se activaron después de ella, incluida la de prueba. Por eso la prueba usa una bandera para ejecutarse una sola vez.

Limitaciones del entorno aislado:

* Los reproductores (Brave, Spotify) no están en el bus de sesión aislado; MPRIS se prueba en la sesión real o simulando la pista en el controlador.
* BlueZ y UPower sí están disponibles, porque usan el bus de sistema.
* No hay cámara: el punto de la cámara se prueba simulando el estado.
* El portapapeles de Wayland solo acepta copias de la app con el foco del teclado; hace falta un teclado virtual y que la app reintente la copia.
* No existe el servicio de grabación de GNOME: al simular una grabación con `Main.screenshotUI._setScreencastInProgress(true)`, GNOME la da por fallida al instante. Hay que poner antes `Main.screenshotUI._screencastStarting = true` (y quitarlo para detenerla).
* GNOME destruye una fuente de notificaciones cuando se queda vacía: para simular varios avisos seguidos, crear una fuente nueva cada vez.
* No hay servidor de sonido: el mezclador nunca está listo y no se detectan llamadas en curso. Se prueban simulando el estado (`isla._controlador.actualizarLlamada({...})`); la llamada que suena sí se prueba de verdad, con una notificación con botones (`notification.addAction(...)`).

---

## Registro y depuración

### Registro de la extensión

```bash
cat ~/.cache/isla-dinamica/registro.log        # avisos y errores con su pila
journalctl -f -o cat /usr/bin/gnome-shell | grep -i isla-dinamica
```

Los mensajes de depuración (`registrarDepuracion`) solo aparecen con `G_MESSAGES_DEBUG`. El prefijo `[isla-dinamica]` va sin tildes para poder filtrarlo con `grep`.

### Avisos de Mutter sobre la isla

Algunos problemas no pasan por nuestro registro: los avisa Mutter en el journal. Conviene revisarlos de vez en cuando:

```bash
journalctl -b -o cat /usr/bin/gnome-shell | grep -E "Gjs_(ui|vistas|componentes)_" | sort | uniq -c | sort -rn | head
```

`Can't update stage views actor [Gjs_...] is on because it needs an allocation` indica un actor que cambia de tamaño durante el cálculo de tamaños (ver REGLAS, sección 3).

### Ventana de ajustes

```bash
gnome-extensions prefs isla-dinamica@juniorarias02
journalctl -f -o cat | grep -i isla-dinamica
```

### Esquema de ajustes

```bash
glib-compile-schemas --strict schemas/
gsettings --schemadir schemas/ list-recursively org.gnome.shell.extensions.isla-dinamica
```

---

## Bluetooth y AirPods

```bash
bluetoothctl devices Connected
busctl tree org.bluez
busctl introspect org.bluez /org/bluez/hci0/dev_XX_XX_XX_XX_XX_XX
```

* La batería general llega por `org.bluez.Battery1`. Si BlueZ no la informa, revisar que `/etc/bluetooth/main.conf` tenga habilitadas las funciones experimentales.
* Para comprobar si un auricular habla el protocolo de Apple, buscar el UUID `74ec2172-0bad-4d01-8f77-997b2be0722a` en `bluetoothctl info <MAC>`.
* Los mensajes del canal AAP aparecen en el registro con el prefijo `AAP:` o `AirPods:`.

---

## Llamadas

Para ver qué manda una app al sonar una llamada (botones, urgencia), sin la isla de por medio:

```bash
dbus-monitor --session "type='method_call',interface='org.freedesktop.Notifications',member='Notify'"
```

Cada aviso trae el nombre de la app, el título, el texto, la lista de botones (`id`, `texto`, `id`, `texto`...) y las pistas (`urgency` 2 = crítica). Ojo: muestra el texto de los mensajes que lleguen mientras se mira.

Quién usa el micrófono:

```bash
pactl list source-outputs | grep -E "application.name|application.id|media.name"
```

## Multimedia (MPRIS2)

```bash
playerctl -l                 # reproductores activos (Brave: brave.instanceNNNN)
playerctl metadata           # título, artista, portada de la pista actual
busctl --user list | grep mpris
```

---

## Posición en pantalla

* La cápsula y el círculo son un botón del panel, en el centro, donde estaba el reloj (`Main.panel.addToStatusArea(..., 'center')`).
* La isla grande es un actor de `Main.layoutManager.addTopChrome`, para flotar sobre las ventanas maximizadas sin reservar espacio.
* Con varias pantallas, todo va en el **monitor principal** (donde GNOME pone el panel). Al conectar o desconectar un monitor, la isla abierta salta junto a la cápsula (ver ARQUITECTURA, 4.5).
* Para probar varias pantallas en el GNOME aislado: `--virtual-monitor 1280x720 --virtual-monitor 1280x720`. El monitor principal se cambia con `org.gnome.Mutter.DisplayConfig.ApplyMonitorsConfig` (método 1 = temporal).

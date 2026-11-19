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

### Al salir una versión nueva de GNOME

1. Probar la extensión en un GNOME Shell aislado (ver más abajo).
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

Un GNOME sin pantalla, con bus de sesión, configuración, datos y caché propios. No afecta a la sesión real y sirve para comprobar que la extensión carga sin errores y para hacer capturas desde una extensión de prueba.

```bash
PRUEBA=$(mktemp -d)
mkdir -p "$PRUEBA"/{cfg,cache,data/gnome-shell/extensions}
ln -s "$PWD" "$PRUEBA/data/gnome-shell/extensions/isla-dinamica@juniorarias02"

env -u WAYLAND_DISPLAY -u DISPLAY \
    XDG_CONFIG_HOME="$PRUEBA/cfg" XDG_DATA_HOME="$PRUEBA/data" XDG_CACHE_HOME="$PRUEBA/cache" \
    dbus-run-session -- bash -c '
        gsettings set org.gnome.shell disable-user-extensions false
        gsettings set org.gnome.shell enabled-extensions "[\"isla-dinamica@juniorarias02\"]"
        timeout 20 gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x720' 2>&1 \
    | grep -E "isla-dinamica|JS ERROR"

cat "$PRUEBA/cache/isla-dinamica/registro.log"
```

Se ejecuta desde la raíz del repositorio. Debe aparecer `Extensión activa.` y ningún `JS ERROR`.

**Pruebas con interacción:** se puede añadir al mismo directorio una segunda extensión de prueba que, en su `enable()`:

* acceda a la isla con `Main.extensionManager.lookup('isla-dinamica@juniorarias02').stateObj` para simular estados (por ejemplo `ext._controlador.actualizarPrivacidad({...})`);
* cree un puntero o teclado virtual con `Clutter.get_default_backend().get_default_seat().create_virtual_device(...)`;
* haga capturas con `Shell.Screenshot.screenshot_area(...)`.

Limitaciones del entorno aislado:

* Los reproductores (Brave, Spotify) no están en el bus de sesión aislado; MPRIS se prueba en la sesión real o simulando la pista en el controlador.
* BlueZ y UPower sí están disponibles, porque usan el bus de sistema.
* No hay cámara: el punto de la cámara se prueba simulando el estado.
* El portapapeles de Wayland solo acepta copias de la app con el foco del teclado; hace falta un teclado virtual y que la app reintente la copia.

---

## Registro y depuración

### Registro de la extensión

```bash
cat ~/.cache/isla-dinamica/registro.log        # avisos y errores con su pila
journalctl -f -o cat /usr/bin/gnome-shell | grep -i isla-dinamica
```

Los mensajes de depuración (`registrarDepuracion`) solo aparecen con `G_MESSAGES_DEBUG`. El prefijo `[isla-dinamica]` va sin tildes para poder filtrarlo con `grep`.

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

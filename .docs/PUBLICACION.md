# Publicación

Cómo preparar y publicar una versión nueva de la Isla Dinámica: en GitHub (versión descargable) y en [extensions.gnome.org](https://extensions.gnome.org) (instalación con un clic).

---

## 1. Preparar la versión

1. Actualiza `version-name` en `metadata.json` (por ejemplo `"1.1"`). El campo `version` (número entero) lo gestiona extensions.gnome.org al subir cada paquete; en GitHub se puede dejar como está.
2. Comprueba todo, incluido el paquete tal como lo recibirán los usuarios:
   ```bash
   npm run probar:todo
   npm run probar:paquete
   ```
   Ambos deben terminar sin `✘`.
3. El paquete queda en `dist/isla-dinamica@juniorarias02.shell-extension.zip` (la carpeta `dist/` no se sube al repositorio).

### Qué contiene el paquete

`npm run empaquetar` usa `gnome-extensions pack` e incluye solo lo necesario para funcionar:

```text
extension.js  prefs.js  metadata.json  stylesheet.css  LICENSE
modulos/  recursos/  schemas/*.gschema.xml
```

No incluye `pruebas/`, `.docs/`, `node_modules/` ni la configuración de desarrollo.

> El esquema de ajustes va **sin compilar**. extensions.gnome.org y `gnome-extensions install` lo compilan al instalar. Quien descomprima el `.zip` a mano debe ejecutar `glib-compile-schemas schemas/` dentro de la carpeta de la extensión, o la extensión no arranca.

---

## 2. Versión en GitHub

1. Sube los cambios y crea una etiqueta con el número de versión:
   ```bash
   git tag -a v1.0 -m "Isla Dinámica 1.0"
   git push origin v1.0
   ```
2. En GitHub: **Releases → Draft a new release**, elige la etiqueta `v1.0`, escribe las novedades y adjunta el `.zip` de `dist/`.

Instalación para los usuarios:

```bash
gnome-extensions install isla-dinamica@juniorarias02.shell-extension.zip
```

Después deben cerrar sesión, volver a entrar y activarla (`gnome-extensions enable isla-dinamica@juniorarias02`).

---

## 3. extensions.gnome.org

### Primera vez

1. Crear una cuenta en <https://extensions.gnome.org/accounts/register/>.
2. Entrar en <https://extensions.gnome.org/upload/>, subir el `.zip` y aceptar los términos.
3. La extensión queda **pendiente de revisión**. Un revisor del equipo de GNOME lee el código a mano; puede tardar desde unos días hasta varias semanas. Si pide cambios, se corrigen y se sube un paquete nuevo.

### Versiones siguientes

Subir el nuevo `.zip` en la misma página. Cada subida vuelve a pasar por revisión.

### Lo que revisan

Las [normas de revisión](https://gjs.guide/extensions/review-guidelines/review-guidelines.html) más relevantes para este proyecto, y cómo se cumplen:

| Norma | En la Isla Dinámica |
| :--- | :--- |
| No crear objetos ni conectar señales fuera de `enable()` | Todo se crea en `enable()` (`_crearYConectar`) |
| Destruir todo y desconectar todo en `disable()` | Comprobado por `pruebas/aislado/` (sin restos tras desactivar) |
| Quitar los temporizadores (`GLib.source_remove`) en `disable()` | Cada servicio y vista guarda el id y lo elimina en `destruir()` |
| Restaurar los métodos de GNOME reemplazados | `_showNotification`, `osdWindowManager.show/showAll` se restauran (comprobado por la prueba aislada) |
| No usar librerías del Shell en `prefs.js` | `prefs.js` solo importa GTK, Adw, `ajustes.js` y `registro.js` |
| No llenar el journal de mensajes | Solo arranques, cambios de estado y errores; el detalle va con `registrarDepuracion` (solo con `G_MESSAGES_DEBUG`) |
| No incluir archivos innecesarios | El paquete solo lleva lo necesario (ver arriba) |
| No leer datos privados sin necesidad | No se lee el contenido del portapapeles ni se registra el texto de las notificaciones |
| Licencia compatible con GPL-2.0-or-later | `LICENSE` (GPL-2.0-or-later) |

Puntos que el revisor puede preguntar, con la explicación preparada:

* **Perfil Bluetooth propio (AirPods):** la extensión publica `org.bluez.Profile1` en el bus de sistema para leer la batería por auricular con el protocolo de Apple. Solo se usa con dispositivos que anuncian el UUID AAP y se retira en `disable()`.
* **Partes internas de GNOME:** `_showNotification`, `osdWindowManager`, `dateMenu._clockDisplay` y el indicador de micrófono de Ajustes rápidos. Se usan porque no hay API pública equivalente; todas se restauran en `disable()` y, si fallan, se llama al comportamiento original de GNOME.
* **Indicador de grabación de GNOME:** mientras se graba, la isla oculta el contenedor de `statusArea.screenRecording` porque ya muestra el contador y el botón para detener. Es opcional (`ocultar-indicador-grabacion`) y se restaura al terminar y en `disable()`.
* **Gestor de menús del panel:** la cápsula se crea sin menú (`dontCreateMenu`), pero GNOME le registra uno vacío en `Main.panel.menuManager`. La isla lo quita al montarse porque ese gestor abría el menú del reloj mientras se arrastraba la cápsula. El botón se destruye en `disable()`.
* **Notificaciones críticas:** también pasan por la isla (más tiempo en pantalla). Si la isla falla, vuelven al banner nativo.
* **Micrófono:** para saber si hay una llamada en curso se mira qué app tiene un flujo de grabación (`getMixerControl().get_source_outputs()`, nombre e id de la app) y los títulos de las ventanas. No se escucha ni se graba audio. El botón de silenciar usa `change_is_muted` del micrófono por defecto, como los Ajustes rápidos.
* **Liquid Glass:** el vidrio copia el fondo de pantalla (`layoutManager._backgroundGroup`) y, solo con la isla abierta, las ventanas (un `Clutter.Clone` por ventana, como la vista general), y los desenfoca con `Shell.BlurEffect`. Un `Shell.GLSLEffect` recorta las esquinas. Se puede desactivar en los ajustes (estilo "Negro clásico") y todo se destruye en `disable()`.
* **Animaciones forzadas:** `animationRequired` solo afecta a los actores de la isla y se puede desactivar en los ajustes (`forzar-animaciones`).

---

## 4. Después de publicar

* Si sale una versión nueva de GNOME, seguir [CONSIDERACIONES_SISTEMA.md](CONSIDERACIONES_SISTEMA.md#al-salir-una-versión-nueva-de-gnome) y añadirla a `shell-version` antes de subir el paquete.
* Las incidencias de los usuarios se pueden diagnosticar pidiéndoles `~/.cache/isla-dinamica/registro.log` (clic derecho en la isla → Registro de errores). No contiene el texto de sus mensajes.

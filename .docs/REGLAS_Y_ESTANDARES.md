# Reglas y estándares

Normas obligatorias para cualquier cambio en la Isla Dinámica. Si una regla no encaja con un caso, se discute y se actualiza este documento; no se ignora en silencio.

**En resumen:** código en español, capas separadas, nada de sondeo, todo se limpia en `disable()`, valores fijos en `constantes.js`, animaciones con `ui/movimiento.js` y todo error al registro.

---

## 1. Idioma y documentación del código

1. **Idioma:** todo el código va en **español**: variables, funciones, clases, comentarios, mensajes de registro y textos visibles. Solo quedan en inglés los nombres que impone GNOME (`enable`, `vfunc_repaint`, `notify::hover`, propiedades de Clutter).
2. **Encabezado por archivo o clase:** un bloque `/** ... */` que explique su función y en qué capa vive.
3. **Métodos públicos** documentados con `@param` y `@returns`.
4. **Toda llamada o señal D-Bus** lleva un comentario con servicio, interfaz y señal o método:
   ```javascript
   // Servicio org.bluez · interfaz org.freedesktop.DBus.Properties · señal PropertiesChanged
   ```
5. **Registro:** nunca `console.*` directo (salvo dentro de `registro.js`). Se usan `registrarInfo`, `registrarAviso`, `registrarError(contexto, error)`.
   - **Todo** `catch` registra el error (como mínimo con `registrarDepuracion`). Prohibido el `catch {}` vacío.
   - **Todo** callback que llama GNOME (señales, D-Bus, temporizadores, gestos) va envuelto en `protegido('contexto', fn)`: si falla, queda anotado con su contexto y no rompe el resto.
   - En `disable()`, cada paso va en `intentar('contexto', () => ...)`.
   ```javascript
   this._idNombres = conexion.signal_subscribe(..., protegido('multimedia: NameOwnerChanged', (...) => { ... }));
   ```
6. **Privacidad en el registro:** nunca se registra el texto de una notificación ni el contenido del portapapeles. Solo metadatos técnicos.

---

## 2. Arquitectura

Detalle completo en [ARQUITECTURA.md](ARQUITECTURA.md).

### 2.1 Dependencias entre capas

```text
servicios/  ──datos──▶  controlador.js  ──vista──▶  ui/
     ▲                                                │
     └──────── acciones (vía extension.js) ◀──────────┘
```

* Un servicio **no importa** `ui/` ni `controlador.js`.
* El controlador **no importa** `St`, `Clutter`, `Main` ni nada de `ui/`. Si necesita un actor, el diseño está mal.
* La UI **no importa** servicios ni el controlador. Pide cosas mediante el objeto `acciones` que recibe en el constructor.
* `extension.js` es el único lugar donde se conectan las piezas (raíz de composición).

### 2.2 Dónde va cada cosa

| Necesidad | Ubicación |
| :--- | :--- |
| Escuchar algo nuevo del sistema | `servicios/nuevo.js` + conectarlo en `extension.js` |
| Un nuevo tipo de alerta | `TIPOS_ALERTA` y `PRIORIDADES` en `constantes.js` + una vista en `ui/vistas/` + registrarla en el mapa `_alertas` de `IslaUI` |
| Una nueva página de la isla | `ui/vistas/paginaX.js` + registrarla en `VistaExpandida` |
| Una pieza visual reutilizable | `ui/componentes/` (sin lógica de negocio) |
| Una animación que se repite | `ui/animaciones.js` |
| Un gesto del usuario | `ui/interaccion.js` |
| Un componente que necesita el arrastre o desplazamiento **vertical** para sí (ej. una rueda) | Clase CSS `isla-captura-vertical` (la isla no se cerrará al arrastrar sobre él) y devolver `EVENT_STOP` en su `scroll-event` vertical |
| Un botón propio dentro de una **alerta** (ej. contestar una llamada) | Clase CSS `isla-captura-clic`: el clic en él no cuenta además como toque en la alerta |
| Un tiempo, tamaño o umbral | `constantes.js`. **Nunca** un número suelto en el código |
| Una **opción que el usuario pueda cambiar** | 1) `<key>` en `schemas/…gschema.xml` · 2) clave y valor por defecto en `ajustes.js` (deben coincidir) · 3) fila en `prefs.js` · 4) leerla con `ajuste(AJUSTES.X)` en el momento de usarla · 5) `glib-compile-schemas schemas/` |
| Un color, radio o espaciado | `stylesheet.css`. **Nunca** estilos en JS, salvo valores dinámicos (por ejemplo, la portada) |
| Un icono | `recursos/iconos/nombre-symbolic.svg` + `ICONOS` en `ui/iconos.js` |
| Un enum que usan servicio **e** interfaz (`MODOS_RUIDO`, `TIPOS_INDICADOR`, `ESTADOS_TEMPORIZADOR`, `TIPOS_COPIA`) | `constantes.js` (la UI no puede importar servicios) |
| Reemplazar un método de GNOME (`_showNotification`, `osdWindowManager.show`) | Solo en la **instancia**, guardando el original y comprobando en `destruir()` que nadie lo cambió después. Si la isla falla, se llama al original: GNOME nunca debe quedarse sin su comportamiento |

### 2.3 La vista es la única fuente de verdad

* La UI se dibuja **solo** con el objeto `vista` (`{estado, alerta, pista, dispositivos, reloj, notificaciones, temporizador, privacidad, actividades}`). No se guarda estado de negocio en la UI.
* `mostrarVista()` se llama muchas veces con el mismo estado: debe ser **idempotente**. No se repiten animaciones de entrada si el dato no cambió (ver `_ordenAlertaMostrada` en `isla.js`).

### 2.4 Propiedad de los actores

* **Quien crea un actor lo destruye.** `TarjetaFlotante` y `Carrusel` *alojan* contenido ajeno: lo sacan con `remove_child`, nunca lo destruyen.
* Antes de destruir un contenedor que aloja contenido ajeno, hay que sacar ese contenido (`TarjetaFlotante.destruir()`, `Carrusel.soltarPaginas()`). Si no, se destruye dos veces y GJS lanza errores de "already disposed".

---

## 3. Rendimiento y fugas de memoria

Las extensiones corren **en el mismo hilo que el compositor**. Un error o un bucle congela todo el escritorio.

1. **Prohibido el sondeo (polling):**
   - Nunca `GLib.timeout_add` en bucle para *preguntar* si algo cambió.
   - Se usan señales: `PropertiesChanged`, `NameOwnerChanged`, `notify::`.
   - **E/S de archivos** siempre asíncrona, salvo excepción documentada. La copia de la foto de una notificación (unos KB) se hace en el momento, porque la notificación se dibuja enseguida y el navegador borra el archivo poco después.
   - **Excepciones permitidas** (documentadas en el código):
     - Temporizadores de **una sola vez** para expirar alertas, abrir y cerrar con el puntero, bloquear deslizamientos o reintentar una búsqueda acotada (indicador de micrófono, canal de los AirPods).
     - La consulta de `Position` cada segundo, **solo** con la isla abierta en la página de música y sonando (MPRIS no emite cambios de posición).
     - El refresco del temporizador al siguiente cambio de segundo, **solo** mientras corre.
2. **Limpieza total en `disable()`:**
   - Toda señal se desconecta: preferir `connectObject(..., this)` + `disconnectObject(this)`.
   - Toda suscripción D-Bus se cancela (`signal_unsubscribe`, `Gio.Cancellable`).
   - Todo temporizador se elimina (`GLib.source_remove`). Siempre se guarda su id.
   - Todo actor se destruye y todo actor añadido como chrome se quita (`Main.layoutManager.removeChrome`).
   - Todo método de GNOME reemplazado se restaura (ver `CapturadorNotificaciones.destruir`).
3. **GPU integrada:**
   - Nada de desenfoques **permanentes** ni shaders.
   - `Shell.BlurEffect` está **desactivado** (`USAR_DESENFOQUE = false`): en modo ACTOR dibuja el contenido en un rectángulo sin bordes redondeados y aparece un cuadrado opaco alrededor de la isla al abrirse.
   - Colores sólidos o translúcidos, `border-radius` y sombras CSS suaves.
   - No usar `clip_to_allocation` en la cápsula: recorta la sombra y la deja cuadrada.
   - Las animaciones infinitas (onda) solo corren mientras se ven y se detienen con `remove_all_transitions()`.
4. **Nunca cambiar tamaños desde un aviso de tamaño** (`notify::width`, `notify::height`, `notify::allocation`): pide un cálculo de tamaños en medio del actual, Mutter avisa `Can't update stage views ... needs an allocation` y las animaciones de la tarjeta pueden congelarse. Si un hijo depende del tamaño del padre, se calcula en `vfunc_allocate` (ver `BarraNivel`). La prueba aislada falla si aparece ese aviso.
5. **Varias pantallas:** las posiciones se calculan con `Main.layoutManager.primaryMonitor` (donde está el panel), nunca con la pantalla 0 ni con `global.stage.width`.

---

## 4. Animaciones

1. **Nunca** llamar `actor.ease()` ni `ease_property()` directamente. Se usa `ui/movimiento.js`:
   - `animar(actor, props)` para transiciones simples (fundidos, colores, tamaños sin rebote).
   - `animarConResorte(actor, props, {resorte})` para todo lo que **cambia de forma o posición** (isla, cápsula, círculo, páginas, botones).
   - `entrarConDesenfoque` / `salirConDesenfoque` para contenido que aparece o desaparece dentro de la isla.

   Así todas respetan el ajuste `forzar-animaciones`. Una llamada directa a `ease()` sería **instantánea** en equipos con las animaciones del sistema desactivadas o con *Reducir movimiento*.
2. Nunca animar con temporizadores JS cuadro a cuadro.
3. Los parámetros van en `constantes.js`: `RESORTES` (respuesta, amortiguación) y `DURACION_*`. Referencia:
   - Apertura de la isla: amortiguación 0,66–0,70 (se pasa ~5 % y rebota).
   - Cierre: amortiguación ~0,86 (firme, sin rebote).
   - Toques y aterrizaje: amortiguación ~0,52 (rebote marcado).
   - Contenido: entra en ~300 ms con 110 ms de retraso; sale en ~140 ms.
4. **Orden:** al abrir, primero la forma y luego el contenido; al cerrar, primero el contenido y luego la forma.
5. `onComplete` **solo se ejecuta si la animación termina**. Si otra la interrumpe, no se llama (`onStopped` sí). Se aprovecha para que la tarjeta solo se oculte si nadie la reabrió a mitad de camino.
6. Antes de animar una propiedad que podría estar animándose, usar `remove_transition('propiedad')` si hay que partir de un valor concreto.
7. Con `scale_*`, fijar antes `set_pivot_point(0.5, 0.5)` (o el punto que corresponda).
8. Reutilizar `ui/animaciones.js` antes de escribir una animación nueva.

---

## 5. Estilos e iconos

* Todas las clases llevan el prefijo **`isla-`** para no chocar con el tema del usuario.
* Para anular estilos del tema se usan selectores más específicos (por ejemplo `#panel .panel-button.isla-boton-panel:hover`), **nunca `!important`**.
* Paleta: negro `#000`, blancos con transparencia para la jerarquía, verde `#30d158`, amarillo `#ffd60a`, rojo `#ff453a`, naranja `#ff9f0a`, azul `#0a84ff`.
* **Iconos propios:** SVG en `recursos/iconos/` con sufijo **`-symbolic.svg`**, solo **rellenos** (sin `stroke`, porque GNOME recolorea únicamente el relleno). Se cargan con `icono(ICONOS.NOMBRE)` y toman el `color` del CSS.
* Iconos de apps (Brave, WhatsApp…): `iconoDeAplicacion()` o el `gicon` que trae la notificación.

---

## 6. Módulos (GJS / ESM)

```javascript
// APIs de GNOME
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

// Shell
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Locales (rutas relativas, siempre con .js)
import {ControladorIsla} from './modulos/controlador.js';
import {IslaUI} from './modulos/ui/isla.js';
```

* Clases visuales con `GObject.registerClass` e `_init(...)`. Limpieza con `this.connect('destroy', ...)`, sin sobrescribir `vfunc_destroy`.
* En GNOME 50 los clics se detectan con `Clutter.ClickGesture` y los arrastres con `Clutter.PanGesture` (no con `button-press-event`).
  - Señales de `PanGesture`: `recognize` (empieza, tras superar el umbral), `pan-update`, `end`, `cancel`. **No existe `pan-begin`**: conectarla hace fallar `enable()`.
  - Para vetar un gesto según dónde empieza: `may-recognize` (devuelve `false` para impedirlo).
  - Un arrastre que puede salir del actor necesita `global.stage.grab(actor)` en `recognize` y `dismiss()` en `end`/`cancel`.
  - Un `PanelMenu.Button` creado sin menú sigue registrado en `Main.panel.menuManager` con un menú vacío. Ese gestor abre el menú del botón vecino si el puntero pasa por encima mientras se arrastra, y el arrastre se cancela. La isla se quita de ese gestor al montarse.
* No usar `fuente.iconName` de una fuente de notificaciones: en GNOME 50 siempre devuelve `null` (consulta una propiedad que no existe). Leer `fuente.icon` (`Gio.ThemedIcon`) y sus `get_names()`.
* `St.BoxLayout` vertical: `orientation: Clutter.Orientation.VERTICAL` (la propiedad `vertical` está obsoleta).
* No usar opciones de la API de GNOME sin comprobarlas en GNOME 50. Por ejemplo, `addTopChrome` solo acepta `trackFullscreen` y `affectsStruts`; cualquier otra opción hace fallar `enable()`.

---

## 7. Convenciones de nombres

* **Clases:** PascalCase (`ControladorIsla`, `TarjetaFlotante`, `IndicadorBateria`).
* **Métodos y funciones:** camelCase con verbo (`mostrarVista()`, `establecerActiva()`, `animarEntrada()`).
  - `actualizar(datos)`: pinta datos nuevos.
  - `establecerX(valor)`: cambia un modo o estado.
  - `animarEntrada()`: animación al aparecer.
  - `destruir()`: limpieza en clases JS normales (las de GObject usan `destroy()`).
  - `_alEvento()`: manejador de una señal (`_alPulsar`, `_alHacerScroll`).
* **Privados:** prefijo `_` (`this._tarjeta`, `_evaluarPuntero()`).
* **Constantes:** MAYÚSCULAS con guion bajo y la unidad al final (`TIEMPO_ALERTA_BLUETOOTH_MS`, `ANCHO_ALERTA_PX`).
* **Claves de ajustes:** minúsculas con guiones (`tiempo-cierre-ms`).
* **Archivos:** camelCase (`tarjetaFlotante.js`, `anilloBateria.js`).

---

## 8. Antes de dar un cambio por terminado

```bash
npm run probar:todo
```

Debe terminar con **✔ Todo correcto**. Ejecuta, en orden:

1. **ESLint** (`eslint.config.js`): errores comunes y reglas del proyecto. Falla si hay `console.*` fuera de `registro.js`, un `catch {}` vacío o una llamada a `ease()` / `ease_property()` fuera de `ui/movimiento.js`.
2. **Esquema:** `glib-compile-schemas --strict schemas/`.
3. **Pruebas unitarias** (`pruebas/unitarias/`): controlador, protocolo de los AirPods, reconocedor de apps, temporizador y coincidencia entre el esquema y `ajustes.js`. Corren con `gjs -m`, fuera del Shell, y usan una caché temporal para no tocar el registro real.
4. **GNOME Shell aislado** (`pruebas/aislado/`): activa la isla, muestra una alerta, la desactiva y comprueba que no queda nada (cápsula, tarjeta, reloj oculto, métodos reemplazados de GNOME), la reactiva y revisa que no haya `JS ERROR` ni líneas `ERROR` en el registro.

Además:

* **Lógica nueva** en el controlador o en un módulo puro → añade casos en `pruebas/unitarias/`. Un archivo nuevo debe terminar en `.prueba.js` y usar `ejecutar()` / `prueba()` de `pruebas/utilidades.js`.
* **Limpieza nueva** en `disable()` (otra señal, otro método reemplazado) → añade la comprobación en `pruebas/aislado/prueba-isla@local/extension.js`.
* **Unidades del touchpad:** Clutter entrega el desplazamiento suave en *unidades* (px ÷ 10). Un umbral de 2,2 equivale a ~22 px. Al simular gestos con un dispositivo virtual, enviar valores realistas.
* **Licencia:** todo archivo nuevo empieza con la cabecera
  ```javascript
  // SPDX-License-Identifier: GPL-2.0-or-later
  // SPDX-FileCopyrightText: 2026 JuniorArias02
  ```
* **Antes de publicar una versión:** `npm run probar:paquete`, que prueba el `.zip` instalado tal como lo recibirán los usuarios (ver [PUBLICACION.md](PUBLICACION.md)).
* **Mensajes al journal:** `registrarInfo` solo para arranques y cambios de estado poco frecuentes. Lo que ocurre a menudo (cada notificación, cada canción) va con `registrarDepuracion`. Los revisores de extensions.gnome.org rechazan extensiones que llenan el journal.
* **Documentación:** si cambian capas, estados, tiempos, gestos o ajustes, se actualizan `ARQUITECTURA.md` y `LOGICA_Y_FLUJO.md` en el mismo cambio.

---

## 9. Autoría

El proyecto pertenece a **JuniorArias02**. El UUID es `isla-dinamica@juniorarias02` y no debe cambiarse: si cambia, hay que renombrar la carpeta en `~/.local/share/gnome-shell/extensions/` y la entrada en `enabled-extensions`.

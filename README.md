# Isla Dinámica

Extensión para **GNOME Shell 50** que convierte el centro del panel superior en una isla dinámica: una cápsula negra que muestra la hora, la música o un temporizador, y que se transforma para mostrar notificaciones, auriculares, volumen y otros avisos del sistema.

**Autor:** JuniorArias02 · **UUID:** `isla-dinamica@juniorarias02` · **Compatible con:** GNOME Shell 50 (Wayland)

---

## Funciones

| | |
| :--- | :--- |
| **Cápsula** | Hora, música (portada, título y onda), audio de WhatsApp (vista y página propias, aparte de la música: logo, duración y solo reproducir/pausa) o cuenta atrás. Al arrastrarla se asoma la vista de al lado, siguiendo al puntero, y al soltar pasada la mitad se queda; en los ajustes se puede elegir que cambie al instante. También se cambia deslizando con dos dedos |
| **Círculo** | Segunda actividad junto a la cápsula: batería de los auriculares, música o temporizador |
| **Isla abierta** | Con un clic: páginas de Calendario, Música, Notificaciones, Dispositivos y Temporizador |
| **Calendario** | El mes actual y los próximos eventos de tu calendario de GNOME (Google y demás cuentas en línea). Es la página de la hora |
| **Notificaciones** | WhatsApp Web, Telegram y todos los avisos del sistema (también los urgentes) con foto del contacto. Los mensajes del mismo chat se agrupan y al tocarlos se abre la conversación |
| **Llamadas** | La llamada que suena (WhatsApp, Meet, Telegram, Teams...) con botón rojo y verde: si la app lo permite, se contesta o se rechaza desde la isla; si no, el verde abre la app. Si la ocultas, queda como un círculo verde junto a la cápsula hasta que deja de sonar. Durante la llamada o videollamada (en Chrome, Brave, Firefox... o en Zoom, Teams, Discord), la cápsula se pone verde con el contador; al tocarla, botones para silenciar el micrófono e ir a la llamada |
| **"No molestar"** | Silencia también la isla. Opcionalmente, la isla puede seguir avisando en silencio |
| **AirPods** | Batería de cada auricular y del estuche, detección de oído y modo de ruido (cancelación, normal, transparencia). Funciona con originales y con clones compatibles |
| **Otros auriculares Bluetooth** | Aviso al conectar con su batería |
| **Volumen y brillo** | Se muestran en la isla en lugar del recuadro de GNOME |
| **Cargador** | Aviso al enchufar o desenchufar, con porcentaje y tiempo restante |
| **Temporizador** | Ruedas de horas, minutos y segundos para elegir cualquier duración (como en el móvil), atajos de 1, 5, 15 y 30 min, pausa, +1 min y alarma. Recuerda la última duración |
| **"Copiado"** | Aviso breve al copiar algo. Nunca se lee lo copiado |
| **No molestar y modo avión** | Aviso al activarlos o desactivarlos |
| **Grabación de pantalla** | La cápsula se pone roja con el contador mientras grabas; al tocarla, botón para detener. Al terminar, aviso con la duración que abre el vídeo |
| **Capturas de pantalla** | Aviso con la miniatura de la captura; al tocarlo se abre la imagen |
| **Menú rápido** | Clic derecho en la isla: No molestar, capturar y grabar la pantalla, ajustes y registro de errores |
| **Privacidad** | Puntos de color cuando se usa el micrófono (naranja), la cámara (verde) o se graba la pantalla (rojo) |

Dos estilos a elegir en los ajustes: **Liquid Glass** (por defecto: vidrio de verdad, que desenfoca el fondo de pantalla y las ventanas de detrás, con esquinas redondeadas, el canto refractado como una lente, borde de luz y brillo especular) o **negro clásico**, como la Dynamic Island original.

Todas las transiciones usan resortes: la isla crece desde la cápsula, el contenido aparece después de la forma y al cerrar la cápsula aterriza con un pequeño rebote. Al cambiar de actividad (deslizar, empezar la música, una grabación...), la cápsula se cierra hasta un círculo y renace con el contenido nuevo.

---

## Requisitos

| Componente | Versión |
| :--- | :--- |
| GNOME Shell | **50.x** |
| Sesión | Wayland |
| BlueZ | 5.x (para AirPods) |

```bash
gnome-shell --version     # GNOME Shell 50.x
echo $XDG_SESSION_TYPE    # wayland
```

En GNOME 49 o anteriores no carga: usa APIs que cambiaron en GNOME 50 (gestos de Clutter, `addTopChrome`, `St.BoxLayout.orientation`). Detalles en [.docs/CONSIDERACIONES_SISTEMA.md](.docs/CONSIDERACIONES_SISTEMA.md#compatibilidad).

---

## Instalación

### Desde una versión publicada (recomendado)

Descarga `isla-dinamica@juniorarias02.shell-extension.zip` de la página de [versiones](https://github.com/JuniorArias02/isla-dinamica/releases) e instálalo:

```bash
gnome-extensions install isla-dinamica@juniorarias02.shell-extension.zip
```

### Desde el código

```bash
git clone https://github.com/JuniorArias02/isla-dinamica.git \
    ~/.local/share/gnome-shell/extensions/isla-dinamica@juniorarias02

glib-compile-schemas ~/.local/share/gnome-shell/extensions/isla-dinamica@juniorarias02/schemas/
```

En cualquiera de los dos casos: en Wayland, GNOME solo detecta extensiones nuevas al iniciar sesión. Cierra sesión, vuelve a entrar y actívala:

```bash
gnome-extensions enable isla-dinamica@juniorarias02
```

### Actualizar

```bash
cd ~/.local/share/gnome-shell/extensions/isla-dinamica@juniorarias02
git pull
glib-compile-schemas schemas/
```

Los cambios de código se cargan al volver a iniciar sesión.

---

## Uso

| Acción | Resultado |
| :--- | :--- |
| Clic en la cápsula | Abre la isla en la página de lo que muestra la cápsula (con la hora: el calendario) |
| Clic en el calendario | Abre la app Calendario |
| Arrastrar la cápsula a los lados | Se asoma la vista de al lado (hora ↔ música ↔ temporizador). Volver sin soltar deja todo igual; soltar pasada la mitad la cambia. Con el ajuste "Cambiar al instante", al soltar cambia directamente con la transición por el círculo |
| Dos dedos a los lados sobre la cápsula | Cambia la vista directamente |
| Clic en el círculo | Intercambia la actividad del círculo con la de la cápsula |
| **Clic derecho** en la isla | Menú: No molestar, Ajustes de la isla, Registro de errores |
| Deslizar a los lados con la isla abierta | Cambia de página |
| Deslizar hacia arriba / rueda del ratón | Cierra la isla o descarta la alerta |
| Clic en una notificación | Abre la app o el chat |
| Botón verde / rojo de una llamada que suena | Contesta / rechaza (si la app lo permite; si no, el verde abre la app) |
| Clic en la cápsula durante una llamada | Contador, silenciar el micrófono e ir a la llamada |
| Clic en la portada o el título de la canción | Lleva a la ventana donde suena (la pestaña de YouTube en Brave, Spotify…) |
| Clic en la barra de progreso | Salta a ese punto de la canción |

La lista completa de gestos está en [.docs/LOGICA_Y_FLUJO.md](.docs/LOGICA_Y_FLUJO.md#3-gestos).

---

## Ajustes

**Clic derecho en la isla → Ajustes de la isla**, o:

```bash
gnome-extensions prefs isla-dinamica@juniorarias02
```

- **Notificaciones:** modo privado (oculta el texto de los mensajes), avisar con "No molestar", duración en pantalla.
- **Isla:** estilo (**Liquid Glass** o negro clásico), abrir con el puntero encima, cierre automático, ocultar el reloj de Ubuntu, qué pasa al arrastrar la cápsula (asomarse o cambiar al instante), animar aunque las animaciones del sistema estén desactivadas.
- **Avisos:** volumen y brillo, cargador, "Copiado", "No molestar" y modo avión, capturas y grabaciones de pantalla, llamadas y videollamadas (y ocultar el indicador de grabación de GNOME), puntos de privacidad.

Los cambios se aplican al instante.

---

## Privacidad

- No se envía nada fuera del equipo. Toda la información se obtiene por D-Bus y las APIs de GNOME.
- El registro de errores nunca guarda el texto de las notificaciones, solo datos técnicos (aplicación, tipo de imagen).
- Los eventos del calendario solo se muestran en la isla; sus títulos nunca se escriben en el registro.
- Del portapapeles solo se lee el **tipo** (texto, imagen, archivos) y la aplicación, nunca el contenido.
- Para las llamadas solo se mira **qué app** usa el micrófono y el título de las ventanas. Nunca se escucha ni se graba sonido.
- Las fotos de los contactos se copian a `~/.cache/isla-dinamica/fotos/` para poder mostrarlas, y la carpeta se vacía en cada inicio.

---

## Registro de errores

Los avisos y errores, con su contexto y pila de llamadas, se guardan en:

```bash
cat ~/.cache/isla-dinamica/registro.log
```

En vivo:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i isla-dinamica
```

También se puede abrir con **clic derecho en la isla → Registro de errores**.

---

## Estructura

```text
isla-dinamica/
├── extension.js          Punto de entrada: crea y conecta las piezas
├── prefs.js              Ventana de ajustes
├── metadata.json
├── stylesheet.css
├── schemas/              Opciones (GSettings)
├── recursos/iconos/      Iconos propios
├── pruebas/              Pruebas unitarias y de carga en un GNOME aislado
├── modulos/
│   ├── constantes.js     Tiempos, tamaños, prioridades y estados
│   ├── ajustes.js        Acceso a las opciones del usuario
│   ├── registro.js       Registro de errores
│   ├── controlador.js    Máquina de estados y cola de alertas
│   ├── servicios/        Bluetooth, AirPods, música, notificaciones, energía…
│   └── ui/               Cápsula, isla, vistas y componentes
└── .docs/                Documentación técnica
```

---

## Desarrollo

Requisitos: `gjs` (viene con GNOME) y, para la revisión del código, Node.js con npm.

```bash
npm install              # una sola vez: instala ESLint
npm run probar           # revisión del código + esquema + pruebas unitarias (~10 s)
npm run probar:todo      # lo anterior + carga real en un GNOME Shell aislado (~30 s)
npm run revisar          # solo la revisión del código
npm run empaquetar       # crea el .zip para publicar en dist/
npm run probar:paquete   # crea el .zip y lo prueba instalado en un GNOME aislado
```

Sin npm, `./pruebas/ejecutar.sh` también funciona (comprueba la sintaxis en lugar de usar ESLint).

Antes de enviar un cambio, `npm run probar:todo` debe terminar con **✔ Todo correcto**.

---

## Documentación

| Documento | Contenido |
| :--- | :--- |
| [ARQUITECTURA.md](.docs/ARQUITECTURA.md) | Capas, archivos, flujo de datos e integración con el sistema |
| [LOGICA_Y_FLUJO.md](.docs/LOGICA_Y_FLUJO.md) | Estados, prioridades, gestos y tiempos |
| [REGLAS_Y_ESTANDARES.md](.docs/REGLAS_Y_ESTANDARES.md) | Normas de código obligatorias para contribuir |
| [CONSIDERACIONES_SISTEMA.md](.docs/CONSIDERACIONES_SISTEMA.md) | Compatibilidad, pruebas y depuración |
| [PUBLICACION.md](.docs/PUBLICACION.md) | Cómo publicar una versión en GitHub y en extensions.gnome.org |

Antes de modificar el código, lee **REGLAS_Y_ESTANDARES.md**.

---

## Licencia

Copyright © 2026 JuniorArias02.

Este programa es software libre: puedes redistribuirlo y modificarlo bajo los términos de la **Licencia Pública General de GNU, versión 2 o posterior** (GPL-2.0-or-later). El texto completo está en [LICENSE](LICENSE).

---

## Autor

Desarrollado por **JuniorArias02**.

# Arquitectura

Capas de la extensión, responsabilidad de cada archivo, flujo de datos e integración con el sistema (BlueZ, MPRIS2, UPower, notificaciones de GNOME).

> Antes de modificar código, lee también [REGLAS_Y_ESTANDARES.md](REGLAS_Y_ESTANDARES.md). Las reglas de dependencia entre capas son obligatorias.

---

## 1. Capas

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  CAPA 1: PRESENTACIÓN  (modulos/ui/)                                     │
│  IslaUI (fachada) → BotonPanel, TarjetaFlotante, Vistas, Componentes     │
│  GestorInteraccion: puntero, clics, arrastres, deslizamientos            │
└───────────────▲──────────────────────────────────────┬───────────────────┘
                │ vista (objeto plano)                 │ acciones del usuario
                │ mostrarVista(vista)                  │ (abrir, cerrar, pulsar...)
┌───────────────┴──────────────────────────────────────▼───────────────────┐
│  CAPA 2: CONTROLADOR  (modulos/controlador.js)                           │
│  Máquina de estados: REPOSO · MULTIMEDIA · ALERTA · EXPANDIDO            │
│  Cola de alertas por prioridad · actividades · notificaciones recientes  │
└───────────────▲──────────────────────────────────────────────────────────┘
                │ datos normalizados (pista, dispositivos, alertas...)
┌───────────────┴──────────────────────────────────────────────────────────┐
│  CAPA 3: SERVICIOS  (modulos/servicios/)                                 │
│  Bluetooth · AirPods · Multimedia · Notificaciones · Reloj · OSD         │
│  Energía · Temporizador · Portapapeles · Privacidad                      │
└───────────────▲──────────────────────────────────────────────────────────┘
                │ D-Bus / API de GNOME Shell y Mutter
┌───────────────┴──────────────────────────────────────────────────────────┐
│  SISTEMA: BlueZ · reproductores MPRIS2 · UPower · GNOME Shell · Mutter   │
└──────────────────────────────────────────────────────────────────────────┘

extension.js = raíz de composición: crea las piezas y las conecta. No tiene lógica propia.
```

### Reglas de dependencia

| Módulo | Puede importar | No puede importar |
| :--- | :--- | :--- |
| `extension.js` | todo | — |
| `registro.js`, `constantes.js`, `ajustes.js` | `gi://Gio`, `gi://GLib` | ningún otro módulo del proyecto (todos los demás pueden importarlos) |
| `prefs.js` | `ajustes.js`, `registro.js`, GTK/Adw | nada del Shell (corre en otro proceso) |
| `servicios/*` | `constantes.js`, `ajustes.js`, `registro.js`, `gi://`, `resource:///` | `controlador.js`, `ui/*` |
| `controlador.js` | `constantes.js`, `registro.js`, `GLib` | `St`, `Clutter`, `Main`, `ui/*`, `servicios/*` |
| `ui/*` | `constantes.js`, `ajustes.js`, `registro.js`, otros `ui/*`, `St`, `Clutter`, `Main` | `controlador.js`, `servicios/*` |

* Los **servicios** solo entregan datos por callbacks. No saben que existe una interfaz.
* El **controlador** decide qué se muestra. No depende de Clutter ni St: es lógica pura y se puede probar con `gjs` fuera del Shell.
* La **UI** dibuja la `vista` que recibe y comunica lo que hace el usuario mediante las `acciones` que le entrega `extension.js`. Nunca decide prioridades.

---

## 2. Estructura de archivos

```text
├── extension.js                  Raíz de composición (enable/disable)
├── prefs.js                      Ventana de ajustes (GTK 4 + libadwaita, otro proceso)
├── metadata.json
├── stylesheet.css                Todos los estilos (clases con prefijo .isla-)
├── schemas/                      Esquema GSettings
├── recursos/iconos/              Iconos propios *-symbolic.svg (se recolorean con CSS)
└── modulos/
    ├── constantes.js             Tiempos, tamaños, resortes, prioridades, estados. Única fuente de valores fijos
    ├── registro.js               Registro: journal + ~/.cache/isla-dinamica/registro.log, protegido(), intentar()
    ├── ajustes.js                Opciones del usuario (GSettings): ajuste(clave), alCambiarAjuste()
    ├── controlador.js            Capa 2: ControladorIsla
    ├── servicios/                Capa 3
    │   ├── bluetooth.js          MonitorBluetooth: auriculares y batería (BlueZ, bus de sistema)
    │   ├── mpris.js              MonitorMultimedia + Reproductor: música (bus de sesión)
    │   ├── notificaciones/
    │   │   ├── capturador.js     CapturadorNotificaciones: reemplaza el banner nativo y enriquece los datos
    │   │   └── reconocedorApps.js Puro: identifica WhatsApp, Telegram, Discord... (nombre, id de app web, origen)
    │   ├── reloj.js              MonitorReloj: hora y fecha (GnomeDesktop.WallClock)
    │   ├── osd.js                CapturadorOsd: volumen y brillo en la isla
    │   ├── energia.js            MonitorEnergia: cargador enchufado/desenchufado (UPower)
    │   ├── temporizador.js       Temporizador propio (iniciar, pausar, +1 min, alarma)
    │   ├── portapapeles.js       MonitorPortapapeles: "Copiado" (tipo y app, nunca el contenido)
    │   ├── privacidad.js         MonitorPrivacidad: micrófono, cámara y pantalla en uso
    │   └── airpods/              Protocolo de Apple (AAP): batería por pieza, estuche, oído, modo de ruido
    │       ├── protocolo.js      Puro: interpreta y construye paquetes
    │       ├── perfilBluez.js    PerfilAap (org.bluez.Profile1) + SesionAap (canal L2CAP 0x1001)
    │       └── monitor.js        MonitorAirPods: fachada, reintentos, estado por dispositivo
    └── ui/                       Capa 1
        ├── isla.js               IslaUI: fachada. Lo único que ve extension.js
        ├── interaccion.js        GestorInteraccion: clic, arrastre, deslizamiento, cierre automático
        ├── tarjetaFlotante.js    TarjetaFlotante: la isla grande, con morfosis desde la cápsula
        ├── botonPanel.js         BotonPanel: elemento del panel (Pildora + Burbuja)
        ├── iconos.js             Catálogo de iconos propios + icono a color de apps
        ├── movimiento.js         Motor de movimiento: animar(), resortes, entrada/salida de contenido
        ├── animaciones.js        Efectos sobre el motor (saltar, aplastar, aterrizar...)
        ├── formato.js            Textos: "hace 3 min", "3 mensajes nuevos"
        ├── componentes/          Piezas visuales reutilizables, sin lógica de negocio
        │   ├── pildora.js        Cápsula del panel (hora, música, temporizador, puntos de estado)
        │   ├── burbuja.js        Círculo con la actividad secundaria
        │   ├── anilloProgreso.js Aro (Cairo, animable) y AnilloProgreso
        │   ├── anilloBateria.js  IndicadorBateria: aro con colores de batería
        │   ├── caratula.js       Portada redondeada o circular
        │   ├── onda.js           Barras de audio animadas
        │   ├── barraProgreso.js  Tiempo y barra de la pista (clic para saltar)
        │   ├── botonControl.js   Botón multimedia con efecto de pulsación
        │   ├── bateriasAirpods.js Tres anillos (izquierdo, derecho, estuche)
        │   ├── selectorRuido.js  Cancelación · Normal · Transparencia
        │   ├── avatar.js         Foto del contacto + insignia de la app
        │   └── carrusel.js       Páginas deslizables con puntos indicadores
        └── vistas/               Contenidos que se alojan en la TarjetaFlotante
            ├── alertaBluetooth.js
            ├── alertaNotificacion.js
            ├── alertaIndicador.js       Volumen / brillo
            ├── alertaEnergia.js         Cargando / usando batería
            ├── alertaPortapapeles.js    "Copiado"
            ├── alertaTemporizador.js    "¡Tiempo cumplido!"
            ├── vistaExpandida.js        Cabecera con fecha + carrusel
            ├── paginaMusica.js
            ├── paginaNotificaciones.js  Recientes agrupadas por chat
            ├── paginaDispositivos.js
            └── paginaTemporizador.js
```

**Componente y vista:** un *componente* es una pieza visual genérica (anillo, botón, onda) que no sabe qué representa. Una *vista* combina componentes para un caso concreto (alerta de auriculares, página de música).

---

## 3. Flujo de datos

```text
BlueZ ──PropertiesChanged──▶ MonitorBluetooth ──(tipo, dispositivo)──▶ extension.js
                                                                        │
Reproductor ──PropertiesChanged──▶ MonitorMultimedia ──(pista)─────────┤
                                                                        │
GNOME ──_showNotification──▶ CapturadorNotificaciones ──(clave, datos)─┤
                                                                        │
... resto de servicios ─────────────────────────────────────────────────┤
                                                                        ▼
                                                              ControladorIsla
                                                                        │
                                                         _emitirVista() │
                                                                        ▼
                                                               IslaUI.mostrarVista()
                                     ┌──────────────────────────────────┼─────────────────────┐
                                     ▼                                  ▼                     ▼
                              BotonPanel.actualizar         TarjetaFlotante.mostrar   GestorInteraccion
                              (cápsula + círculo)           u ocultar (morfosis)      .alCambiarEstado

Usuario ──clic/arrastre/deslizamiento──▶ GestorInteraccion ──▶ IslaUI ──acción──▶ extension.js ──▶ controlador / servicio
```

La **vista** es un objeto plano:

```javascript
{estado, alerta, pista, dispositivos, reloj, notificaciones, temporizador, privacidad, actividades}
```

La UI debe poder dibujarse completa solo con ella.

---

## 4. Capa de presentación

### 4.1 Dos actores en pantalla

| Actor | Dónde vive | Para qué |
| :--- | :--- | :--- |
| `BotonPanel` | `Main.panel`, centro | Cápsula + círculo. Ocupa espacio real en el panel |
| `TarjetaFlotante` | `Main.layoutManager.addTopChrome` | La isla grande (alertas y vista expandida). Flota sobre las ventanas |

### 4.2 Actividades: cápsula y círculo

Las **actividades** son cosas que duran: el **temporizador** (en marcha o en pausa) y la **música** (sonando). Las notificaciones no son actividades, son alertas temporales.

El controlador las calcula en `_calcularActividades()` y las entrega en `vista.actividades`:

1. **Principal** (cápsula): la actividad preferida por el usuario si está disponible; si no, la primera según `ORDEN_ACTIVIDADES` (temporizador, música).
2. **Secundaria** (círculo): la otra actividad. Si no hay, los auriculares conectados (batería).

La **hora** también es una vista de la cápsula (`VISTAS_COMPACTAS`: hora → música → temporizador) y siempre está disponible.

La preferencia cambia cuando el usuario:

* arrastra o desliza la cápsula (`cambiarVistaCompacta(±1)`; en los extremos devuelve `false` y la cápsula rebota);
* mira la página de Música o de Temporizador en la isla abierta (al cerrar, esa queda en la cápsula);
* toca el círculo (intercambio).

La preferencia se mantiene aunque la actividad se pause y vuelva.

> `alVerPagina` avisa al controlador con `Promise.resolve().then(...)`: se invoca mientras el controlador está emitiendo la vista, y una llamada directa volvería a entrar en él.

### 4.3 Morfosis (cápsula → isla)

La tarjeta no aparece de golpe: nace con la posición y el tamaño de la cápsula (`Pildora.obtenerRectangulo()`) y crece con resortes (`ui/movimiento.js`):

1. **Forma primero:** `x + width` con un resorte e `y + height` con otro algo más lento. Se ensancha, crece hacia abajo, se pasa ~5 % y rebota.
2. **Contenido después** (~110 ms): de transparente y al 92 % a visible y al 100 %.
3. **Al cerrar:** primero se va el contenido; luego la forma se encoge con un resorte firme y la cápsula aterriza con un pequeño rebote.
4. **Al tocar:** la isla se aplasta (93 %) y rebota.

Los parámetros están en `RESORTES` (`constantes.js`); la tabla está en [LOGICA_Y_FLUJO.md](LOGICA_Y_FLUJO.md#5-tiempos-y-parámetros).

* **Curvas:** con `USAR_RESORTE_FISICO = false` (valor actual), `animarConResorte` usa las curvas de GNOME (`EASE_OUT_BACK` si el resorte rebota, `EASE_OUT_CUBIC` si es firme). La curva física propia (`set_progress_func`) está desactivada porque en sesiones reales llegó a dejar la tarjeta detenida a mitad de animación. Hay que validarla en un GNOME aislado antes de activarla.
* **Seguro de cierre:** si la animación de cierre no notifica su final, `TarjetaFlotante` oculta la tarjeta igualmente y deja un `AVISO` en el registro.
* **Animaciones forzadas:** con el ajuste `forzar-animaciones`, la isla anima aunque GNOME tenga desactivadas las animaciones (`enable-animations=false` o *Reducir movimiento*), mediante `animationRequired`. El resto del escritorio no cambia.
* El `border-radius` grande (36 px) se recorta cuando la tarjeta es baja, por eso al principio se ve como una cápsula.
* El contenido tiene ancho fijo y la tarjeta lo recorta (`_lienzo` con `clip_to_allocation`), así no se reacomoda durante la animación.
* El contenido pertenece a quien lo crea (IslaUI). La tarjeta lo aloja, lo anima y lo saca, pero nunca lo destruye.

### 4.4 Qué se muestra en cada estado

| Estado | Cápsula (panel) | Tarjeta flotante |
| :--- | :--- | :--- |
| `REPOSO` | La actividad principal, o la hora si no hay (+ círculo con la secundaria) | Oculta |
| `MULTIMEDIA` | La actividad principal + círculo con la otra | Oculta |
| `ALERTA` | Sin cambios (queda debajo) | La vista de la alerta (300–380 px) |
| `EXPANDIDO` | Sin cambios (queda debajo) | `VistaExpandida`: fecha y hora + carrusel (420 px) |

### 4.5 Reloj de Ubuntu

La isla ocupa el lugar del reloj y muestra la hora. Con el ajuste `ocultar-reloj-gnome`, `IslaUI` oculta **solo el texto** del reloj de GNOME (`dateMenu._clockDisplay`) y lo vuelve a mostrar en `disable()` o al desactivar el ajuste. El botón original se mantiene porque abre el calendario y el historial de notificaciones. La fecha de la vista expandida también lo abre (`Main.panel.toggleCalendar()`).

---

## 5. Servicios

### 5.1 Bluetooth (bluetooth.js)

* **Bus:** sistema. **Servicio:** `org.bluez`.
* **Estado inicial:** `ObjectManager.GetManagedObjects`. Los dispositivos que ya estaban conectados no generan alerta.
* **Señales:** `PropertiesChanged` (`Device1.Connected`, `Battery1.Percentage`), `InterfacesAdded`, `InterfacesRemoved`.
* **Filtro de audio:** `Icon` empieza por `audio-` o el nombre contiene AirPods, Buds, headphone…
* **Batería:** `org.bluez.Battery1.Percentage` suele llegar segundos **después** de conectar. El evento `BATERIA` actualiza la alerta visible sin reiniciarla.
* **Eventos:** `conectado`, `desconectado`, `bateria` con `{ruta, nombre, icono, bateria, uuids}`. Los `uuids` permiten saber si el dispositivo habla el protocolo de Apple.

### 5.2 Multimedia (mpris.js)

* **Bus:** sesión. **Nombres:** `org.mpris.MediaPlayer2.*` (Brave: `org.mpris.MediaPlayer2.brave.instanceNNNN`).
* **Descubrimiento:** `ListNames` al inicio + `NameOwnerChanged` filtrado por prefijo (`MATCH_ARG0_NAMESPACE`).
* **Por reproductor:** proxies de `org.mpris.MediaPlayer2.Player` (estado, metadatos, comandos) y `org.mpris.MediaPlayer2` (`Identity`, `DesktopEntry`, `Raise`).
* **Reproductor activo:** el último que pasó a `Playing`; si ninguno suena, el último con actividad.
* **Carátula:** solo `file://`. Las URL `http` se ignoran para no descargar nada dentro del Shell.
* **Posición:** MPRIS no notifica el avance. Se consulta `Position` **solo** con la isla abierta en la página de música y sonando.
* **Comandos:** `PlayPause`, `Next`, `Previous`, `Raise` y `SetPosition` (clic en la barra; solo si `CanSeek` y la pista tiene `mpris:trackid`).

### 5.3 AirPods (airpods/)

Funciona con AirPods originales y con clones que implementan el protocolo de Apple (AAP), que se anuncian con el UUID `74ec2172-0bad-4d01-8f77-997b2be0722a`.

```text
BlueZ ──Device1.Connected──▶ MonitorBluetooth ──CONECTADO──▶ extension.js ──vincular()──▶ MonitorAirPods
MonitorAirPods ──ConnectProfile(UUID AAP)──▶ BlueZ ──NewConnection(fd)──▶ PerfilAap ──▶ SesionAap
SesionAap ──paquetes──▶ protocolo.interpretarPaquete() ──▶ {izquierdo, derecho, estuche, modoRuido, oido}
estado ──▶ extension.js (_refrescarDispositivos: dispositivo.airpods) ──▶ controlador ──▶ UI
```

* **Sin programas externos:** la isla publica `org.bluez.Profile1` en el bus de sistema, registra el UUID AAP con PSM `0x1001` y BlueZ le entrega el canal abierto.
* **Inicio de sesión:** saludo → activar funciones → pedir notificaciones (`PAQUETES_INICIO`). El canal admite una escritura a la vez: `SesionAap` usa una cola de envío.
* **Paquetes interpretados:** batería (`04 00 04 00 04 00`), oído (`…06 00`), modo de ruido (`…09 00 0D <modo>`). El resto se ignora.
* **Reintentos:** los auriculares tardan en aceptar el canal tras conectar. Se reintenta `INTENTOS_AAP` veces cada `TIEMPO_REINTENTO_AAP_MS`. Si el canal se cae con el dispositivo aún conectado, se vuelve a abrir.
* **Registro del perfil:** si BlueZ responde que el UUID ya está registrado (por ejemplo tras recargar la extensión), se desregistra y se vuelve a registrar.
* **Modo de ruido:** `establecerModoRuido()` envía el paquete y lo refleja enseguida en la UI. Algunos clones no informan el modo actual; en ese caso el selector queda sin resaltar hasta que el usuario elige uno.

### 5.4 Volumen y brillo (osd.js)

GNOME llama a `Main.osdWindowManager.show` / `showAll` para su recuadro flotante. La isla reemplaza ambos métodos **en la instancia** y los restaura en `disable()`.

* Si el icono es de volumen (`audio-volume-*`), brillo (`display-brightness-*`), teclado o micrófono **y** trae nivel → alerta `INDICADOR` en la isla, sin recuadro de GNOME.
* Cualquier otro aviso (Bloq Mayús, modo avión...) → recuadro de GNOME.
* Con la isla **abierta** o con el ajuste `mostrar-volumen-brillo` desactivado, `_alCambiarIndicador` devuelve `false` y se usa el recuadro de GNOME.
* `nivel` va de 0 a `maximo` (1, o 1,5 con volumen amplificado; lo que supera el 100 % se pinta en naranja).

### 5.5 Energía (energia.js)

UPower, `DisplayDevice` (bus de sistema), `PropertiesChanged`. Cuenta como **enchufado** si `State` es cargando (1), llena (4) o carga pendiente (5); con batería si es descargando (2), vacía (3) o descarga pendiente (6). El estado desconocido (0) se ignora porque UPower lo emite de forma transitoria. Solo avisa en el **cambio**: el estado al arrancar no genera alerta. El aviso de batería baja lo da GNOME como notificación y la isla lo muestra como cualquier otra.

### 5.6 Temporizador (temporizador.js)

El Reloj de GNOME no publica sus temporizadores, por eso la isla tiene uno propio. Guarda la **hora de fin** (reloj monotónico) y calcula lo que falta, sin acumular desfases. Mientras corre, un temporizador de una sola vez se reprograma al siguiente cambio de segundo; pausado o inactivo no hay ninguno. Al llegar a cero suena `alarm-clock-elapsed` y `extension.js` lanza la alerta `TEMPORIZADOR`. Tocarla o deslizarla llama a `cancelar()`.

### 5.7 Portapapeles (portapapeles.js)

`global.display.get_selection()` → señal `owner-changed (tipo, fuente)`. Solo se usa `SELECTION_CLIPBOARD`, con fuente **no nula** y que **no** sea `Meta.SelectionSourceMemory`: con cada copia, Mutter también emite `fuente=null` y una fuente en memoria (su copia de respaldo), que sin este filtro generarían avisos duplicados. **Nunca se lee el contenido**, solo los formatos (texto, imagen, archivos) y la app enfocada.

### 5.8 Privacidad (privacidad.js)

Puntos de color en la cápsula, siempre visibles: **naranja** = micrófono, **verde** = cámara, **rojo** = pantalla grabándose o compartiéndose. El punto de notificaciones sin ver es **azul** para no confundirlo con el de la cámara.

| Qué | Fuente | Tipo de API |
| :--- | :--- | :--- |
| Cámara | `Shell.CameraMonitor` → `cameras-in-use` | Pública |
| Micrófono | Visibilidad del indicador de entrada de audio de Ajustes rápidos (`quickSettings._volumeInput._indicator`) | **Interna** |
| Pantalla (herramienta de GNOME) | `Main.screenshotUI` → `screencast-in-progress` | Propiedad GObject del Shell |
| Pantalla (otras apps: OBS, videollamadas) | `global.backend.get_remote_access_controller()` → `new-handle` / `stopped` | Pública (Mutter) |

* GNOME crea los indicadores de Ajustes rápidos de forma **asíncrona**: al iniciar sesión el del micrófono puede no existir todavía. El servicio lo busca cada segundo durante 20 s y, si no aparece, deja un aviso en el registro.
* Estas APIs no indican **qué app** usa el micrófono o la cámara.

### 5.9 Notificaciones (notificaciones/)

Se reemplaza en la instancia `Main.messageTray._showNotification`. Es el punto en que GNOME ya decidió mostrar un banner, respetando *No molestar*, pantalla completa, urgencia baja y la configuración de cada app.

1. La isla saca la notificación de la cola, la marca como vista (`acknowledged = true`) y reproduce su sonido, igual que GNOME.
2. La entrega al controlador como alerta. El historial del calendario se conserva.
3. Las notificaciones **críticas** siguen usando el banner nativo.
4. Al hacer clic en la alerta se llama a `notification.activate()`, que abre la app emisora.
5. `disable()` elimina la propiedad propia y vuelve a quedar el método del prototipo.

#### "No molestar"

Con "No molestar" (`org.gnome.desktop.notifications show-banners = false`), GNOME descarta el aviso **antes** de `_showNotification`. Por eso el capturador también escucha `source-added` → `notification-added` de cada fuente. Mientras "No molestar" está activo y el ajuste `notificar-en-no-molestar` también, la notificación llega a la isla:

* **en silencio:** sin sonido y con `silenciosa: true` (la alerta muestra una luna);
* **sin marcarla como vista:** sigue contando como no leída en GNOME;
* **excepto** las de urgencia baja, las críticas (GNOME muestra su propio aviso) y con una ventana en pantalla completa.

Con "No molestar" desactivado, esa vía se ignora y todo pasa por `_showNotification`, sin duplicados.

#### Datos que entrega el capturador

| Campo | Origen |
| :--- | :--- |
| `aplicacion` `{id, nombre, esChat}` | `reconocedorApps.js`. WhatsApp Web llega como "Brave", pero se reconoce por el nombre ("WhatsApp Web"), por el id de la app web de Brave (`brave-hnpfjngllnobngcgfapefoaidbinmjnm-Default`) o por la web de origen (`web.whatsapp.com`, primera línea del texto) |
| `imagen` | `notification.gicon`: la foto del contacto. Brave **borra** ese archivo al cerrarse la notificación, así que se guarda una copia en `~/.cache/isla-dinamica/fotos/<huella>.img` (la carpeta se vacía al iniciar). Si el archivo ya no existe, `imagen` es `null` y se muestra el icono de la app |
| `iconoApp` | Icono de la app instalada (por ejemplo la app web "WhatsApp Web"); si no, el de la fuente |
| `claveConversacion` | `app + remitente`: agrupa los mensajes del mismo chat |
| `silenciosa` | Llegó con "No molestar" |
| `activar()` / `descartar()` | Abre la app o quita la notificación (también del historial de GNOME) |

* **Agrupación** (`extension.js`): en apps de chat, los mensajes del mismo remitente dentro de `VENTANA_AGRUPAR_MS` comparten la clave de alerta. El controlador **actualiza** la alerta en lugar de crear otra y la isla hace un rebote pequeño con "N mensajes nuevos". Se guardan los últimos `MENSAJES_EN_ALERTA` textos de cada chat y la alerta los muestra uno por línea, con el más reciente resaltado.
* **Recientes** (controlador): las últimas `MAXIMO_NOTIFICACIONES_RECIENTES` van en `vista.notificaciones`. La página las agrupa por chat (`agruparPorChat`); tocar una fila abre el chat y la ✕ descarta todo el chat.
* **Sin ver** (`IslaUI`): las notificaciones llegadas después de la última vez que se vio la página encienden el punto azul de la cápsula. Al abrir la isla con mensajes sin ver, se abre directamente en *Notificaciones*.
* **Privacidad:** el registro anota solo datos técnicos (`fuente`, `appId`, `reconocida`, `origen`, tipo de `imagen`), **nunca el texto**. Con el ajuste `notificaciones-privadas`, la isla muestra "Nuevo mensaje" en lugar del texto.

---

## 6. Interacción

Toda la lógica de puntero vive en `ui/interaccion.js` (`GestorInteraccion`):

* `Clutter.ClickGesture` para los clics y `Clutter.PanGesture` para los arrastres con el ratón.
* `scroll-event` con desplazamiento suave para los gestos de dos dedos en el touchpad (Clutter los entrega en unidades de px ÷ 10).
* Temporizadores de una sola vez para el cierre automático y para bloquear deslizamientos repetidos.

Tras un clic, el gestor exige que el puntero salga y vuelva a entrar (`_requiereSalir`) antes de reaccionar al puntero encima, para que un clic no dispare también la apertura por hover.

La lista completa de gestos está en [LOGICA_Y_FLUJO.md](LOGICA_Y_FLUJO.md#3-gestos).

---

## 7. Registro de errores

`modulos/registro.js` es el único punto de salida de mensajes:

| Función | Destino | Uso |
| :--- | :--- | :--- |
| `registrarInfo(msg, alArchivo?)` | journal (+ archivo si se indica) | Arranques, dispositivos detectados |
| `registrarDepuracion(msg)` | journal (solo con `G_MESSAGES_DEBUG`) | Cambios de estado, detalles |
| `registrarAviso(msg)` | journal + archivo | Situaciones anómalas pero no graves |
| `registrarError(contexto, error)` | journal + archivo, **con pila** | Cualquier excepción |
| `protegido(contexto, fn)` | — | Envuelve callbacks: si fallan, se registra y la isla sigue |
| `intentar(contexto, paso)` | — | Pasos de limpieza en `disable()` que no deben frenar a los siguientes |

Archivo: `~/.cache/isla-dinamica/registro.log` (rota a `registro.anterior.log` al superar 512 KB). La escritura es asíncrona para no bloquear el compositor.

---

## 8. Ajustes del usuario

```text
prefs.js (otro proceso) ──escribe──▶ GSettings ◀──lee en el momento── ajustes.js ◀── toda la isla
                                         │
                                         └─ changed ──▶ extension.js → controlador.refrescar()
                                                        IslaUI (reloj de Ubuntu)
```

* **Esquema:** `schemas/org.gnome.shell.extensions.isla-dinamica.gschema.xml`, declarado en `metadata.json` → `settings-schema`.
* **Lectura:** `ajuste(AJUSTES.CLAVE)` en el momento de usar la opción. Por eso los cambios se aplican sin reiniciar la extensión.
* **Reacción inmediata** (solo donde hace falta): `alCambiarAjuste(clave, fn, dueño)` / `dejarDeEscucharAjustes(dueño)`. Cualquier cambio redibuja la isla con `controlador.refrescar()`.
* **Ventana:** `prefs.js` usa `Adw.SwitchRow` enlazados con `settings.bind()` y `Adw.SpinRow` en **segundos** para las claves que se guardan en milisegundos.

| Clave | Por defecto | Efecto |
| :--- | :--- | :--- |
| `notificaciones-privadas` | `false` | No mostrar el texto de los mensajes |
| `notificar-en-no-molestar` | `true` | Avisar en silencio con "No molestar" |
| `duracion-notificaciones-ms` | 4500 | Tiempo en pantalla de cada notificación |
| `abrir-con-puntero` | `false` | Abrir la isla también al dejar el puntero encima |
| `tiempo-cierre-ms` | 3000 | Cierre automático tras sacar el puntero |
| `ocultar-reloj-gnome` | `true` | Ocultar el texto del reloj de Ubuntu |
| `forzar-animaciones` | `true` | Animar aunque el sistema tenga las animaciones apagadas |
| `mostrar-volumen-brillo` | `true` | Volumen y brillo en la isla |
| `avisar-cargador` | `true` | Aviso del cargador |
| `avisar-copiado` | `true` | Aviso de "Copiado" |
| `mostrar-privacidad` | `true` | Puntos de privacidad |

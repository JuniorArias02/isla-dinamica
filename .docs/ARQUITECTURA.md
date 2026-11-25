# Arquitectura

Capas de la extensión, responsabilidad de cada archivo, flujo de datos e integración con el sistema (BlueZ, MPRIS2, UPower, notificaciones de GNOME).

> Antes de modificar código, lee también [REGLAS_Y_ESTANDARES.md](REGLAS_Y_ESTANDARES.md). Las reglas de dependencia entre capas son obligatorias.

---

## 1. Capas

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  CAPA 1: PRESENTACIÓN  (modulos/ui/)                                     │
│  IslaUI (fachada) → BotonPanel, TarjetaFlotante, Vistas, Componentes     │
│  GestorInteraccion: puntero, clics, arrastres · MenuContextual           │
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
│  Energía · Temporizador · Portapapeles · Privacidad · Modos · Calendario │
│  Grabación de pantalla                                                    │
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
├── pruebas/                      Pruebas (no forman parte de la extensión instalada)
│   ├── ejecutar.sh               Ejecuta todas las comprobaciones
│   ├── utilidades.js             prueba(), igual(), verdadero(), esperar()
│   ├── unitarias/*.prueba.js     Lógica pura con gjs, fuera del Shell
│   └── aislado/                  Carga real en un GNOME Shell sin pantalla
├── eslint.config.js              Revisión automática del código
├── package.json                  Herramientas de desarrollo (ESLint) y comandos npm (probar, empaquetar)
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
    │   │   └── reconocedorApps.js Puro: identifica WhatsApp, Telegram, Meet, Teams... (nombre, id de app web, origen)
    │   ├── llamadas/
    │   │   ├── monitorLlamada.js MonitorLlamada: llamada en curso (quién usa el micrófono + ventanas), silenciar, ir a la llamada
    │   │   └── reconocedorLlamadas.js Puro: ¿el aviso es una llamada sonando? ¿hay una llamada en curso?
    │   ├── reloj.js              MonitorReloj: hora y fecha (GnomeDesktop.WallClock)
    │   ├── calendario.js         MonitorCalendario: eventos del calendario de GNOME
    │   ├── grabacion.js          MonitorGrabacion: grabación de pantalla (contador, detener, abrir herramientas)
    │   ├── reconocedorAudio.js   Puro: ¿lo que suena es música o un audio de un chat (nota de voz)?
    │   ├── ventanas.js           Trae al frente la ventana de un proceso (reproductores sin Raise)
    │   ├── calendarioFechas.js   Puro: cuadrícula del mes (igual que GNOME), eventos de todo el día
    │   ├── osd.js                CapturadorOsd: volumen y brillo en la isla
    │   ├── energia.js            MonitorEnergia: cargador enchufado/desenchufado (UPower)
    │   ├── temporizador.js       Temporizador propio (iniciar, pausar, +1 min, alarma)
    │   ├── portapapeles.js       MonitorPortapapeles: "Copiado" (tipo y app, nunca el contenido)
    │   ├── privacidad.js         MonitorPrivacidad: micrófono, cámara y pantalla en uso
    │   ├── modos.js              MonitorModos: "No molestar" y modo avión
    │   └── airpods/              Protocolo de Apple (AAP): batería por pieza, estuche, oído, modo de ruido
    │       ├── protocolo.js      Puro: interpreta y construye paquetes
    │       ├── perfilBluez.js    PerfilAap (org.bluez.Profile1) + SesionAap (canal L2CAP 0x1001)
    │       └── monitor.js        MonitorAirPods: fachada, reintentos, estado por dispositivo
    └── ui/                       Capa 1
        ├── isla.js               IslaUI: fachada. Lo único que ve extension.js
        ├── interaccion.js        GestorInteraccion: clic, arrastre, deslizamiento, cierre automático
        ├── tarjetaFlotante.js    TarjetaFlotante: la isla grande, con morfosis desde la cápsula
        ├── menuContextual.js     MenuContextual: menú del clic derecho (PopupMenu de GNOME)
        ├── botonPanel.js         BotonPanel: elemento del panel (Pildora + Burbuja, y el Asomo al arrastrar)
        ├── logicaAsomo.js        Cuentas del gesto de asomarse (progreso, confirmar o volver)
        ├── iconos.js             Catálogo de iconos propios + icono a color de apps
        ├── movimiento.js         Motor de movimiento: animar(), resortes, entrada/salida de contenido
        ├── animaciones.js        Efectos sobre el motor (saltar, aplastar, aterrizar...)
        ├── formato.js            Textos: "hace 3 min", "3 mensajes nuevos"
        ├── componentes/          Piezas visuales reutilizables, sin lógica de negocio
        │   ├── pildora.js        Cápsula del panel (hora, música, temporizador, puntos de estado)
        │   ├── burbuja.js        Círculo con la actividad secundaria
        │   ├── asomo.js          Asomarse a la vista de al lado mientras se arrastra la cápsula
        │   ├── vidrio.js         Liquid Glass: lo de detrás, desenfocado, con esquinas redondeadas y canto refractado
        │   ├── anilloProgreso.js Aro (Cairo, animable) y AnilloProgreso
        │   ├── anilloBateria.js  IndicadorBateria: aro con colores de batería
        │   ├── caratula.js       Portada redondeada o circular (con estado "cargando")
        │   ├── esqueleto.js      Barra gris que ocupa el lugar de un texto mientras carga
        │   ├── onda.js           Barras de audio animadas
        │   ├── barraNivel.js     BarraNivel: barra con relleno proporcional (fraccion animable)
        │   ├── ruedaSelector.js  RuedaSelector: columna de números que gira como un cilindro (estilo iPhone)
        │   ├── selectorDuracion.js SelectorDuracion: horas, minutos y segundos con tres ruedas
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
            ├── alertaModo.js            "No molestar" / modo avión
            ├── vistaExpandida.js        Cabecera con fecha + carrusel
            ├── paginaCalendario.js      Mes actual + próximos eventos (la página de la hora)
            ├── paginaGrabacion.js       Grabación en curso: contador y botón para detener
            ├── paginaLlamada.js         Llamada en curso: contador, silenciar el micrófono, ir a la llamada
            ├── alertaLlamada.js         Llamada sonando: contestar (verde) y rechazar (rojo)
            ├── alertaCaptura.js         Captura hecha (con miniatura)
            ├── alertaGrabacion.js       Grabación terminada (título de GNOME + duración)
            ├── paginaMusica.js
            ├── paginaNotificaciones.js  Recientes agrupadas por chat
            ├── paginaDispositivos.js
            └── paginaTemporizador.js    Ruedas para elegir la duración / cuenta atrás con anillo
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
{estado, alerta, pista, dispositivos, reloj, notificaciones, temporizador, privacidad, modos, calendario, grabacion, actividades}
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

Las **actividades** son cosas que duran: el **audio de un chat** (una nota de voz sonando), el **temporizador** (en marcha o en pausa) y la **música** (sonando). Las notificaciones no son actividades, son alertas temporales.

El controlador las calcula en `_calcularActividades()` y las entrega en `vista.actividades`:

1. **Principal** (cápsula): la actividad preferida por el usuario si está disponible; si no, la primera según `ORDEN_ACTIVIDADES` (audio, temporizador, música).
2. **Secundaria** (círculo): la otra actividad. Si no hay, los auriculares conectados (batería).
3. **Mandan sobre eso:** una llamada en curso (`LLAMADA`) o una grabación (`GRABACION`) ocupan la cápsula; una llamada que suena con su aviso oculto (`LLAMADA_ENTRANTE`) ocupa el círculo.

La **hora** también es una vista de la cápsula (`VISTAS_COMPACTAS`: hora → música → temporizador) y siempre está disponible.

La preferencia cambia cuando el usuario:

* arrastra la cápsula y la suelta pasada la mitad (`establecerActividadPreferida` con la vista de al lado, que da `vistaVecina(±1)`; ver 4.3.2);
* desliza con dos dedos sobre la cápsula (`cambiarVistaCompacta(±1)`; en los extremos devuelve `false` y la cápsula rebota);
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

### 4.3.1 Cambio de actividad en la cápsula (contraer → círculo → florecer)

Cuando cambia lo que muestra la cápsula (deslizar, tocar el círculo, empieza la música, el temporizador o una grabación), `Pildora` no cambia el contenido de golpe:

1. **Contraer** (`_contraer`): el contenido visible se encoge (`ESCALA_SALIDA_CONTENIDO`) y desaparece rápido (`DURACION_SALIDA_CONTENIDO_MS`), y el ancho se cierra hasta el alto: **un círculo** (`DURACION_CONTRAER_CAPSULA_MS`, `EASE_IN_CUBIC`).
2. **Florecer** (`_florecer`): se dibuja el modo nuevo y el ancho se abre con el resorte `FLORECER` (se pasa y rebota). El contenido nuevo espera a que la forma tenga sitio (`FRACCION_RETRASO_FLORECER` del resorte) y entra creciendo desde `ESCALA_ENTRADA_CONTENIDO`; al deslizar, entra además desde ese lado (`animarCambio` guarda la dirección).

* Lo que llega mientras se contrae se guarda en `_pendiente` y se dibuja **lo último** al terminar.
* Las actualizaciones sin cambio de modo (reloj, contadores, título) se dibujan al instante.
* **Seguro:** si la contracción no avisa que terminó (pantalla que no dibuja), un temporizador de una sola vez la completa y deja un `AVISO`.
* El círculo de la derecha (`Burbuja`) hace lo mismo a su escala: se encoge hasta `ESCALA_CAMBIO_BURBUJA`, cambia y vuelve a crecer con el resorte `FLORECER`.

### 4.3.2 Asomarse a la vista de al lado (arrastrar la cápsula)

Con el ajuste `arrastre-capsula` en `asomar` (por defecto), arrastrar la cápsula con el ratón presionado no cambia la vista al instante: deja ver la de al lado y **sigue al puntero**. El cambio solo se confirma al soltar.

Con `cambiar` (el arrastre de la versión 1.0) no hay asomo:
* la cápsula se estira un poco con el puntero (`Pildora.seguirArrastre`);
* al soltar, `direccionCambioDirecto` decide: pasado `UMBRAL_ARRASTRE_VISTA_PX`, o con un gesto rápido, cambia con `cambiarVistaCompacta(±1)` y la morfosis de 4.3.1. De derecha a izquierda avanza y en los extremos rebota.

El ajuste se lee al empezar cada arrastre (`ARRASTRE_CAPSULA` en `ajustes.js`).

```text
progreso 0      [ 10:42 p. m. ]  (♪)
progreso 0,4    [ 10:42 ]  [ ♪ Blank Sp ]
progreso 1      (10:42)  [ ♪ Blank Space ∿ ]
soltar          [ ♪ Blank Space ∿ ]
```

* **Quién hace qué:**
  - `GestorInteraccion` pasa el desplazamiento de `PanGesture` (`seguirArrastreCapsula`) y, al soltar, el desplazamiento y la velocidad (`soltarArrastreCapsula`).
  - `IslaUI` elige la vista de al lado la primera vez que se supera `UMBRAL_INICIO_ASOMO_PX` y convierte el desplazamiento en progreso (`logicaAsomo.js`).
  - `BotonPanel` cambia la fila real por el `Asomo` y vuelve a la fila al terminar.
* **Sentido:** de izquierda a derecha se asoma a la siguiente vista de `VISTAS_COMPACTAS` y de derecha a izquierda a la anterior. La lista es **circular** (`controlador.vistaVecina`): con dos vistas, los dos sentidos llevan a la otra. Si no hay otra vista (solo la hora) o se está grabando, la cápsula se estira un poco y vuelve.
* **Progreso:**
  - es `desplazamiento / DISTANCIA_ASOMO_PX` en el sentido en que empezó;
  - volver hacia atrás lo baja hasta 0 y no pasa al otro lado, así que una ida y vuelta sin soltar deja todo igual;
  - pasado 1 crece poco, como una goma (`EXCESO_MAXIMO_ASOMO`).
* **Dibujo** (`componentes/asomo.js`):
  - Dos ventanas con forma de cápsula, cada una con una `Pildora` de vista previa (`previa: true`: sin fondo, sin animaciones propias) a su ancho natural y recortada (`clip_to_allocation`). Al crecer, el contenido se va descubriendo, sin "…".
  - La ventana actual va del ancho real de la cápsula a un círculo. Su contenido se apaga hasta `OPACIDAD_ACTUAL_ASOMO`. Sin música, se centra y se reduce a `ESCALA_ACTUAL_ASOMO` para caber en el círculo; con música, queda la portada.
  - La de al lado va del círculo de la derecha (o de nada, si no había) a su ancho natural.
  - Los anchos se calculan en `vfunc_allocate` a partir de `progreso` y `salida`, como `BarraNivel`.
* **Al soltar** (`debeConfirmarAsomo`):
  - Desde `UMBRAL_CONFIRMAR_ASOMO`, o con un gesto rápido hacia delante (`VELOCIDAD_LANZAR`) desde `PROGRESO_MINIMO_LANZAR_ASOMO`, se confirma. Primero el Asomo pasa a "confirmando" (deja de copiar datos) y después el controlador cambia la vista. El progreso va a 1 con el resorte `FLORECER` y el círculo de la vista anterior desaparece (`DURACION_SALIDA_ASOMO_MS`).
  - Al terminar, vuelve la fila real. La cápsula continúa desde el ancho y la posición de la vista que se asomaba (`Pildora.continuarDesde`) y el círculo, si hay, vuelve a salir (`Burbuja.reaparecer`).
  - Si no se confirma, el progreso vuelve a 0 con el resorte `CAPSULA`.
* **Interrupciones:** si llega una alerta, se abre la isla o la vista de al lado deja de existir, `IslaUI._comprobarAsomo` lo corta al instante y el resto del arrastre se ignora.
* **El puntero sale de la cápsula:** el arrastre sigue (la cápsula agarra el puntero con `global.stage.grab` mientras dura). La isla se quita del gestor de menús del panel (`Main.panel.menuManager.removeMenu`): GNOME le registra un menú vacío y, con él, ese gestor abría el menú del reloj al pasar el puntero por encima y cortaba el arrastre.

Deslizar con dos dedos en el touchpad sigue cambiando de vista directamente, con la morfosis de 4.3.1.

### 4.3.3 Estilo: Liquid Glass o negro clásico

El ajuste `estilo-isla` elige el aspecto. `IslaUI._aplicarEstilo` pone o quita la clase `isla-cristal` en las dos raíces (`BotonPanel` y `TarjetaFlotante`) y llama a su `establecerCristal()`, que muestra u oculta el vidrio de verdad. La sección "Liquid Glass" de `stylesheet.css` hace el resto. Cambia al instante.

**El vidrio (`componentes/vidrio.js`)** muestra, desenfocado, lo que hay detrás de la isla:

1. **Copia en vivo de lo de detrás**, alineada con la pantalla (se calcula en `vfunc_allocate`):
   - el fondo de pantalla: `Clutter.Clone` de `Main.layoutManager._backgroundGroup`;
   - en la isla abierta (`conVentanas`), además cada ventana del área de trabajo: un `Clutter.Clone` por `MetaWindowActor`, con un `BindConstraint` que lo mantiene en su sitio. Se rehacen al mostrarse la tarjeta y con `restacked`, `window-created` y el cambio de área de trabajo; al ocultarse, se quitan.
   - GNOME **no deja copiar `global.window_group` entero**: su pintado especial deja la copia vacía. Por eso se copian el fondo y las ventanas por separado.
2. **Desenfoque**: `Shell.BlurEffect` en modo ACTOR sobre una capa interior recortada al tamaño de la isla (así solo se desenfoca ese trozo). El brillo baja un poco (`BRILLO_VIDRIO`; en la isla abierta, `BRILLO_VIDRIO_TARJETA`) para que el texto blanco se lea.
3. **Shader propio (`EfectoCristal`, `Shell.GLSLEffect`)**: recorta las esquinas redondeadas con borde suave y, en los últimos `REFRACCION_VIDRIO_PX` del canto, toma la imagen más hacia dentro, como una lente. `Shell.BlurEffect` solo desenfoca rectángulos y Mutter 18 no tiene recortes redondeados: por eso hace falta el shader.

**Encima del vidrio**, el CSS pone el tinte (un velo blanco más claro arriba), el borde de luz y el brillo especular (`box-shadow: inset`):

| Dónde | Vidrio | Tinte, borde y brillo |
| :--- | :--- | :--- |
| Cápsula y círculo | `RaizPanel` (raíz de `BotonPanel`) pone un `Vidrio` detrás de cada uno, con su caja; copia sus traslaciones, escalas y punto de giro (y la opacidad del círculo) con `bind_property` | El propio fondo de `.isla-pildora` / `.isla-burbuja` |
| Isla abierta y alertas | Primer hijo de `TarjetaFlotante` (con ventanas) | La capa `isla-cristal-brillo`, encima; la tarjeta en sí no pinta |
| Asomo (arrastrar la cápsula) | Hijo de cada `VentanaAsomo` | La capa `isla-asomo-tinte`, encima |

* **Coste:** el vidrio de la cápsula solo copia el fondo, que casi nunca cambia, así que su desenfoque se reutiliza. El de la isla abierta se rehace cuando cambia lo de detrás (por ejemplo, con un vídeo detrás), pero solo mientras está abierta.
* **Botones de color** (contestar, colgar, reproducir, iniciar...): conservan su color y solo ganan el brillo especular. St pinta un degradado *en lugar* del color de fondo, así que un degradado en una regla general taparía los colores de estado.
* Con "Negro clásico" los vidrios se ocultan (no se pintan ni gastan nada) y todo vuelve al negro sólido.

### 4.4 Qué se muestra en cada estado

| Estado | Cápsula (panel) | Tarjeta flotante |
| :--- | :--- | :--- |
| `REPOSO` | La actividad principal, o la hora si no hay (+ círculo con la secundaria) | Oculta |
| `MULTIMEDIA` | La actividad principal + círculo con la otra | Oculta |
| `ALERTA` | Sin cambios (queda debajo) | La vista de la alerta (300–380 px) |
| `EXPANDIDO` | Sin cambios (queda debajo) | `VistaExpandida`: fecha y hora + carrusel (420 px) |

### 4.5 Varias pantallas

* La isla vive en el panel, que GNOME coloca en el **monitor principal**. `TarjetaFlotante._limitarX` usa `Main.layoutManager.primaryMonitor`, no la pantalla 0.
* Al conectar o desconectar un monitor, o al cambiar el principal, GNOME emite `monitors-changed` y mueve el panel. `IslaUI` espera al siguiente momento libre (`global.compositor.get_laters()`, tipo `IDLE`), cuando las posiciones ya están recalculadas, y llama a `TarjetaFlotante.recolocar()`: la isla abierta salta junto a la cápsula sin animación, y si se estaba cerrando el cierre termina en el acto.

### 4.6 Menú del clic derecho

`MenuContextual` usa `PopupMenu.PopupMenu` de GNOME con su propio `PopupMenuManager`, que lo cierra con Esc o con un clic fuera. No se usa `PanelMenu.Button.setMenu()`, porque abriría el menú también con el clic izquierdo. Lo abre un `Clutter.ClickGesture` con `required_button: BUTTON_SECONDARY`, puesto en la cápsula **y** en la tarjeta (con la isla abierta, la tarjeta tapa la cápsula). Si la isla estaba abierta, se cierra al abrir el menú.

| Opción | Acción |
| :--- | :--- |
| No molestar (interruptor) | `acciones.establecerNoMolestar` → `MonitorModos.establecerNoMolestar` |
| Ajustes de la isla | `acciones.abrirAjustes` → `Extension.openPreferences()` |
| Capturar pantalla | `acciones.capturas.abrirCaptura` → `Screenshot.showScreenshotUI()` (como Impr Pant) |
| Grabar pantalla / Detener grabación | `abrirGrabacion` → `showScreenRecordingUI()`; mientras se graba, `detenerGrabacion` |
| Registro de errores | `acciones.abrirRegistro` → abre `registro.log` con la app predeterminada |

### 4.7 Barras de nivel

Las barras de volumen/brillo y de progreso de la canción son `BarraNivel`: el ancho del relleno se calcula **dentro** de `vfunc_allocate` a partir de la propiedad GObject `fraccion`, que se anima con `animarPropiedad()`. Antes se ajustaba el relleno desde `notify::width`, que pedía un nuevo cálculo de tamaños en medio del actual: Mutter avisaba `Can't update stage views ... needs an allocation` en cada fotograma de la morfosis y las animaciones de la tarjeta podían congelarse.

### 4.8 Esqueleto de carga

Mientras `pista.cargando` es `true`, la página de Música y la cápsula sustituyen título y artista por barras (`crearEsqueleto`), dejan la portada en gris (`Caratula.establecerCargando`) y ocultan la onda. Los controles siguen activos. Las barras y la portada **laten** con `latir()` / `detenerLatido()` (`ui/animaciones.js`): una transición del compositor que se repite (`repeatCount: -1`, `autoReverse`) y que cada componente detiene en cuanto deja de verse o termina la carga. La página solo late con la isla abierta; la cápsula, mientras se ve.

### 4.9 Ruedas del temporizador

`RuedaSelector` es una columna circular de números (24 horas, 60 minutos...). Su estado es la propiedad GObject `posicion` (en filas, continua), animada con `animarPropiedad()`. Solo existen 7 filas: al girar cambian su texto y sus **transformaciones** (`translation_y = R·sen θ`, `scale_y = cos θ`, opacidad según la distancia), que no piden recalcular tamaños. El efecto es un cilindro visto de frente.

| Entrada | Efecto |
| :--- | :--- |
| Arrastrar (`Clutter.PanGesture`, eje Y) | La rueda sigue al puntero; al soltar sigue un poco según la velocidad (`INERCIA_RUEDA_MS`) y se asienta en un número |
| Dos dedos (desplazamiento suave) | 1:1 con los dedos (`FILAS_POR_UNIDAD_SCROLL`); al levantarlos (`ScrollFinishFlags.VERTICAL`) o tras `ESPERA_ASENTAR_RUEDA_MS`, se asienta |
| Rueda del ratón | Una fila por paso |
| Clic en un número cercano | La rueda gira hasta él |

* El desplazamiento **vertical** sobre una rueda devuelve `EVENT_STOP` (no llega a la isla, que se cerraría); el horizontal se propaga y sigue cambiando de página.
* La rueda lleva la clase CSS `isla-captura-vertical`. `GestorInteraccion` conecta `may-recognize` al arrastre vertical de la tarjeta y lo veta si empieza sobre un actor con esa clase. Cualquier componente que necesite el arrastre vertical para sí debe usarla.
* `SelectorDuracion` junta tres ruedas con sus unidades y la banda del valor elegido; `PaginaTemporizador` le añade el botón Iniciar (desactivado con 00:00:00) y los atajos.
* La última duración iniciada se guarda en el ajuste de estado `ultima-duracion-temporizador-s` (lo escribe `extension.js` con `guardarAjuste()`); las ruedas empiezan ahí.

### 4.10 Reloj de Ubuntu

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
* **Cambio de canción:** Brave vacía `Metadata` un momento mientras carga la siguiente. Si el reproductor activo sigue abierto, el servicio entrega la última pista con `cargando: true` (y `reproduciendo: true`, sin portada ni duración) en lugar de `null`, durante como máximo `TIEMPO_ESPERA_PISTA_MS` (temporizador de una sola vez). Así la isla no pierde la página de Música ni la cápsula salta a la hora. Si el reproductor se cierra, la música se quita al instante; si la canción no llega a tiempo, también.
* **Carátula:** solo `file://`. Las URL `http` se ignoran para no descargar nada dentro del Shell.
* **Música o audio de un chat** (`reconocedorAudio.js`, `pista.tipo` = `TIPOS_PISTA`):
  - Cuando una web no da datos de lo que suena, el navegador pone la web como título, deja el artista vacío y usa su propio logo como imagen. Así llega un audio de WhatsApp Web: `xesam:title = "web.whatsapp.com"`, sin artista, `CanGoNext/CanGoPrevious = false`, `CanSeek = true`.
  - Si el título es solo una web y es la de un chat conocido (`reconocedorApps`, `esChat`), la pista es `AUDIO` con `appAudio = {id, nombre, entradasEscritorio}` y sin carátula (el logo del navegador no dice nada).
  - La cápsula pasa al modo `audio`: logo de la app, "Audio · 0:30" en verde y onda blanca.
  - La página de música cambia de diseño: logo grande de la app, "Audio de WhatsApp", la barra de tiempo (se puede tocar para saltar) y solo reproducir/pausa, en verde. Anterior y siguiente se ocultan.
  - Tocar el logo lleva al chat: la ventana se busca por el nombre de la app ("WhatsApp"), no por el título.
  - Es **otra actividad**, aparte de la música:
    - el servicio avisa por separado (`alCambiarPista` para la música, `alCambiarAudio` para el audio; reproductores `activo` y `activoAudio`);
    - en el controlador es `ACTIVIDADES.AUDIO` (`actualizarAudio`, `vista.audio`), primera en `ORDEN_ACTIVIDADES` mientras suena y con su lugar al deslizar (`VISTAS_COMPACTAS`: hora → música → audio → temporizador);
    - en la isla abierta tiene su propia página, `PAGINAS.AUDIO`: otra instancia de `PaginaMusica` con las acciones `audio` (que van a `activoAudio`).
  - En Brave la música y el audio salen por el **mismo** reproductor (Brave publica solo lo que suena ahora). Cuando pasa de una canción a un audio, la música no entra en la espera de "cargando": se quita y vuelve cuando termina el audio.
* **Posición:** MPRIS no notifica el avance. Se consulta `Position` **solo** con la isla abierta en la página de música y sonando.
* **Ir a donde suena** (tocar la portada o el título): si el reproductor acepta `Raise` (`CanRaise`), se le pide. Brave responde `CanRaise = false`: entonces `extension.js` obtiene el proceso dueño del nombre en el bus (`org.freedesktop.DBus.GetConnectionUnixProcessID`) y `ventanas.js` activa una de sus ventanas, prefiriendo la que tiene la canción en el título (en YouTube, el de la pestaña); si no, la última usada.
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
3. También las **críticas** (batería agotándose, o una llamada si la web la marca así): la alerta dura `TIEMPO_ALERTA_CRITICA_MS` como mínimo. Si la isla falla al entregarla, la notificación vuelve a la cola y usa el banner nativo.
4. Al hacer clic en la alerta se llama a `notification.activate()`, que abre la app emisora.
5. `disable()` elimina la propiedad propia y vuelve a quedar el método del prototipo.

#### "No molestar"

Con "No molestar" (`org.gnome.desktop.notifications show-banners = false`), GNOME descarta el aviso **antes** de `_showNotification`. Por eso el capturador también escucha `source-added` → `notification-added` de cada fuente. Por defecto, "No molestar" también silencia la isla. Solo si el usuario activa el ajuste `notificar-en-no-molestar` (desactivado por defecto), la notificación llega a la isla:

* **en silencio:** sin sonido y con `silenciosa: true` (la alerta muestra una luna);
* **sin marcarla como vista:** sigue contando como no leída en GNOME;
* **excepto** las de urgencia baja, las críticas (GNOME las deja pasar con "No molestar" y llegan por `_showNotification`, así no se duplican) y con una ventana en pantalla completa.

Con "No molestar" desactivado, esa vía se ignora y todo pasa por `_showNotification`, sin duplicados.

#### Datos que entrega el capturador

| Campo | Origen |
| :--- | :--- |
| `aplicacion` `{id, nombre, esChat}` | `reconocedorApps.js`. WhatsApp Web llega como "Brave", pero se reconoce por el nombre ("WhatsApp Web"), por el id de la app web de Brave (`brave-hnpfjngllnobngcgfapefoaidbinmjnm-Default`) o por la web de origen (`web.whatsapp.com`, primera línea del texto) |
| `imagen` | `notification.gicon`: la foto del contacto. Brave **borra** ese archivo al cerrarse la notificación, así que se guarda una copia en `~/.cache/isla-dinamica/fotos/<huella>.img` (la carpeta se vacía al iniciar). Si el archivo ya no existe, `imagen` es `null` y se muestra el icono de la app |
| `iconoApp` | Icono de la app instalada (por ejemplo la app web "WhatsApp Web"); si no, el de la fuente |
| `claveConversacion` | `app + remitente`: agrupa los mensajes del mismo chat |
| `silenciosa` | Llegó con "No molestar" |
| `critica` | Urgencia crítica: la alerta dura más |
| `llamada` `{esVideo, contestar, rechazar}` | Solo si es una llamada sonando (`reconocerLlamadaEntrante`). `contestar` / `rechazar` pulsan el botón del propio aviso (`notification.actions[i].activate()`); son `null` si el aviso no lo trae. Ver 5.13 |
| `activar()` / `descartar()` | Abre la app o quita la notificación (también del historial de GNOME) |

* **Agrupación** (`extension.js`): en apps de chat, los mensajes del mismo remitente dentro de `VENTANA_AGRUPAR_MS` comparten la clave de alerta. El controlador **actualiza** la alerta en lugar de crear otra y la isla hace un rebote pequeño con "N mensajes nuevos". Se guardan los últimos `MENSAJES_EN_ALERTA` textos de cada chat y la alerta los muestra uno por línea, con el más reciente resaltado.
* **Recientes** (controlador): las últimas `MAXIMO_NOTIFICACIONES_RECIENTES` van en `vista.notificaciones`. La página las agrupa por chat (`agruparPorChat`); tocar una fila abre el chat y la ✕ descarta todo el chat.
* **Sin ver** (`IslaUI`): las notificaciones llegadas después de la última vez que se vio la página encienden el punto azul de la cápsula. Al abrir la isla con mensajes sin ver, se abre directamente en *Notificaciones*.
* **Privacidad:** el registro anota solo datos técnicos (`fuente`, `appId`, `reconocida`, `origen`, tipo de `imagen`, número de botones, urgencia, si es llamada), **nunca el texto**. Con el ajuste `notificaciones-privadas`, la isla muestra "Nuevo mensaje" en lugar del texto.

---

### 5.10 Modos (modos.js)

| Modo | Fuente |
| :--- | :--- |
| No molestar | GSettings `org.gnome.desktop.notifications` → `show-banners` (`false` = activado) |
| Modo avión | `org.gnome.SettingsDaemon.Rfkill` (bus de sesión) → `AirplaneMode` o `HardwareAirplaneMode` |

Solo avisa en el **cambio** (el estado al arrancar no genera alerta). `extension.js` actualiza `vista.modos` (lo refleja el menú) y, con el ajuste `avisar-modos`, lanza la alerta `MODO` (sin cola). Si el servicio de radio no existe, el modo avión no se vigila y queda un aviso en el registro.

### 5.11 Calendario (calendario.js)

Los eventos son los del menú del reloj de GNOME (Evolution, Google y demás cuentas en línea).

* **Fuente compartida:** se reutiliza `Main.panel.statusArea.dateMenu._eventSource` (una `Calendar.DBusEventSource`, **API interna**) en lugar de crear otra. El servidor `org.gnome.Shell.CalendarServer` tiene **un único rango de fechas** para todos sus clientes: pedir uno distinto descuadraría el calendario del panel.
* **Rango:** `rangoCuadricula()` calcula la cuadrícula de 6 semanas del mes actual con la misma regla que `ui/calendar.js`, respetando `org.gnome.desktop.calendar week-start-day`. Es exactamente el rango que pide GNOME al abrir su calendario, así que normalmente no provoca ninguna recarga.
* **Cuándo se pide:** al iniciar, a medianoche (temporizador de una sola vez) y cada vez que se mira la página (por si el calendario del panel quedó en otro mes).
* **Datos:** `{hayCalendarios, inicioSemana, eventos}`; cada evento `{id, titulo, inicioMs, finMs, todoElDia, hora}`. La hora ya va formateada en 12 o 24 h según `clock-format`.
* **Privacidad:** nunca se registran los títulos, solo si hay calendarios.

La página (`PaginaCalendario`) es la página de la **hora**: `PAGINA_DE_ACTIVIDAD[HORA] = CALENDARIO` y al revés, así que abrir la isla con la hora en la cápsula muestra el calendario, y mirar el calendario y cerrar deja la hora en la cápsula. Muestra el mes (hoy en rojo, punto en los días con eventos) y hasta 3 eventos que aún no terminaron, de hoy a una semana. Tocarla abre la app Calendario (`org.gnome.Calendar`) o, si no está instalada, el calendario del panel.

### 5.12 Grabación y capturas de pantalla (grabacion.js + capturador)

**Grabación en vivo.** `MonitorGrabacion` sigue `Main.screenshotUI · screencast-in-progress` y entrega `{grabando, transcurridoMs}` al empezar, cada segundo (temporizador de una sola vez reprogramado, **solo mientras se graba**) y al terminar. Guarda `ultimaDuracionMs` para el aviso final. Detiene con `Main.screenshotUI.stopScreencast()` y abre las herramientas con `showScreenshotUI()` / `showScreenRecordingUI()` de `ui/screenshot.js`.

* En el controlador, mientras se graba, `principal = GRABACION` (lo que iba en la cápsula pasa al círculo) y `cambiarVistaCompacta` devuelve `false`.
* La cápsula muestra un punto rojo que late y el contador; `PaginaGrabacion` (primera página, solo mientras se graba) muestra el tiempo y el botón ⏹.
* El punto rojo de privacidad "pantalla" se oculta mientras la cápsula muestra la grabación (dirían lo mismo). Sigue avisando de otras apps que graban o comparten.
* **Indicador de GNOME:** con el ajuste `ocultar-indicador-grabacion`, `IslaUI` oculta el **contenedor** de `Main.panel.statusArea.screenRecording` (API interna). El indicador se vuelve a mostrar solo en cada grabación, pero su contenedor no; se restaura al terminar y en `disable()`.

**Avisos.** GNOME publica sus avisos de captura en una fuente con icono `screenshooter-symbolic`. El capturador marca esas notificaciones (`deCapturas`, `miniatura`) y `extension.js` las convierte en alertas propias, fuera de las recientes:

| Aviso de GNOME | Alerta de la isla |
| :--- | :--- |
| Con imagen (`gicon` = `St.ImageContent`): captura hecha | `CAPTURA`: miniatura + "Copiada al portapapeles" |
| Sin imagen: grabación guardada, fallida o sin espacio | `GRABACION`: el título de GNOME + la duración |

Tocar cualquiera de las dos llama a `notification.activate()`, que abre la imagen o el vídeo, igual que el aviso nativo. Al basarse en las notificaciones, funciona igual con Impr Pant, con el menú o con otras herramientas que usen el servicio de captura de GNOME.

> **Fallo de GNOME 50:** el getter `MessageList.Source.iconName` consulta `this.gicon`, que no existe en las fuentes (la propiedad es `icon`) y siempre devuelve `null`. Por eso `esFuenteDeCapturas()` mira `fuente.icon` (un `Gio.ThemedIcon`) directamente.

### 5.13 Llamadas y videollamadas (llamadas/)

Hay dos momentos, y cada uno se detecta de una forma.

**La llamada suena.** WhatsApp Web, Meet, Telegram, Teams... avisan con una notificación del navegador o de la app. `reconocerLlamadaEntrante` la marca como llamada si:
* el texto habla de una llamada (`llamada`, `videollamada`, `is calling`, `chamada`...), y no de una llamada perdida o terminada; o
* trae a la vez un botón de contestar y uno de rechazar.

`extension.js` la convierte en la alerta `LLAMADA` (prioridad 6, por delante de todo; fuera de las recientes):
* dura mientras exista el aviso: al contestar, rechazar o colgar quien llama, la app lo quita y `alCerrar` descarta `llamada-<id>`; `TIEMPO_ALERTA_LLAMADA_MS` es solo el máximo;
* **verde:** pulsa el botón de contestar del aviso si existe; si no, abre la app (`activar`), que es donde se contesta;
* **rojo:** pulsa el botón de rechazar si existe; si no, solo quita la alerta;
* tocar el resto de la alerta abre la app.

**Si se oculta mientras suena** (deslizar hacia arriba, el botón rojo sin botón de rechazar en el aviso, o se acaba `TIEMPO_ALERTA_LLAMADA_MS`), la llamada queda en el **círculo**:
* el controlador la recuerda con `registrarLlamadaEntrante({clave, datos})`;
* mientras su alerta no sea la visible, `_calcularActividades` pone `secundaria = LLAMADA_ENTRANTE`, por delante de lo que hubiera en el círculo;
* la `Burbuja` la dibuja verde, con el teléfono latiendo (solo mientras se ve);
* tocarla (o dejar el puntero encima, con `abrir-con-puntero`) llama a `mostrarLlamadaEntrante()`, que vuelve a mostrar la alerta con los botones;
* desaparece con `quitarLlamadaEntrante` (la app quitó el aviso) o, como máximo, a los `TIEMPO_MAXIMO_LLAMADA_SONANDO_MS` (temporizador de una sola vez).

Los botones de la alerta llevan la clase `isla-captura-clic`: `GestorInteraccion` veta con ella el clic de la tarjeta (`may-recognize`), así pulsar un botón no cuenta además como toque en la alerta.

Si se puede contestar desde la isla depende de la app: solo si su aviso trae los botones. Chrome, Brave y el resto de navegadores Chromium pasan a GNOME los botones que pone la web en su notificación.

**La llamada está en curso.** `MonitorLlamada` usa el mezclador de audio de GNOME (`Volume.getMixerControl()`, el mismo del indicador de micrófono): cada app que graba audio es un flujo (`get_source_outputs()`). `detectarLlamada` decide con esos flujos y los títulos de las ventanas:
* **app de llamadas** usando el micrófono (Zoom, Teams, Discord, Slack, Skype, Telegram, Signal, WhatsApp de escritorio, Webex) → llamada;
* **navegador** (Chrome, Chromium, Brave, Firefox, Edge, Opera, Vivaldi...) usando el micrófono → llamada si alguna ventana es una web de llamadas por su título: Meet (`Meet - abc-defg-hij`), Zoom, Teams, Jitsi, Webex, Discord. WhatsApp, Telegram y Messenger también se usan para chatear: solo cuentan si el título habla de una llamada o si sonó una llamada suya hace menos de `VENTANA_LLAMADA_ENTRANTE_MS`. Así una nota de voz no se toma por una llamada;
* cualquier otro programa que grabe (grabadora, dictado) → no.

Se vuelve a mirar con `stream-added` / `stream-removed` / `state-changed` del mezclador, `window-created` y el cambio de ventana activa, y al sonar una llamada. No hay sondeo. Mientras dura, un temporizador de una sola vez por segundo hace avanzar el contador, como en la grabación.

* **Controlador:** `actualizarLlamada({enLlamada, id, nombre, transcurridoMs, silenciado})`. En llamada, `principal = LLAMADA` (incluso por delante de la grabación; lo que iba en la cápsula pasa al círculo) y no se puede deslizar ni asomarse.
* **Cápsula:** teléfono verde y el contador; con el micrófono silenciado, un micrófono tachado. El punto naranja del micrófono se oculta (diría lo mismo).
* **Página `LLAMADA`** (la primera; al tocar la cápsula se abre aunque haya notificaciones sin ver):
  - nombre de la llamada (Google Meet, WhatsApp...) y contador;
  - **silenciar el micrófono:** `change_is_muted` del micrófono por defecto, como el interruptor de los Ajustes rápidos;
  - **ir a la llamada:** activa la ventana que se reconoció.
  
  Colgar se hace en la app: la isla no puede colgar una llamada de una web.

El ajuste `avisar-llamadas` apaga las dos partes.

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
* **Ventana:** `prefs.js` usa `Adw.SwitchRow` enlazados con `settings.bind()`, `Adw.SpinRow` en **segundos** para las claves que se guardan en milisegundos y `Adw.ComboRow` para las claves de texto con valores fijos (`<choices>` en el esquema).

| Clave | Por defecto | Efecto |
| :--- | :--- | :--- |
| `notificaciones-privadas` | `false` | No mostrar el texto de los mensajes |
| `notificar-en-no-molestar` | `false` | Avisar en silencio con "No molestar" (por defecto, "No molestar" también silencia la isla) |
| `duracion-notificaciones-ms` | 4500 | Tiempo en pantalla de cada notificación |
| `abrir-con-puntero` | `false` | Abrir la isla también al dejar el puntero encima |
| `tiempo-cierre-ms` | 3000 | Cierre automático tras sacar el puntero |
| `ocultar-reloj-gnome` | `true` | Ocultar el texto del reloj de Ubuntu |
| `estilo-isla` | `'cristal'` | Aspecto: `cristal` (Liquid Glass) o `clasico` (negro sólido). Ver 4.3.3 |
| `arrastre-capsula` | `'asomar'` | Al arrastrar la cápsula: `asomar` (la vista de al lado sigue al puntero) o `cambiar` (cambia al soltar, como en la 1.0). Ver 4.3.2 |
| `forzar-animaciones` | `true` | Animar aunque el sistema tenga las animaciones apagadas |
| `mostrar-volumen-brillo` | `true` | Volumen y brillo en la isla |
| `avisar-cargador` | `true` | Aviso del cargador |
| `avisar-copiado` | `true` | Aviso de "Copiado" |
| `avisar-modos` | `true` | Aviso de "No molestar" y modo avión |
| `avisar-capturas` | `true` | Grabación en vivo en la cápsula y avisos de captura y grabación |
| `avisar-llamadas` | `true` | Llamada sonando (alerta con botones) y llamada en curso (cápsula verde y página). Ver 5.13 |
| `ocultar-indicador-grabacion` | `true` | Ocultar el indicador rojo de GNOME mientras la isla muestra la grabación |
| `mostrar-privacidad` | `true` | Puntos de privacidad |
| `ultima-duracion-temporizador-s` | 300 | **Estado**, no opción (no sale en la ventana de ajustes): última duración del temporizador |

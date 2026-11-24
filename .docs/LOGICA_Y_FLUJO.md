# Lógica y flujo

Máquina de estados de la isla, prioridades entre eventos simultáneos, gestos y parámetros de tiempo y animación.

---

## 1. Máquina de estados

Implementada en `modulos/controlador.js`:

* `REPOSO`: no suena música y no hay alertas.
* `MULTIMEDIA`: hay un reproductor sonando. Es el estado al que vuelven las alertas mientras hay música.
* `ALERTA`: una alerta temporal en la tarjeta flotante.
* `EXPANDIDO`: la isla abierta con el carrusel de páginas.

```text
                ┌──────────┐   empieza a sonar   ┌──────────────┐
                │  REPOSO  │ ──────────────────▶ │  MULTIMEDIA  │
                │          │ ◀────────────────── │              │
                └────┬─────┘   pausa / se cierra └──────┬───────┘
                     │                                  │
   alerta nueva      │      ┌──────────────┐            │  alerta nueva
                     └────▶ │    ALERTA    │ ◀──────────┘
                            │              │ ── expira ──▶ vuelve a REPOSO o MULTIMEDIA
                            └──────┬───────┘
                                   │ clic en alerta de auriculares
                                   ▼
   clic en la cápsula    ┌──────────────────┐   puntero fuera N s, clic, deslizar,
   desde REPOSO/MULTIM.▶ │    EXPANDIDO     │ ─ otra ventana, vista general ─▶ estado base
                         └──────────────────┘
```

* Una alerta que llega con la isla abierta **espera en cola** (máximo `MAXIMO_ALERTAS_EN_COLA`) y se muestra al cerrar.
* Con una alerta visible, el puntero encima no abre la isla: así se puede hacer clic en la notificación.

---

## 2. Aspecto de cada estado

| Estado | Cápsula del panel | Tarjeta flotante | Animación |
| :--- | :--- | :--- | :--- |
| **Reposo** | La hora; reemplaza al reloj de Ubuntu. Círculo con la batería de los auriculares si hay | Oculta | El círculo sale de la cápsula con rebote |
| **Multimedia** | Portada circular + título + onda verde | Oculta | La cápsula se ensancha con rebote y el título entra deslizándose |
| **Audio de un chat** (nota de voz de WhatsApp) | Logo de WhatsApp + "Audio · 0:30" en verde + onda blanca | Página propia, *Audio* (aparte de *Música*): logo grande, "Audio de WhatsApp", barra de tiempo y un solo botón verde de reproducir/pausa. Al deslizar la cápsula: hora → música → audio → temporizador | La cápsula pasa por el círculo al cambiar de canción a audio |
| **Cargando la canción siguiente** | Portada gris + barra en lugar del título, latiendo | Página *Música*: portada gris y barras en lugar de título y artista, latiendo; controles activos | Al llegar la canción, el título entra deslizándose |
| **Elegir temporizador** | — | Página *Temporizador*: tres ruedas (h, min, s) con la banda del valor elegido, botón Iniciar naranja y atajos 1 / 5 / 15 / 30 min | Las ruedas giran como un cilindro y se asientan |
| **Grabando la pantalla** | Punto rojo que late + contador rojo (prioridad sobre todo lo demás) | Página *Grabación*: "Grabando la pantalla", tiempo grande, botón ⏹ rojo | El punto late; la cápsula aparece con rebote |
| **Llamada sonando** | (debajo) | 380 px: foto o icono de la app, quien llama, "WhatsApp · Llamada" (o "Videollamada"), botón rojo y botón verde | Los botones salen con rebote; el teléfono verde late mientras suena |
| **En llamada** | Teléfono verde + contador verde (prioridad sobre todo, incluso la grabación); micrófono tachado si está silenciado | Página *Llamada*: nombre (Google Meet, WhatsApp...), tiempo grande, botón del micrófono y botón verde "ir a la llamada" | La cápsula aparece con rebote |
| **Notificación crítica** | (debajo) | Como una notificación, pero dura al menos `TIEMPO_ALERTA_CRITICA_MS` | — |
| **Captura hecha** | (debajo) | 380 px: miniatura de la captura + "Copiada al portapapeles · toca para abrirla" | La miniatura salta |
| **Grabación terminada** | (debajo) | 380 px: icono de grabar en rojo + título de GNOME + "0:42 · toca para verla" | El icono salta |
| **Temporizador en marcha** | Cuenta atrás naranja | Página *Temporizador*: anillo que se vacía, +1 min, pausa, ✕ | — |
| **Alerta de auriculares** | (debajo) | 380 px: icono, nombre, "Conectados", anillo de batería. Con AirPods: tres anillos (izquierdo, derecho, estuche) | Morfosis desde la cápsula; el icono salta y los anillos se llenan |
| **Alerta de notificación** | (debajo) | 380 px: foto del contacto + insignia de la app, remitente, "WhatsApp · ahora", "3 mensajes nuevos" si se agrupan, hasta 3 líneas | Morfosis; la foto salta y el texto entra. Con otro mensaje del mismo chat: rebote pequeño |
| **Volumen / brillo** | (debajo) | 300 px: icono, barra y porcentaje (naranja por encima de 100 %) | La barra se desliza en cada pulsación |
| **Cargador** | (debajo) | 380 px: rayo + "Cargando · 64 % · llena en 1 h 20 min" + anillo | Entrada con rebote; el anillo se llena |
| **Copiado** | (debajo) | 300 px: check verde + "Texto · desde Brave" | El check salta |
| **¡Tiempo cumplido!** | (debajo) | 380 px: cronómetro naranja + "Listo" | El cronómetro se sacude |
| **No molestar / modo avión** | (debajo) | 300 px: luna (morado) o avión (naranja) en un círculo + "Activado"; gris con "Desactivado" | El icono salta |
| **Expandido** | (debajo) | 420 px: fecha y hora + carrusel (*Calendario*, *Música*, *Notificaciones*, *Dispositivos*, *Temporizador*) | Morfosis con rebote; la isla adapta su alto a cada página |
| **Página Calendario** | — | El mes (hoy en rojo, punto en los días con eventos) y hasta 3 próximos eventos agrupados por día ("HOY", "MAÑANA", "DOM 22") | — |

### Puntos de estado en la cápsula

Siempre visibles a la derecha de la cápsula, muestre lo que muestre:

| Color | Significado |
| :--- | :--- |
| Naranja | Micrófono en uso |
| Verde | Cámara en uso |
| Rojo | Pantalla grabándose o compartiéndose |
| Azul | Notificaciones sin ver |

---

## 3. Gestos

| Gesto | Resultado |
| :--- | :--- |
| **Clic** en la cápsula | Abre la isla en la página de lo que muestra la cápsula (con la hora: *Calendario*), o en *Notificaciones* si hay mensajes sin ver |
| Clic en la página *Calendario* | Abre la app Calendario |
| **Arrastrar** la cápsula (ratón presionado) | Se asoma la vista de al lado: crece siguiendo al puntero mientras la actual se encoge hasta un círculo. De izquierda a derecha, la siguiente (hora → música → temporizador); de derecha a izquierda, la anterior; la lista da la vuelta. Volver sin soltar deja todo como estaba. Al soltar pasada la mitad (o con un gesto rápido) se queda la vista nueva; si no, vuelve con un resorte. Con una sola vista, la cápsula se estira y vuelve. Con el ajuste **"Cambiar al instante"**: la cápsula se estira un poco y, al soltar pasados `UMBRAL_ARRASTRE_VISTA_PX`, cambia de vista con la transición por el círculo (de derecha a izquierda, la siguiente; en los extremos rebota) |
| **Dos dedos a los lados** sobre la cápsula | Cambia la vista: hora ↔ música ↔ temporizador. La cápsula se cierra hasta un círculo y renace con la vista nueva, que entra desde el lado del deslizamiento. En los extremos rebota |
| **Clic** en el círculo | Intercambia actividades: la del círculo pasa a la cápsula |
| **Clic derecho** en la cápsula o en la isla | Menú: No molestar, Capturar pantalla, Grabar pantalla (o Detener grabación), Ajustes de la isla, Registro de errores. Si la isla estaba abierta, se cierra |
| Clic en la cápsula mientras se graba | Abre la página *Grabación* |
| Botón ⏹ de la página *Grabación* | Detiene la grabación y cierra la isla |
| Clic en el aviso de captura / de grabación | Abre la imagen / el vídeo |
| Botón verde de una llamada que suena | Contesta (si el aviso trae el botón) o abre la app para contestar |
| Botón rojo de una llamada que suena | Rechaza (si el aviso trae el botón) o solo quita la alerta |
| Deslizar hacia arriba una llamada que suena | Se oculta en un círculo verde junto a la cápsula (sigue sonando) |
| Clic en el círculo verde de la llamada | Vuelve el aviso con los botones |
| Clic en la cápsula durante una llamada | Abre la página *Llamada*: contador, silenciar el micrófono, ir a la llamada |
| Puntero encima de la cápsula | Nada por defecto. Con el ajuste `abrir-con-puntero`, abre tras `RETARDO_APERTURA_HOVER_MS` |
| Puntero fuera de la isla abierta | Sigue abierta `tiempo-cierre-ms` y luego se cierra. Volver a entrar cancela el cierre |
| Puntero sobre una alerta | La alerta no expira; al salir le quedan `TIEMPO_EXTRA_ALERTA_TRAS_HOVER_MS` |
| Clic en una notificación | Abre la app emisora (WhatsApp Web abre el chat) |
| Clic en la alerta de auriculares | Abre la isla en *Dispositivos* |
| Deslizar a los lados en cualquier parte de la isla abierta | Cambia de página, con resistencia en los bordes |
| Clic en los puntos del carrusel | Va a esa página |
| Arrastrar la isla hacia arriba (ratón) | La isla sigue al puntero; pasados `UMBRAL_ARRASTRE_CERRAR_PX` (o con un tirón rápido) se cierra. Si no, vuelve con rebote |
| Dos dedos hacia arriba/abajo o rueda del ratón sobre la isla abierta | Se cierra |
| Lo mismo sobre una alerta | Se descarta |
| Clic en la barra de progreso | Salta a ese punto de la canción (la barra se engrosa con el puntero encima) |
| Clic en la portada o el título de la canción | Lleva a la ventana donde suena (Raise, o la ventana del navegador con la canción) |
| Cancelación / Normal / Transparencia | Cambia el modo de ruido de los AirPods |
| Clic en un chat de *Notificaciones* | Abre ese chat |
| ✕ en un chat / **Borrar** | Descarta todo el chat (también del historial de GNOME) / descarta todas |
| Arrastrar / dos dedos / rueda del ratón sobre una rueda del *Temporizador* | Gira la rueda (sin cerrar la isla); al soltar se asienta en un número |
| Clic en un número cercano de una rueda | La rueda gira hasta él |
| Botón Iniciar (▶) | Arranca la cuenta atrás con la duración de las ruedas |
| Atajo (1 / 5 / 15 / 30 min) | Arranca la cuenta atrás al instante |
| Clic o deslizar en "¡Tiempo cumplido!" | Apaga la alarma |
| Mirar *Música* o *Temporizador* y cerrar la isla | Esa actividad queda en la cápsula y la otra pasa al círculo |
| Enfocar otra ventana o abrir la vista general | Cierra la isla |

---

## 4. Prioridades

Varios eventos pueden coincidir (música sonando, llega un mensaje, se conectan los auriculares). El controlador mantiene una cola por prioridad:

```text
PRIORIDAD 6:  Llamada sonando                        (mientras suene)
PRIORIDAD 5:  Volumen / brillo                        (sin cola)
PRIORIDAD 4:  "Copiado" (sin cola) · "No molestar" / modo avión (sin cola) · "¡Tiempo cumplido!"
              Captura hecha · Grabación terminada
PRIORIDAD 3:  Notificación
PRIORIDAD 2:  Auriculares · Cargador
BASE:         Llamada en curso, si no grabación en curso, si no la actividad preferida (o temporizador > música) en la cápsula;
              la otra en el círculo; si no hay ninguna, la hora
```

**Sin cola:** si la alerta no puede mostrarse en ese momento (isla abierta u otra alerta más importante), se descarta. Mostrar "volumen 40 %" segundos después no tiene sentido.

### Reglas

1. **Misma clave:** una alerta con la misma clave que la visible la **reemplaza** sin repetir la entrada (por ejemplo, otro mensaje del mismo chat o la batería que llega tras conectar).
2. **Mayor prioridad:** interrumpe a la visible, que vuelve a la cola (salvo que sea "sin cola") y se muestra después.
3. **Menor o igual prioridad:** espera en la cola.
4. **Expiración:** al terminar su tiempo, la alerta se cierra y la isla vuelve a `REPOSO` o `MULTIMEDIA`, o muestra la siguiente de la cola.
5. **Isla abierta:** las alertas no interrumpen al usuario; esperan en cola y se muestran al cerrar. Las "sin cola" se descartan.

### Excepciones a la regla de no sondear

* MPRIS no notifica el avance de la canción. La barra de progreso consulta `Position` cada `INTERVALO_PROGRESO_MS` **solo** con la isla abierta en *Música* y sonando.
* El temporizador se refresca al siguiente cambio de segundo **solo** mientras corre.
* La onda de audio es una animación del compositor que solo corre mientras se ve.

---

## 5. Tiempos y parámetros

Los valores fijos viven en `modulos/constantes.js`. Si cambias uno, cámbialo allí y actualiza esta tabla. Los valores que el usuario puede cambiar están en la [tabla de ajustes](ARQUITECTURA.md#8-ajustes-del-usuario).

### Alertas

| Constante | Valor | Uso |
| :--- | :--- | :--- |
| `TIEMPO_ALERTA_BLUETOOTH_MS` | 3500 ms | Alerta de auriculares |
| `TIEMPO_ALERTA_INDICADOR_MS` | 1500 ms | Volumen / brillo (se reinicia con cada pulsación) |
| `TIEMPO_ALERTA_ENERGIA_MS` | 3000 ms | Cargador |
| `TIEMPO_ALERTA_PORTAPAPELES_MS` | 1600 ms | "Copiado" |
| `TIEMPO_ALERTA_TEMPORIZADOR_MS` | 20 s | "¡Tiempo cumplido!" si no se descarta antes |
| `TIEMPO_ALERTA_MODO_MS` | 2200 ms | "No molestar" / modo avión |
| `TIEMPO_ALERTA_CAPTURA_MS` / `TIEMPO_ALERTA_GRABACION_MS` | 3500 / 4500 ms | Captura hecha / grabación terminada |
| `TIEMPO_MAXIMO_LLAMADA_SONANDO_MS` | 90 s | Máximo que una llamada oculta se queda en el círculo si la app no quita su aviso |
| `TIEMPO_ALERTA_LLAMADA_MS` | 45 s | Máximo de una llamada sonando (normalmente se va antes: al dejar de sonar, la app quita su aviso) |
| `TIEMPO_ALERTA_CRITICA_MS` | 10 s | Mínimo de una notificación crítica |
| `VENTANA_LLAMADA_ENTRANTE_MS` | 90 s | Si el navegador usa el micrófono hasta este tiempo después de sonar una llamada de WhatsApp, Telegram..., es esa llamada |
| `TIEMPO_EXTRA_ALERTA_TRAS_HOVER_MS` | 1500 ms | Margen tras quitar el puntero de una alerta |
| `MAXIMO_ALERTAS_EN_COLA` | 5 | Alertas en espera |
| `MARGEN_REPETICION_PORTAPAPELES_MS` | 400 ms | Copias casi simultáneas cuentan como una |

### Notificaciones

| Constante | Valor | Uso |
| :--- | :--- | :--- |
| `VENTANA_AGRUPAR_MS` | 2 min | Mensajes del mismo chat dentro de este margen se agrupan |
| `MAXIMO_NOTIFICACIONES_RECIENTES` | 20 | Notificaciones guardadas para la página *Notificaciones* |
| `MENSAJES_EN_ALERTA` | 3 | Mensajes de un chat visibles a la vez en la alerta |

### Gestos

| Constante | Valor | Uso |
| :--- | :--- | :--- |
| `RETARDO_APERTURA_HOVER_MS` | 350 ms | Puntero encima antes de abrir (solo con `abrir-con-puntero`) |
| `UMBRAL_ARRASTRE_VISTA_PX` | 28 px | Con "Cambiar al instante": arrastre de la cápsula para cambiar de vista |
| `UMBRAL_INICIO_ASOMO_PX` | 4 px | Arrastre de la cápsula antes de empezar a asomarse |
| `DISTANCIA_ASOMO_PX` | 120 px | Arrastre para ver la vista de al lado entera |
| `UMBRAL_CONFIRMAR_ASOMO` | 0,5 | Progreso desde el que, al soltar, se queda la vista de al lado |
| `PROGRESO_MINIMO_LANZAR_ASOMO` | 0,12 | Progreso que basta con un gesto rápido |
| `EXCESO_MAXIMO_ASOMO` | 0,12 | Cuánto más crece pasado el final (goma) |
| `VISTAS_COMPACTAS` | hora, música, temporizador | Orden de las vistas de la cápsula |
| `BLOQUEO_DESLIZAR_MS` | 450 ms | Pausa entre deslizamientos (evita saltar varias páginas) |
| `UMBRAL_DESLIZAR_TOUCHPAD` | 1,6 | Distancia de touchpad para cambiar de página |
| `UMBRAL_ARRASTRE_PAGINA` | 22 % | Fracción de página que hay que arrastrar con el ratón |
| `UMBRAL_ARRASTRE_CERRAR_PX` | 45 px | Arrastre hacia arriba para cerrar |
| `UMBRAL_DESLIZAR_CERRAR_TOUCHPAD` | 2,2 (~22 px) | Deslizamiento vertical para cerrar o descartar |
| `VELOCIDAD_LANZAR` | 0,5 px/ms | Un tirón rápido cuenta aunque no llegue al umbral |

### Animación

| Constante | Valor | Uso |
| :--- | :--- | :--- |
| `RESORTES.APERTURA_ANCHO` | respuesta 0,46 s · amort. 0,66 | Ancho de la isla al abrir |
| `RESORTES.APERTURA_ALTO` | respuesta 0,52 s · amort. 0,70 | Alto de la isla al abrir |
| `RESORTES.CIERRE` | respuesta 0,40 s · amort. 0,86 | Isla → cápsula |
| `RESORTES.REBOTE` | respuesta 0,34 s · amort. 0,52 | Toques, aterrizaje, círculo, botones |
| `RESORTES.CAPSULA` | respuesta 0,42 s · amort. 0,72 | Ancho de la cápsula, páginas del carrusel |
| `RETRASO_CONTENIDO_MS` | 110 ms | El contenido llega después de la forma |
| `DURACION_CONTENIDO_ENTRADA_MS` | 300 ms | Entrada del contenido |
| `DURACION_CONTENIDO_SALIDA_MS` | 140 ms | Salida del contenido |
| `ESCALA_PULSACION` | 0,93 | Cuánto se aplasta la isla al tocarla |
| `DURACION_APARICION_MS` | 380 ms | Iconos y textos que entran |
| `DURACION_PAGINA_MS` | 340 ms | Cambio de página |
| `DURACION_ANILLO_MS` | 800 ms | Llenado de los anillos |
| `RESORTES.FLORECER` | respuesta 0,46 s · amort. 0,60 | La cápsula renace desde el círculo al cambiar de actividad |
| `DURACION_CONTRAER_CAPSULA_MS` / `DURACION_SALIDA_CONTENIDO_MS` | 170 / 110 ms | Cierre hasta el círculo / salida del contenido |
| `ESCALA_SALIDA_CONTENIDO` / `ESCALA_ENTRADA_CONTENIDO` | 0,55 / 0,7 | Escala del contenido que se va / del que llega |
| `FRACCION_RETRASO_FLORECER` / `DURACION_ENTRADA_CONTENIDO_MS` | 0,32 / 220 ms | Cuándo y cuánto tarda en aparecer el contenido nuevo |
| `DESPLAZAMIENTO_ENTRADA_PX` | 14 px | Entrada lateral al deslizar |
| `ESCALA_CAMBIO_BURBUJA` / `DURACION_CAMBIO_BURBUJA_MS` | 0,25 / 140 ms | El círculo se encoge, cambia y vuelve a crecer |
| `OPACIDAD_ACTUAL_ASOMO` / `ESCALA_ACTUAL_ASOMO` | 0,35 / 0,5 | La vista actual convertida en círculo al asomarse |
| `DURACION_SALIDA_ASOMO_MS` | 220 ms | Al confirmar el asomo, el círculo de la vista anterior desaparece |
| `USAR_RESORTE_FISICO` | `false` | `true` = curva de resorte propia (pendiente de validar); `false` = curvas de GNOME |
| `USAR_DESENFOQUE` | `false` | Desenfoque en las transiciones de contenido (desactivado: ver REGLAS, sección 3) |
| `DESENFOQUE_CONTENIDO_PX` | 10 px | Desenfoque máximo si se activa |

### Otros

| Constante | Valor | Uso |
| :--- | :--- | :--- |
| `PRESETS_TEMPORIZADOR_MIN` | 1, 5, 15, 30 | Atajos del temporizador |
| `ALTO_FILA_RUEDA_PX` / `ALTO_RUEDA_PX` / `ANCHO_RUEDA_PX` | 30 / 132 / 48 px | Tamaño de las ruedas |
| `ANGULO_FILA_RUEDA` | 0,36 rad | Curvatura del cilindro |
| `INERCIA_RUEDA_MS` | 220 ms | Cuánto sigue girando la rueda al soltarla, según la velocidad |
| `FILAS_POR_UNIDAD_SCROLL` | 0,33 | Touchpad 1:1 con los dedos |
| `ESPERA_ASENTAR_RUEDA_MS` / `DURACION_ASENTAR_RUEDA_MS` / `DURACION_MAXIMA_GIRO_RUEDA_MS` | 140 / 260 / 650 ms | Asentado de la rueda |
| `INTENTOS_AAP` / `TIEMPO_REINTENTO_AAP_MS` | 3 / 3000 ms | Reintentos al abrir el canal de los AirPods |
| `INTERVALO_PROGRESO_MS` | 1000 ms | Consulta de la posición de la canción |
| `TIEMPO_ESPERA_PISTA_MS` | 6000 ms | Espera máxima a la canción siguiente (esqueleto) antes de dar la música por terminada |
| `DURACION_LATIDO_MS` / `OPACIDAD_LATIDO` | 750 ms / 90 | Latido del esqueleto de carga |

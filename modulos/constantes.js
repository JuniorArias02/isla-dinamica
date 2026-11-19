/**
 * Constantes compartidas por todos los módulos de la Isla Dinámica.
 *
 * Centraliza tiempos, prioridades, estados y dimensiones para que la
 * lógica (controlador) y la presentación (ui) usen exactamente los mismos
 * valores descritos en .docs/LOGICA_Y_FLUJO.md.
 */

/** Prefijo de los mensajes de consola (sin tildes para que el grep del README funcione). */
export const PREFIJO_LOG = '[isla-dinamica]';

/**
 * Estados visuales de la isla.
 * @enum {string}
 */
export const ESTADOS = Object.freeze({
    REPOSO: 'reposo',
    MULTIMEDIA: 'multimedia',
    ALERTA: 'alerta',
    EXPANDIDO: 'expandido',
});

/**
 * Actividades "en vivo" que pueden ocupar la cápsula (principal) o el círculo
 * (secundaria), como las Live Activities del iPhone. Las notificaciones NO son
 * actividades: son alertas temporales.
 * @enum {string}
 */
export const ACTIVIDADES = Object.freeze({
    /** La hora (estado base): siempre disponible en la cápsula. */
    HORA: 'hora',
    TEMPORIZADOR: 'temporizador',
    MUSICA: 'musica',
    /** Solo en el círculo: batería de los auriculares cuando no hay otra actividad. */
    AURICULARES: 'auriculares',
});

/** Orden por defecto si el usuario no eligió ninguna (la primera disponible va en la cápsula). */
export const ORDEN_ACTIVIDADES = Object.freeze([ACTIVIDADES.TEMPORIZADOR, ACTIVIDADES.MUSICA]);

/**
 * Orden al deslizar sobre la cápsula (derecha → izquierda avanza):
 * hora → música → temporizador. Solo cuentan las que estén activas (la hora siempre).
 */
export const VISTAS_COMPACTAS = Object.freeze([ACTIVIDADES.HORA, ACTIVIDADES.MUSICA, ACTIVIDADES.TEMPORIZADOR]);

/**
 * Tipos de alerta temporal que puede recibir el controlador.
 * @enum {string}
 */
export const TIPOS_ALERTA = Object.freeze({
    NOTIFICACION: 'notificacion',
    BLUETOOTH: 'bluetooth',
    /** Volumen / brillo (reemplaza el aviso flotante de GNOME). */
    INDICADOR: 'indicador',
    /** Cargador enchufado / desenchufado. */
    ENERGIA: 'energia',
    /** El temporizador de la isla llegó a cero. */
    TEMPORIZADOR: 'temporizador',
    /** Se copió algo al portapapeles. */
    PORTAPAPELES: 'portapapeles',
});

/**
 * Prioridad de cada tipo de alerta (número mayor = más prioritaria).
 * La multimedia no es una alerta: es el estado base cuando hay reproducción.
 */
export const PRIORIDADES = Object.freeze({
    // Lo que el usuario acaba de hacer (subir volumen, copiar) va primero: es respuesta inmediata.
    [TIPOS_ALERTA.INDICADOR]: 5,
    [TIPOS_ALERTA.TEMPORIZADOR]: 4,
    [TIPOS_ALERTA.PORTAPAPELES]: 4,
    [TIPOS_ALERTA.NOTIFICACION]: 3,
    [TIPOS_ALERTA.BLUETOOTH]: 2,
    [TIPOS_ALERTA.ENERGIA]: 2,
});

// ───────────── Tiempos de alertas ─────────────

/** Tiempo en pantalla de una alerta Bluetooth. */
export const TIEMPO_ALERTA_BLUETOOTH_MS = 3500;

/**
 * Tipos de indicador (volumen, brillo...). Vocabulario común de servicio e interfaz.
 * @enum {string}
 */
export const TIPOS_INDICADOR = Object.freeze({
    VOLUMEN: 'volumen',
    MICROFONO: 'microfono',
    BRILLO: 'brillo',
    TECLADO: 'teclado',
});

/** Tiempo en pantalla del indicador de volumen / brillo (se reinicia con cada pulsación). */
export const TIEMPO_ALERTA_INDICADOR_MS = 1500;

/** Tiempo en pantalla del aviso de cargador. */
export const TIEMPO_ALERTA_ENERGIA_MS = 3000;

/** Tiempo en pantalla de "Copiado". */
export const TIEMPO_ALERTA_PORTAPAPELES_MS = 1600;

/** Tiempo en pantalla de "Tiempo cumplido" (si no se descarta antes). */
export const TIEMPO_ALERTA_TEMPORIZADOR_MS = 20000;

/** Tiempo extra que sigue visible una alerta después de quitarle el puntero de encima. */
export const TIEMPO_EXTRA_ALERTA_TRAS_HOVER_MS = 1500;

/** Máximo de alertas en espera; las más antiguas se descartan (siguen en el historial de GNOME). */
export const MAXIMO_ALERTAS_EN_COLA = 5;

// ───────────── Notificaciones ─────────────

/** Notificaciones recientes que guarda la isla (página "Notificaciones", agrupadas por chat). */
export const MAXIMO_NOTIFICACIONES_RECIENTES = 20;

/** Mensajes de un chat que se muestran en la alerta agrupada. */
export const MENSAJES_EN_ALERTA = 3;

/** Mensajes del mismo chat dentro de esta ventana se agrupan ("3 mensajes nuevos"). */
export const VENTANA_AGRUPAR_MS = 2 * 60 * 1000;

// ───────────── Temporizador ─────────────

/**
 * Estados del temporizador de la isla. Vocabulario común de servicio e interfaz.
 * @enum {string}
 */
export const ESTADOS_TEMPORIZADOR = Object.freeze({
    INACTIVO: 'inactivo',
    CORRIENDO: 'corriendo',
    PAUSADO: 'pausado',
    TERMINADO: 'terminado',
});

/** Duraciones rápidas (minutos) que ofrece la página del temporizador. */
export const PRESETS_TEMPORIZADOR_MIN = Object.freeze([1, 3, 5, 10, 15, 25, 30, 60]);

/** Sonido (del tema de sonidos del sistema) al terminar el temporizador. */
export const SONIDO_TEMPORIZADOR = 'alarm-clock-elapsed';

// ───────────── Portapapeles ─────────────

/**
 * Tipos de contenido copiado (solo el tipo: el contenido nunca se lee).
 * @enum {string}
 */
export const TIPOS_COPIA = Object.freeze({
    TEXTO: 'texto',
    IMAGEN: 'imagen',
    ARCHIVOS: 'archivos',
    OTRO: 'otro',
});

/** Copias seguidas dentro de este margen cuentan como una sola (algunas apps avisan dos veces). */
export const MARGEN_REPETICION_PORTAPAPELES_MS = 400;

// ───────────── AirPods (protocolo AAP) ─────────────

/**
 * Modos de ruido de los AirPods (valores del protocolo AAP). Vive aquí porque
 * lo comparten el servicio (protocolo) y la interfaz (selector de modo).
 * @enum {number}
 */
export const MODOS_RUIDO = Object.freeze({
    APAGADO: 0x01,
    CANCELACION: 0x02,
    TRANSPARENCIA: 0x03,
    ADAPTATIVO: 0x04,
});

/** Espera antes de reintentar abrir el canal AAP (los audífonos tardan en estar listos al conectar). */
export const TIEMPO_REINTENTO_AAP_MS = 3000;

/** Intentos de abrir el canal AAP por cada conexión. */
export const INTENTOS_AAP = 3;

// ───────────── Interacción con el puntero ─────────────

/** Píxeles que hay que arrastrar la cápsula (ratón presionado) para cambiar de vista. */
export const UMBRAL_ARRASTRE_VISTA_PX = 28;

/** Tiempo con el puntero encima de la cápsula antes de abrir la tarjeta (si el ajuste "abrir-con-puntero" está activo). */
export const RETARDO_APERTURA_HOVER_MS = 350;

/** Pausa entre cambios de página o de canción al deslizar con el touchpad. */
export const BLOQUEO_DESLIZAR_MS = 450;

/** Distancia (en unidades de desplazamiento del touchpad) para considerar un deslizamiento. */
export const UMBRAL_DESLIZAR_TOUCHPAD = 1.6;

/** Fracción del ancho de página que hay que arrastrar con el ratón para cambiar de página. */
export const UMBRAL_ARRASTRE_PAGINA = 0.22;

/** Píxeles que hay que arrastrar la isla hacia arriba para cerrarla (como en el móvil). */
export const UMBRAL_ARRASTRE_CERRAR_PX = 45;

/** Distancia de touchpad (dos dedos, vertical) para cerrar la isla. */
export const UMBRAL_DESLIZAR_CERRAR_TOUCHPAD = 2.2;

/** Velocidad (px/ms) a partir de la cual un arrastre corto cuenta como "lanzar". */
export const VELOCIDAD_LANZAR = 0.5;

// ───────────── Animaciones ─────────────

/**
 * true  → curva de resorte física propia (Clutter.Timeline.set_progress_func).
 * false → curvas integradas de GNOME (EASE_OUT_BACK, etc.), equivalentes y probadas.
 * El resorte físico está desactivado hasta validarlo en un GNOME real: en sesiones
 * reales llegó a dejar la isla detenida a mitad de animación.
 */
export const USAR_RESORTE_FISICO = false;

/**
 * Resortes físicos (como los de iOS): `respuesta` = segundos que tarda en llegar
 * (más bajo = más rápido); `amortiguacion` entre 0 y 1 (más bajo = más rebote).
 */
export const RESORTES = Object.freeze({
    /** Cápsula → isla grande: rebote notorio, como la Dynamic Island. */
    APERTURA_ANCHO: {respuesta: 0.46, amortiguacion: 0.66},
    APERTURA_ALTO: {respuesta: 0.52, amortiguacion: 0.70},
    /** Isla grande → cápsula: más firme, casi sin rebote. */
    CIERRE: {respuesta: 0.40, amortiguacion: 0.86},
    /** Golpecito al tocar o al "aterrizar" la isla en la cápsula. */
    REBOTE: {respuesta: 0.34, amortiguacion: 0.52},
    /** Cambios de tamaño de la cápsula del panel. */
    CAPSULA: {respuesta: 0.42, amortiguacion: 0.72},
});

/**
 * Desenfoque del contenido al entrar/salir. Desactivado: Shell.BlurEffect dibuja el
 * contenido en un rectángulo aparte sin bordes redondeados y, durante la transición,
 * se veía un cuadrado opaco alrededor de la isla. La entrada usa solo transparencia + escala.
 */
export const USAR_DESENFOQUE = false;

/** Desenfoque (px) con el que entra y sale el contenido (si USAR_DESENFOQUE). */
export const DESENFOQUE_CONTENIDO_PX = 10;

/** Retraso del contenido respecto a la forma al abrir (primero crece la forma). */
export const RETRASO_CONTENIDO_MS = 110;

/** Entrada del contenido (desenfoque → nítido, transparente → visible). */
export const DURACION_CONTENIDO_ENTRADA_MS = 300;

/** Salida del contenido al cerrar o cambiar (rápida, va antes que la forma). */
export const DURACION_CONTENIDO_SALIDA_MS = 140;

/** Escala con la que se "aplasta" la isla al tocarla. */
export const ESCALA_PULSACION = 0.93;

/** Aparición de elementos internos (iconos, textos). */
export const DURACION_APARICION_MS = 380;

/** Cambio de página del carrusel. */
export const DURACION_PAGINA_MS = 340;

/** Llenado del anillo de batería. */
export const DURACION_ANILLO_MS = 800;

// ───────────── Dimensiones ─────────────

/** Ancho de la tarjeta cuando muestra una alerta. */
export const ANCHO_ALERTA_PX = 380;

/** Ancho de la isla para alertas compactas (volumen, brillo, copiado). */
export const ANCHO_ALERTA_COMPACTA_PX = 300;

/** Ancho de la tarjeta expandida. */
export const ANCHO_EXPANDIDO_PX = 420;

/** Margen mínimo entre la tarjeta y el borde de la pantalla. */
export const MARGEN_PANTALLA_PX = 8;

/** Intervalo de refresco de la barra de progreso (solo con la tarjeta abierta y sonando). */
export const INTERVALO_PROGRESO_MS = 1000;

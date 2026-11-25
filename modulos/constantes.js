// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

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
    /** Un audio de un chat sonando (nota de voz de WhatsApp): va aparte de la música. */
    AUDIO: 'audio',
    /** Solo en el círculo: una llamada que suena y cuyo aviso se ocultó (al tocarlo vuelve). */
    LLAMADA_ENTRANTE: 'llamada-entrante',
    /** Solo en el círculo: batería de los auriculares cuando no hay otra actividad. */
    AURICULARES: 'auriculares',
    /** Grabación de pantalla en curso: mientras dura, ocupa siempre la cápsula. */
    GRABACION: 'grabacion',
    /** Llamada o videollamada en curso (Meet, WhatsApp, Zoom...): manda sobre todo lo demás. */
    LLAMADA: 'llamada',
});

/**
 * Qué suena en el reproductor (servicio de música → interfaz).
 * @enum {string}
 */
export const TIPOS_PISTA = Object.freeze({
    /** Una canción o un vídeo: portada, título, artista, anterior / siguiente. */
    MUSICA: 'musica',
    /** Un audio de un chat (nota de voz de WhatsApp...): icono de la app y solo reproducir/pausa. */
    AUDIO: 'audio',
});

/** Orden por defecto si el usuario no eligió ninguna (la primera disponible va en la cápsula). */
export const ORDEN_ACTIVIDADES = Object.freeze([ACTIVIDADES.AUDIO, ACTIVIDADES.TEMPORIZADOR, ACTIVIDADES.MUSICA]);

/**
 * Orden al deslizar sobre la cápsula (derecha → izquierda avanza):
 * hora → música → temporizador. Solo cuentan las que estén activas (la hora siempre).
 */
export const VISTAS_COMPACTAS = Object.freeze([
    ACTIVIDADES.HORA, ACTIVIDADES.MUSICA, ACTIVIDADES.AUDIO, ACTIVIDADES.TEMPORIZADOR,
]);

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
    /** Se activó o desactivó "No molestar" o el modo avión. */
    MODO: 'modo',
    /** Captura de pantalla hecha (con miniatura). */
    CAPTURA: 'captura',
    /** Terminó una grabación de pantalla (guardada o con error, según GNOME). */
    GRABACION: 'grabacion',
    /** Está sonando una llamada (WhatsApp, Meet, Telegram...). */
    LLAMADA: 'llamada',
});

/**
 * Modos del sistema que la isla anuncia al cambiar.
 * @enum {string}
 */
export const MODOS = Object.freeze({
    NO_MOLESTAR: 'no-molestar',
    AVION: 'avion',
});

/**
 * Prioridad de cada tipo de alerta (número mayor = más prioritaria).
 * La multimedia no es una alerta: es el estado base cuando hay reproducción.
 */
export const PRIORIDADES = Object.freeze({
    // Una llamada sonando va por delante de todo: hay que contestar ya.
    [TIPOS_ALERTA.LLAMADA]: 6,
    // Lo que el usuario acaba de hacer (subir volumen, copiar) va primero: es respuesta inmediata.
    [TIPOS_ALERTA.INDICADOR]: 5,
    [TIPOS_ALERTA.TEMPORIZADOR]: 4,
    [TIPOS_ALERTA.PORTAPAPELES]: 4,
    [TIPOS_ALERTA.MODO]: 4,
    [TIPOS_ALERTA.CAPTURA]: 4,
    [TIPOS_ALERTA.GRABACION]: 4,
    [TIPOS_ALERTA.NOTIFICACION]: 3,
    [TIPOS_ALERTA.BLUETOOTH]: 2,
    [TIPOS_ALERTA.ENERGIA]: 2,
});

// ───────────── Tiempos de alertas ─────────────

/**
 * Una llamada sonando se ve mientras su aviso exista (la app lo quita al contestar,
 * rechazar o colgar quien llama). Esto es solo el máximo, por si la app no lo quita.
 */
export const TIEMPO_ALERTA_LLAMADA_MS = 45000;

/**
 * Una llamada que suena con su aviso oculto queda en el círculo hasta que la app quita
 * el aviso. Esto es solo el máximo, por si la app no lo quita nunca.
 */
export const TIEMPO_MAXIMO_LLAMADA_SONANDO_MS = 90000;

// ───────────── Color de la portada (estilo Liquid Glass) ─────────────

/** Lado (px) al que se reduce la carátula para sacar su color: basta y es rapidísimo. */
export const LADO_MUESTRA_COLOR_PX = 24;

/**
 * Diferencia media por píxel (0–255) por debajo de la cual una "carátula" es el logo
 * del propio reproductor (imagen de relleno de Brave, Chrome...) y no una portada.
 */
export const DIFERENCIA_MAXIMA_RELLENO = 22;

/** Colores de carátula que se recuerdan (cada uno es solo un color). */
export const MAXIMO_COLORES_EN_CACHE = 24;

/** Fundido del tinte al irse (no hay música). */
export const DURACION_TINTE_MS = 420;

/** Cambio de color entre canciones: el color nuevo entra cruzándose con el anterior. */
export const DURACION_CAMBIO_COLOR_MS = 650;

/** Después del destello, el color nuevo se asienta en su intensidad normal. */
export const DURACION_ASENTAR_COLOR_MS = 900;

/** Destello: el color nuevo llega este número de veces más intenso y luego se asienta. */
export const INTENSIDAD_DESTELLO_TINTE = 1.55;

/** Opacidad del tinte de la canción sobre el vidrio: arriba y abajo (degradado). */
export const OPACIDAD_TINTE_ARRIBA = 0.46;
export const OPACIDAD_TINTE_ABAJO = 0.20;

// ───────────── Luz que sigue al puntero (estilo Liquid Glass, componentes/luzVidrio.js) ─────────────

/** La luz se enciende rápido al llegar el puntero y se apaga despacio al irse. */
export const DURACION_ENCENDER_LUZ_MS = 220;
export const DURACION_APAGAR_LUZ_MS = 520;

/** Ancho (px) de la franja del canto que brilla. */
export const ANCHO_CANTO_LUZ_PX = 3;

/** Intensidad (0–1) del halo suave alrededor del puntero. */
export const INTENSIDAD_HALO_LUZ = 0.10;

/** Hasta dónde llega la luz desde el puntero (px): en la cápsula y en la isla abierta. */
export const ALCANCE_LUZ_CAPSULA_PX = 46;
export const ALCANCE_LUZ_TARJETA_PX = 130;

// ───────────── Liquid Glass (componentes/vidrio.js) ─────────────

/** Radio de las esquinas de la isla abierta (debe coincidir con .isla-tarjeta-flotante en el CSS). */
export const RADIO_TARJETA_PX = 36;

/** Desenfoque de lo que hay detrás del vidrio (px). */
export const RADIO_DESENFOQUE_VIDRIO = 24;

/** Brillo de lo de detrás (1 = igual; menos = más oscuro, para que el texto blanco se lea). */
export const BRILLO_VIDRIO = 0.92;

/** En la isla abierta hay más texto: lo de detrás se oscurece algo más. */
export const BRILLO_VIDRIO_TARJETA = 0.68;

/** Ancho del canto que refracta la luz como una lente (px). */
export const REFRACCION_VIDRIO_PX = 10;

/** Notificaciones críticas (batería agotándose...): más tiempo que las normales. */
export const TIEMPO_ALERTA_CRITICA_MS = 10000;

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

/** Tiempo en pantalla del aviso de "No molestar" / modo avión. */
export const TIEMPO_ALERTA_MODO_MS = 2200;

/** Tiempo en pantalla del aviso de captura (con miniatura) y del de grabación terminada. */
export const TIEMPO_ALERTA_CAPTURA_MS = 3500;
export const TIEMPO_ALERTA_GRABACION_MS = 4500;

/**
 * Icono de la fuente de notificaciones de "Captura de pantalla" de GNOME
 * (ui/screenshot.js). Identifica sus avisos sin depender del idioma.
 */
export const ICONO_FUENTE_CAPTURAS = 'screenshooter-symbolic';

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
export const PRESETS_TEMPORIZADOR_MIN = Object.freeze([1, 5, 15, 30]);

// ───────────── Rueda selectora (temporizador, estilo iPhone) ─────────────

/** Alto de cada fila de la rueda, en el centro (donde no hay curvatura). */
export const ALTO_FILA_RUEDA_PX = 30;

/** Ángulo (radianes) entre filas del cilindro: más ángulo = más curvatura. */
export const ANGULO_FILA_RUEDA = 0.36;

/** Alto visible de la rueda (unas 5 filas) y ancho de cada columna. */
export const ALTO_RUEDA_PX = 132;
export const ANCHO_RUEDA_PX = 48;

/** Inercia al soltar un arrastre: cuánto "sigue" la rueda según la velocidad (ms). */
export const INERCIA_RUEDA_MS = 220;

/**
 * Filas que avanza la rueda por cada unidad de desplazamiento suave del touchpad.
 * Una unidad ≈ 10 px de dedos y una fila mide 30 px: 0,33 = los números siguen a los dedos 1:1.
 */
export const FILAS_POR_UNIDAD_SCROLL = 0.33;

/** Sin más desplazamiento durante este tiempo, la rueda se asienta en el número más cercano. */
export const ESPERA_ASENTAR_RUEDA_MS = 140;

/** Duración del asentado (y mínimo del giro con inercia). */
export const DURACION_ASENTAR_RUEDA_MS = 260;
export const DURACION_MAXIMA_GIRO_RUEDA_MS = 650;

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

// Asomarse a la vista de al lado: arrastrar la cápsula con el ratón presionado.
// La vista de al lado crece siguiendo al puntero y la actual se encoge hasta un
// círculo; el cambio solo se confirma al soltar (ver LOGICA_Y_FLUJO, 3.1).

/** Con el ajuste "Cambiar al instante": píxeles que hay que arrastrar la cápsula para cambiar de vista. */
export const UMBRAL_ARRASTRE_VISTA_PX = 28;

/** Píxeles de arrastre antes de empezar a asomarse (evita moverla con un clic tembloroso). */
export const UMBRAL_INICIO_ASOMO_PX = 4;

/** Píxeles de arrastre para asomarse del todo (progreso 1: la vista de al lado a tamaño completo). */
export const DISTANCIA_ASOMO_PX = 120;

/** Progreso a partir del cual, al soltar, se confirma el cambio de vista. */
export const UMBRAL_CONFIRMAR_ASOMO = 0.5;

/** Con un gesto rápido (lanzar) basta con este progreso para confirmar. */
export const PROGRESO_MINIMO_LANZAR_ASOMO = 0.12;

/** Más allá del final, la vista de al lado solo crece este extra (como una goma). */
export const EXCESO_MAXIMO_ASOMO = 0.12;

/** Opacidad que conserva la vista actual al quedar convertida en círculo. */
export const OPACIDAD_ACTUAL_ASOMO = 0.35;

/** Escala de la hora o la cuenta atrás al quedar dentro del círculo (para que quepa). */
export const ESCALA_ACTUAL_ASOMO = 0.5;

/** Al confirmar: tiempo en que el círculo de la vista anterior desaparece. */
export const DURACION_SALIDA_ASOMO_MS = 220;

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
    /** Cambio de actividad: la cápsula renace desde el círculo, con un rebote marcado. */
    FLORECER: {respuesta: 0.46, amortiguacion: 0.60},
});

// ───────────── Cambio de actividad en la cápsula (contraer → círculo → florecer) ─────────────

/** Fase 1: la cápsula se cierra hasta un círculo. */
export const DURACION_CONTRAER_CAPSULA_MS = 170;

/**
 * El contenido que se va desaparece antes de que la forma se estreche de verdad
 * (si no, el texto se aprieta y se ve "…").
 */
export const DURACION_SALIDA_CONTENIDO_MS = 110;

/** Escala a la que se encoge el contenido que se va y desde la que nace el nuevo. */
export const ESCALA_SALIDA_CONTENIDO = 0.55;
export const ESCALA_ENTRADA_CONTENIDO = 0.7;

/**
 * Fase 2: el contenido nuevo espera a que la forma tenga sitio para él. Con el resorte
 * FLORECER, hacia el 32 % del tiempo la forma ya supera el 90 % de su ancho (luego se
 * pasa y rebota): el contenido entra ahí, casi transparente, y nunca se ve cortado.
 */
export const FRACCION_RETRASO_FLORECER = 0.32;
export const DURACION_ENTRADA_CONTENIDO_MS = 220;

/** Al deslizar, el contenido nuevo entra un poco desde ese lado. */
export const DESPLAZAMIENTO_ENTRADA_PX = 14;

/** El círculo (actividad secundaria): se encoge hasta esta escala, cambia y vuelve a crecer. */
export const ESCALA_CAMBIO_BURBUJA = 0.25;
export const DURACION_CAMBIO_BURBUJA_MS = 140;

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

/**
 * Al pasar de canción, los navegadores vacían los datos de la pista un momento
 * mientras cargan la siguiente. Durante este tiempo la isla muestra un esqueleto
 * en lugar de dar la música por terminada.
 */
export const TIEMPO_ESPERA_PISTA_MS = 6000;

/** Latido del esqueleto de carga: duración de cada media oscilación y opacidad mínima (0–255). */
export const DURACION_LATIDO_MS = 750;
export const OPACIDAD_LATIDO = 90;

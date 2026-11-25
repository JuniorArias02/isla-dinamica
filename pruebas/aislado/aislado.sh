#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# SPDX-FileCopyrightText: 2026 JuniorArias02
#
# Carga la Isla Dinámica en un GNOME Shell SIN PANTALLA y AISLADO (bus de sesión,
# configuración, datos y caché propios). No toca la sesión real.
# Termina con código 0 si todo pasó y 1 si algo falló.
#
# Uso:  ./pruebas/aislado/aislado.sh                 (la carpeta del proyecto)
#       ./pruebas/aislado/aislado.sh paquete.zip     (el paquete tal como se publica)

set -u
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$TEMPORAL"' EXIT

EXTENSIONES="$TEMPORAL/data/gnome-shell/extensions"
mkdir -p "$TEMPORAL/cfg" "$TEMPORAL/cache" "$EXTENSIONES"
PAQUETE="${1:-}"
if [ -n "$PAQUETE" ]; then
    # Se instala el .zip como las vías oficiales (extensions.gnome.org y `gnome-extensions install`):
    # descomprimir y compilar el esquema. (No se usa el comando directamente porque falla
    # al mover carpetas entre /tmp y otro disco.)
    DESTINO="$EXTENSIONES/isla-dinamica@juniorarias02"
    mkdir -p "$DESTINO"
    unzip -q "$PAQUETE" -d "$DESTINO" || { echo "  ✘ no se pudo descomprimir $PAQUETE"; exit 1; }
    glib-compile-schemas --strict "$DESTINO/schemas/" || { echo "  ✘ el esquema del paquete no compila"; exit 1; }
    TITULO="GNOME Shell aislado (paquete $(basename "$PAQUETE"))"
else
    ln -s "$RAIZ" "$EXTENSIONES/isla-dinamica@juniorarias02"
    glib-compile-schemas "$RAIZ/schemas/"
    TITULO="GNOME Shell aislado"
fi
ln -s "$RAIZ/pruebas/aislado/prueba-isla@local" "$EXTENSIONES/prueba-isla@local"

echo
echo "$TITULO"

env -u WAYLAND_DISPLAY -u DISPLAY \
    XDG_CONFIG_HOME="$TEMPORAL/cfg" XDG_DATA_HOME="$TEMPORAL/data" XDG_CACHE_HOME="$TEMPORAL/cache" \
    SALIDA="$TEMPORAL/shell.log" \
    timeout 200 dbus-run-session -- bash -c '
        gsettings set org.gnome.shell disable-user-extensions false
        gsettings set org.gnome.shell enabled-extensions "[\"isla-dinamica@juniorarias02\", \"prueba-isla@local\"]"
        # Como en equipos con las animaciones del sistema apagadas.
        gsettings set org.gnome.desktop.interface enable-animations false
        gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x720 > "$SALIDA" 2>&1 &
        PID=$!
        # La prueba completa tarda algo más de un minuto: se espera hasta tres.
        for _ in $(seq 1 180); do
            sleep 1
            grep -q "\[prueba\] FIN" "$SALIDA" && break
        done
        kill $PID; sleep 2; kill -9 $PID 2>/dev/null
    ' > /dev/null 2>&1

grep -o "\[prueba\] .*" "$TEMPORAL/shell.log" | sed 's/^\[prueba\] /  /' | grep -v "^  FIN$"
FALLOS=0

if ! grep -q "\[prueba\] FIN" "$TEMPORAL/shell.log"; then
    echo "  ✘ la prueba no terminó (¿GNOME Shell no arrancó?)"
    FALLOS=1
fi
if grep -q "\[prueba\] ✘" "$TEMPORAL/shell.log"; then
    FALLOS=1
fi
if grep -E "JS ERROR" "$TEMPORAL/shell.log" | grep -qi "isla"; then
    echo "  ✘ errores de JavaScript:"
    grep -A5 "JS ERROR" "$TEMPORAL/shell.log" | sed 's/^/      /'
    FALLOS=1
fi
# Mutter avisa si un actor de la isla queda sin tamaño válido durante un fotograma
# (sus animaciones pueden congelarse). Nunca debe ocurrir.
if grep "Can't update stage views" "$TEMPORAL/shell.log" | grep -q "Gjs_"; then
    echo "  ✘ actores de la isla sin tamaño válido durante una animación:"
    grep "Can't update stage views" "$TEMPORAL/shell.log" | grep -o "\[Gjs_[A-Za-z_]*\]" | sort | uniq -c | sed 's/^/      /'
    FALLOS=1
else
    echo "  ✔ ningún actor de la isla queda sin tamaño durante las animaciones"
fi
REGISTRO="$TEMPORAL/cache/isla-dinamica/registro.log"
if [ -f "$REGISTRO" ] && grep -q " ERROR " "$REGISTRO"; then
    echo "  ✘ errores en el registro de la isla:"
    grep -A5 " ERROR " "$REGISTRO" | sed 's/^/      /'
    FALLOS=1
fi

exit $FALLOS

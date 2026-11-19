#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# SPDX-FileCopyrightText: 2026 JuniorArias02
#
# Ejecuta todas las comprobaciones del proyecto:
#   1. Revisión del código (ESLint)
#   2. Esquema de ajustes
#   3. Pruebas unitarias (gjs, fuera del Shell)
#   4. Con --aislado: carga real en un GNOME Shell aislado
#
# Uso:  ./pruebas/ejecutar.sh            (rápido, ~10 s)
#       ./pruebas/ejecutar.sh --aislado  (completo, ~30 s)

set -u
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ" || exit 1
FALLOS=0

seccion() { echo; echo "── $1 ──"; }
fallo() { echo "  ✘ $1"; FALLOS=$((FALLOS + 1)); }

seccion "Revisión del código (ESLint)"
if [ -d node_modules ]; then
    if npx --no-install eslint .; then echo "  ✔ sin problemas"; else fallo "ESLint encontró problemas"; fi
else
    echo "  (omitida: ejecuta 'npm install' una vez para activarla)"
    for archivo in extension.js prefs.js $(find modulos pruebas -name '*.js'); do
        node --check --input-type=module < "$archivo" 2>/dev/null || fallo "sintaxis: $archivo"
    done
fi

seccion "Esquema de ajustes"
if glib-compile-schemas --strict schemas/; then echo "  ✔ compila sin errores"; else fallo "el esquema no compila"; fi

seccion "Pruebas unitarias"
CACHE_PRUEBAS="$(mktemp -d)"
for prueba in pruebas/unitarias/*.prueba.js; do
    # Caché temporal: las pruebas no escriben en el registro real de la isla.
    XDG_CACHE_HOME="$CACHE_PRUEBAS" G_MESSAGES_DEBUG='' gjs -m "$prueba" 2>/dev/null || fallo "$(basename "$prueba")"
done
rm -rf "$CACHE_PRUEBAS"

if [ "${1:-}" = "--aislado" ]; then
    "$RAIZ/pruebas/aislado/aislado.sh" || fallo "GNOME Shell aislado"
fi

echo
if [ "$FALLOS" -eq 0 ]; then
    echo "✔ Todo correcto"
else
    echo "✘ $FALLOS comprobación(es) fallida(s)"
fi
exit $(( FALLOS > 0 ))

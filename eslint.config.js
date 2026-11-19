// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 JuniorArias02

/**
 * Revisión automática del código (ESLint). Ejecutar con `npm run revisar`.
 *
 * Además de detectar errores comunes, hace cumplir varias reglas del proyecto
 * (ver .docs/REGLAS_Y_ESTANDARES.md): nada de console.* fuera de registro.js,
 * ningún catch vacío, nada de ease() directo fuera del motor de movimiento.
 */

import js from '@eslint/js';
import globals from 'globals';

/** Globales que GJS y GNOME Shell ponen a disposición del código. */
const GLOBALES_GJS = {
    global: 'readonly',
    imports: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    ARGV: 'readonly',
    console: 'readonly',
    TextEncoder: 'readonly',
    TextDecoder: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
};

export default [
    {
        ignores: ['node_modules/', 'schemas/'],
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: GLOBALES_GJS,
        },
        rules: {
            // Errores probables
            'no-unused-vars': ['error', {args: 'none', caughtErrors: 'none'}],
            'no-empty': ['error', {allowEmptyCatch: false}],
            'eqeqeq': ['error', 'always', {null: 'ignore'}],
            'no-var': 'error',
            'prefer-const': 'error',
            'no-shadow': ['error', {builtinGlobals: false}],

            // Reglas del proyecto
            'no-console': 'error',
            'no-restricted-properties': ['error',
                {property: 'ease', message: 'Usa animar() o animarConResorte() de ui/movimiento.js.'},
                {property: 'ease_property', message: 'Usa animarPropiedad() de ui/movimiento.js.'},
            ],

            // Estilo
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', {avoidEscape: true, allowTemplateLiterals: true}],
            'comma-dangle': ['error', 'always-multiline'],
            'no-trailing-spaces': 'error',
            'eol-last': 'error',
        },
    },
    {
        // El único lugar donde se escribe en la consola y donde se llama a ease().
        files: ['modulos/registro.js', 'modulos/ui/movimiento.js'],
        rules: {
            'no-console': 'off',
            'no-restricted-properties': 'off',
        },
    },
    {
        // Pruebas y configuración: pueden escribir en la consola.
        files: ['pruebas/**/*.js', 'eslint.config.js'],
        languageOptions: {
            globals: {...GLOBALES_GJS, ...globals.node},
        },
        rules: {
            'no-console': 'off',
        },
    },
];

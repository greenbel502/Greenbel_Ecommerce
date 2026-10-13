# Dependencias revisadas durante el bloque de perfil

13/10/2026 · Solo código/runtime local DEV. Sin cambios PROD, commit ni despliegue.

Al declarar `sharp` como dependencia directa para procesar fotos, `npm audit` encontró 12 avisos en el árbol existente: uno crítico, diez altos y uno moderado. Se revisaron los rangos del registro npm y los avisos asociados, incluyendo [Next/Image Optimization](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) y [sharp/librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).

## Ajustes acotados

- Next.js **15.5.22 → 15.5.27**, sin cambio de versión mayor.
- `eslint-config-next` alineado en **15.5.27**.
- `sharp` y su override **0.35.3 → 0.35.5**, declarado directamente para el endpoint de avatar.
- Actualizaciones compatibles de dependencias transitivas seleccionadas para los avisos corregibles (`brace-expansion`, `braces`, `dompurify`, `fast-glob`, `js-yaml`, `micromatch`, `nanoid`, `source-map-js`). El resolver cambió seis paquetes; no se utilizó `audit fix --force` ni una actualización mayor del stack.
- `package.json` y `package-lock.json` conservan los cambios; deben incluirse juntos en el futuro cambio revisado. No se modificó una migración aplicada.

## Estado comprobado

- **PASS LOCAL:** servidor reiniciado en `localhost:3001`, ejecutando Next.js 15.5.27.
- **PASS LOCAL:** `npm audit --omit=dev --json`: **0 avisos** en dependencias de runtime en la consulta de esta fecha. Esto es el resultado del registro npm, no una certificación general del sistema.
- **PENDIENTE:** `npm audit --json` mantiene **5 avisos altos de herramientas de desarrollo**, asociados a `braces` y su cadena `micromatch`/`fast-glob`/plugin/config ESLint. La solución automática sugerida cambia `eslint-config-next` a 14.2.35 (otra versión mayor de esa configuración); no se aplicó ese cambio. Revisar una solución compatible antes de promoción, sin degradar el stack por inferencia. No hay avisos críticos restantes en esa consulta.
- La máquina utiliza Node 23.10.0; npm advierte que `eslint-visitor-keys` solicita Node 20.19+, 22.13+ o 24+. TypeScript/ESLint se ejecutan, pero conviene usar una versión LTS admitida al preparar el entorno compartido. No se modificó la instalación de Node del usuario.

Las verificaciones posteriores de perfil/avatar, código y callback están registradas en [el avance](../GREENBEL_AVANCE.md). El reinicio del proceso local no borra usuarios, sesiones de Supabase ni datos DEV.

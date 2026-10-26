# 024 — Logotipos privados de marcas

Aprobación explícita del usuario, 24/10/2026: «Sí, apruebo la migración 024 en DEV». Modelo concreto en [plan de marcas](../brands/2026-10-24-plan.md).

Archivo: `supabase/migrations/20261024002400_brand_logos.sql`.

Cambio único: crea `brand-logos` privado, límite 2.000.000 bytes y MIME `image/webp`. Reutiliza `brands.logo_path`; sin tablas/columnas nuevas, cambios de RLS, políticas, grants, relaciones o transacciones comerciales. La aplicación procesa archivos hasta 5.000.000 bytes y solo el servidor autorizado escribe/lee el bucket. Lectura pública condicionada a marca activa; vista previa protegida de administración.

La migración incluye transacción y comprobaciones de tablas/campo/RLS, ausencia de bucket/archivos/logos previos y políticas de Storage no previstas. En caso de discrepancia se detiene y exige auditoría, sin modificar políticas. No usar `ON CONFLICT` para ocultar diferencias ni quitar los controles para promoverla.

## DEV: APLICADA Y VERIFICADA · 24/10/2026

- Selector APP_ENV, URL y referencia enlazada real coincidentes antes de CLI, sin imprimir valores.
- CLI 2.121.0: historial 001–023 coincidente; dry-run exclusivo de 024; aplicación mediante `scripts/dev-apply-one-migration.mjs`.
- Lectura posterior: historial 001–024 idéntico a los archivos; bucket privado WebP/2 MB; marcas y políticas anteriores conservadas; RLS habilitado.
- QA de carga/entrega privada/concurrencia/retirada, permisos y límites: PASS. Datos temporales retirados; registros preexistentes preservados. [Evidencia](../brands/2026-10-24-result.md).

SHA256 del SQL aplicado: `acc7e624ef6cd8b924cc4b8ea1f5c900437cb5d8d0c2f81e32f9bae5e4071afb`.

## Promoción futura

**PROD: NO EJECUTADO / NO AUTORIZADO.** Conservar este archivo inmutable junto a 001–023 para una promoción revisada y autorizada. Antes, comprobar destino/historial, datos y políticas reales de PROD; el preflight puede detenerse si difieren de los supuestos auditados. Nunca ejecutar el wrapper DEV o las suites de fixtures contra PROD. Un merge no aplica SQL ni migra archivos: cualquier traslado de imágenes/metadatos requiere su propio plan y autorización.

Reversión: no retirar un bucket con referencias o archivos. Revisar datos y respaldar antes de cualquier operación; no borrar `brands.logo_path` ni Storage para forzar una reversión. No se ejecutó reversión.

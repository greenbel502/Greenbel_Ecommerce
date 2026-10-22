# 023 — Tipo de producto agrícola

Aprobación explícita del usuario, 22/10/2026: «Sí, agregar Producto agrícola en DEV». También aprobó redondeo al centavo. Modelo revisable: `docs/catalog-import/2026-10-22-plan.md`.

Archivo: `supabase/migrations/20261022002300_agricultural_product_kind.sql`.

Cambio: amplía solamente `products_kind_check` con `agricultural`; mismas tablas, relaciones, RLS, permisos y transacciones. Catálogo y editor reconocen el tipo; no participa en compatibilidad equipment/part. La columna ya es text; no hay conversión de registros ni cambio de precios existentes.

DEV: **APLICADA y verificada el 22/10/2026**. Antes de aplicar se comprobó la coincidencia del enlace y URL DEV, historial 001–022 y dry-run que incluía solo 023. La lectura posterior confirmó su entrada en el historial y el CHECK con los cuatro tipos. Historial final **001–023**. PROD: NO EJECUTADO / NO AUTORIZADO. La migración debe conservarse para futura promoción revisada; no usar scripts de limpieza o carga de fixtures en PROD.

SHA256 del archivo aplicado: `57e072ccbb7d588766a5acfa89e9447c6546976cc1143f494df82f1b74db4f4e`. No ejecutar scripts de limpieza/carga como parte de la promoción de esquema.

Reversión: no retirar el tipo mientras existan agrícolas; requiere plan de datos. No convertir agrícolas en equipos para eludir el CHECK.

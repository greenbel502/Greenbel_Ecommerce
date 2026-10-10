# GreenBel — revisión local de imágenes de producto

> **Archivo histórico (revisión local previa).** Las frases «no aplicada» y «NO EJECUTADO» siguientes describen el estado al redactar esta revisión, no el estado actual. Las migraciones 001–020 constan en el historial de Supabase DEV; los permisos y recorridos comprobados, con sus límites, están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). No modifica PROD.

**Estado:** `20260929000600_product_media.sql` probada en PostgreSQL 15.14 local con un esquema mínimo de Storage simulado. **Supabase DEV y Storage real: NO EJECUTADO.** No se subieron archivos ni se aplicó la migración remota.

## Contrato

- Bucket `product-images` **privado**, sin políticas `SELECT`, `INSERT`, `UPDATE` ni `DELETE` para `anon`/`authenticated` sobre `storage.objects`. Los límites del bucket son 8,000,000 bytes y MIME exactos `image/jpeg`, `image/png`, `image/webp`, `image/avif`.
- `product_images.storage_path` es relativo y debe tener formato `${productId}/${imageUuid}.jpg|png|webp|avif`; el índice único impide asociar el mismo objeto a dos filas. La ruta nunca incorpora el nombre del bucket. No admite SVG.
- El servidor `/api/admin/product-images` valida sesión y rol de administrador activo, origen, tamaño, firma del archivo y tipo declarado antes de usar `service_role`. El endpoint `/api/product-images/[id]` consulta primero `product_images` como visitante: su RLS hereda la visibilidad de producto publicado con categoría/marca activa; solo entonces descarga con `service_role` y responde con `no-store`/`nosniff`. La clave de servicio evita RLS, por lo que la comprobación previa de fila y rol **es una responsabilidad indispensable del servidor**.
- El preflight detiene la migración si faltan tablas Storage/RLS, ya existe el bucket u objetos, hay imágenes previas sin auditar o cualquier política `SELECT`/`ALL` de cliente sobre `storage.objects` que pudiera alcanzar este bucket. No cambia ni borra políticas ajenas. Si un proyecto usa otros buckets con políticas de lectura, se deben revisar expresamente antes de adaptar este preflight.

## Verificación local

| Estado | Evidencia |
| --- | --- |
| PASS | Instalación local tras 001/002/004/005 con tablas `storage.buckets`/`storage.objects` simuladas. Bucket privado, MIME y límite exactos. Reaplicar 006 se detiene. |
| PASS | Una política `SELECT` de Storage preexistente para cliente provoca rechazo antes de crear bucket; no quedan objetos parciales. |
| PASS | Ruta de otro producto, extensión SVG y duplicado se rechazan. Visitante ve una imagen de producto publicado, no la de borrador ni la de categoría desactivada. Aun con permiso SQL `SELECT`, RLS de `storage.objects` sin política no revela objetos. |
| NO EJECUTADO | Supabase Storage real, subida/descarga HTTP con credenciales DEV, tamaño/MIME aplicado por servicio, panel administrativo y distribución de archivos. La simulación local no representa el servicio de Storage. |

**Preflight DEV:** comprobar proyecto/historial, esquema Storage y políticas existentes. Verificar cero filas en `product_images` y ausencia de bucket/objetos `product-images`. Aplicar con runner de migraciones verificado; después probar un borrador y un publicado por endpoints HTTP sin mostrar credenciales. La documentación oficial distingue buckets privados de públicos y confirma que la clave de servicio evita las políticas RLS: [buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [acceso](https://supabase.com/docs/guides/storage/security/access-control), [restricciones](https://supabase.com/docs/guides/storage/buckets/creating-buckets).

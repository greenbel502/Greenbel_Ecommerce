# Extensión de perfil de cliente para validar

13/10/2026 · **Aprobada expresamente por el usuario y aplicada solo a DEV.** Migración `20260929002100_customer_profile_preferences.sql`. [Registro y futura promoción](migrations/021-customer-profile.md).

## Estado comprobado antes de 021

`profiles` ya contiene `id`, `display_name`, `phone`, `active` y fechas. El cliente autenticado puede leer su propia fila y actualizar únicamente `display_name`/`phone` bajo RLS. No existe dirección guardada ni ruta de avatar en el perfil. La dirección de entrega existe como snapshot de cada pedido, no como libreta editable. La foto de Google puede mostrarse desde la identidad verificada sin cambiar el esquema.

## Ampliación mínima aprobada

Mantener una sola fila de `profiles` por UUID de `auth.users` y añadir:

| Columna | Regla |
| --- | --- |
| `address_line text NULL` | Dirección preferida, opcional, 5–500 caracteres al guardar; vaciarla devuelve NULL. No concede cobertura ni fija tarifa o zona. |
| `avatar_path text NULL` | Ruta de foto propia en bucket privado `profile-avatars`, con formato `UUID_usuario/UUID_archivo.webp`. No admite URL externa arbitraria. |

La actualización de estas dos columnas se concede a `authenticated`, conservando las políticas de fila propia. No se concede editar `active`, `id` ni roles. El servidor verifica identidad y perfil activo para editar; valida nombre, teléfono y dirección. `display_name`/`phone` siguen usando las restricciones existentes. No se guardan NIT ni datos de facturación nuevos.

## Imágenes y Storage

- Bucket nuevo `profile-avatars`, privado, imágenes WebP procesadas por servidor, máximo 2 MB de entrada y dimensiones limitadas.
- El cliente solo puede leer/escribir/retirar objetos cuya carpeta sea su UUID; usuarios ajenos y anónimos no acceden. Políticas de Storage específicas de este bucket; no cambian otros buckets.
- Endpoint autenticado valida origen, longitud real y tipo del archivo, decodifica/reprocesa la imagen y elimina metadatos antes de guardarla. Rechaza SVG y archivos que no decodifican.
- Se carga una ruta aleatoria nueva, se actualiza el perfil propio y después se retira el avatar sustituido; un fallo de actualización retira únicamente el objeto recién cargado. No sobrescribe fotos ajenas. Repetir el guardado no cambia inventario ni pedidos.
- Se sirve mediante ruta autenticada con `private, no-store`, sin URL pública permanente. Si no hay foto cargada, se muestra la foto de Google cuando su URL pertenece al proveedor permitido; si no, iniciales.

## Uso en compras

El checkout permite copiar explícitamente nombre, teléfono y dirección preferida. No divide automáticamente el nombre en nombre/apellido, no rellena titular del NIT y no sustituye una revisión/pedido ya guardados. El comprador revisa facturación, destinatario, zona y tarifa antes de confirmar. Cambiar el perfil no modifica snapshots históricos de pedidos o cotizaciones ni sus totales.

## Migración y comprobaciones propuestas

Se comprobó el proyecto DEV enlazado, el historial 001–020 y la ausencia de los objetos nuevos. La migración **021** aditiva se creó y aplicó mediante CLI tras un dry-run que enumeró únicamente ese archivo, sin reset ni borrado de datos. Historial remoto 21/21 y permisos releídos. Cuentas A/B, modificación ajena, avatar ajeno, perfil inactivo, límites HTTP, persistencia, repetición y copia de datos se probaron en DEV. La protección de revisión recuperada se verificó con un fixture HTTP local en navegador; no se alteró un pedido real para esa prueba.

No hay decisión comercial bloqueante para esta ampliación. La aprobación del esquema requerida por AGENTS.md quedó registrada en esta sesión. PROD requiere autorización y comprobación propias; no se ha aplicado allí.

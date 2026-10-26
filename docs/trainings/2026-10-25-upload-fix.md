# Corrección de carga inicial de capacitaciones · 25/10/2026

## Hallazgo y corrección

El usuario reportó un borrador nuevo sin video ni portada. La consulta DEV confirmó una capacitación existente con ambos punteros nulos y sin objetos bajo su ID en los dos buckets. Ese registro se preservó.

La prueba de regresión del componente `TrainingAdmin`, con React StrictMode, reprodujo el fallo: después de guardar los datos, `onIdCreated` cambiaba `editing` de `new` al UUID mientras `row` seguía vacío hasta responder la consulta de asociaciones. La condición de render quitaba `TrainingEditor`; su cleanup cancelaba el AbortController de carga y perdía los archivos seleccionados. No dependía del tamaño del video. El log `2026-10-25-upload-regression-before.log` conserva la aserción fallida (`uploadSignal.aborted === true`).

Ahora `TrainingEditor` entrega el registro guardado completo a `onIdCreated`. El padre asigna ese registro junto con el ID y mantiene la misma instancia del editor. La lectura de asociaciones continúa de forma independiente; ni la demora ni el cambio de ID desmontan el formulario o cancelan la transferencia. Se conservan el guardado final, controles de autorización, carga firmada, validación de archivos y publicación existentes. No hubo SQL ni cambios de configuración.

## Verificaciones ejecutadas

- **PASS: 9 pruebas React/DOM simulado**, `2026-10-25-upload-dom.log`. La nueva regresión demora la lectura de asociaciones y la transferencia, verifica identidad del formulario, señal sin cancelar, conservación de título/portada, una sola alta y confirmación de ambos archivos. Prueba fallida antes del arreglo y aprobada después. Las ocho verificaciones anteriores también pasan.
- **PASS: 67 comprobaciones reales DEV/HTTP**, `2026-10-25-upload-http.log` y `2026-10-25-upload-http-verification.json`. Incluyen carga TUS del video MP4 de 1 128 375 bytes, portada PNG, persistencia de ambos punteros, lectura privada/pública, bytes/rangos, publicación, permisos, calificaciones, asociaciones y limpieza. Las transferencias son reales, independientes del DOM simulado; no equivalen a un clic de Chrome.
- **PASS:** TypeScript sin emitir, ESLint, Prettier y `git diff --check`. Build aislado exit 0 en `2026-10-25-upload-build.log`, sin sustituir `.next` del servidor activo.
- **PASS:** limpieza de fixtures/cuentas temporales y comparación del estado previo idéntica. Verificación posterior en `2026-10-25-upload-cleanup.json`: ningún registro QA, ningún diario pendiente, borrador del usuario preservado. No se cargaron archivos inventados sobre ese borrador.
- **NO EJECUTADO:** clic/subida/reproducción y revisión visual en Chrome real. `cua.getState()` devolvió navegadores/apps vacíos y `Sky Computer Use native pipe startup failed`. Las pruebas DOM no certifican geometría, CORS del navegador ni reproducción decodificada.

## Por qué 50 MB

Consulta de solo lectura al proyecto DEV enlazado:

- Configuración global efectiva de Storage: **52 428 800 bytes (50 MiB)**.
- Bucket privado `training-videos`: **50 000 000 bytes**, MP4/WebM; mismo máximo en la aplicación.
- Bucket privado `training-covers`: **8 000 000 bytes**, JPEG/PNG/WebP/AVIF.

Los 50 MB se eligieron como máximo inicial compatible con la configuración de Storage; no son un límite de duración del video. Supabase documenta un máximo de 50 MB para Free y límites mayores en planes de pago. No se dedujo el plan de facturación a partir de la configuración global, ni se modificó el plan o sus límites. Para archivos mayores ya existe la opción **Usar enlace** con YouTube/Vimeo; aumentar carga directa requiere revisar el máximo permitido por el plan y ajustar global, bucket y validaciones de forma coherente.

Fuente primaria consultada: https://supabase.com/docs/guides/storage/uploads/file-limits

## Continuidad

Recargar el panel para recibir el código corregido, abrir el borrador existente y seleccionar de nuevo video y portada. Los archivos de la carga fallida no están en Storage; esta corrección no puede recuperar archivos locales del usuario que ya perdió el editor. Guardar y publicar según el estado deseado. Repetir el clic en Chrome cuando su conexión esté disponible. DEV exclusivamente, correo comercial pausado, sin PROD, commit/push ni despliegue.

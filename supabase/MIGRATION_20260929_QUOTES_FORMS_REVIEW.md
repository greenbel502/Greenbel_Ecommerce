# GreenBel — revisión del bloque 003 de cotizaciones y formularios

> **Archivo histórico (revisión local previa).** Las frases «no aplicada» y «NO EJECUTADO» siguientes describen el estado al redactar esta revisión, no el estado actual. Las migraciones 001–020 constan en el historial de Supabase DEV; los permisos y recorridos comprobados, con sus límites, están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). No modifica PROD.

Estado: SQL y aplicación preparados; **no aplicado en Supabase DEV**. El resultado local no demuestra que Storage, políticas o PostgREST del proyecto enlazado coincidan. No aplicar a PROD.

## Dependencias y alcance

- Requiere 001; si existe 002, enlaza `orders.source_quote_id` por FK. La emisión web también requiere 002 para leer disponibilidad verificada. Comprueba la referencia del proyecto DEV enlazado antes de usar la CLI.
- Crea `quotes`, `quote_items`, `quote_rate_limits`, `contact_messages`, `contact_rate_limits`, `financing_requests`, `guest_access_grants` y el bucket privado `quote-pdfs`, limitado a PDF.
- Las tablas privadas tienen RLS y no dan SELECT ni INSERT directo a `anon` o `authenticated`. El contacto solo entra por `record_contact_message`, ejecutable por `service_role`; ni siquiera ese rol tiene permisos directos de tabla para contacto o límites.
- `record_contact_message` une clave idempotente, límite duradero de 20 registros distintos por fuente y hora, y escritura en una transacción. Los reintentos iguales devuelven el mismo recibo sin consumir otra cuota; la fuente es un HMAC de la IP del ingreso confiable, nunca la IP en claro. Los contadores vencidos se purgan gradualmente después de 48 horas.
- `begin_guest_quote` crea un único registro interno de generación por clave y limita las emisiones nuevas a 6 por fuente y hora. El servidor lee el catálogo publicado y el inventario verificado, calcula importes sin aceptar precios del navegador, genera el PDF, lo carga en Storage privado, lo vuelve a leer y comprueba bytes/SHA-256 antes de `issued`. El disparador de emisión vuelve a conciliar líneas, precio/oferta actual y objeto privado. La cotización no reserva inventario.
- `consume_guest_access_grant` consume el hash del token mediante un `UPDATE` condicional atómico, acotado a una cotización o borrador de financiamiento, vencimiento, revocación y usos disponibles. Solo `service_role` ejecuta la función. El endpoint de descarga debe usar esta operación, no SELECT seguido de UPDATE.
- `create_financing_draft` valida el token de la cotización emitida, consume un uso y guarda el borrador con consentimiento versionado en la misma transacción. Reintentos idénticos no consumen otro uso. No existe OTP, estado `sent` ni envío.
- Las cotizaciones emitidas son inmutables; una revisión crea otra fila con `supersedes_id`. Emitir exige importes conciliados, producto publicado y con precio vigente, y metadatos de un objeto existente en el bucket privado. El servidor debe verificar el PDF real tras cargarlo; la tabla `storage.objects` es metadato, no prueba del contenido binario.
- Financiamiento sigue exclusivamente en `draft`. Contacto registra `not_sent` como hecho histórico, sin cola ni correo acumulado.

## Verificaciones locales

- **PASS:** PostgreSQL 15 desechable, stubs mínimos de Auth/Storage, migraciones 001–003 en una transacción y `tests/sql/quotes_forms.test.sql` con ROLLBACK. Comprueba permisos, RLS, 20 contactos/hora, 6 cotizaciones/hora, reintentos, uso de grants, emisión privada, precio ausente, borrador idempotente con consentimiento y bloqueo de `sent`.
- **PASS:** dos sesiones concurrentes consumieron un grant de un solo uso; la primera obtuvo `true`, la segunda `false`, el contador terminó en 1 y la segunda esperó el bloqueo de fila. Dos borradores concurrentes con la misma clave dejaron una sola fila y un solo uso de grant.
- **PASS:** prueba negativa en otra base local: una política `SELECT TO anon USING (true)` en `storage.objects` hizo que 003 se detuviera en preflight y revirtiera toda la transacción. El preflight también exige RLS y bucket `quote-pdfs` inexistente.
- **PASS:** ESLint de las rutas/componentes de contacto, cotización y financiamiento, TypeScript global y `git diff --check`.
- **NO EJECUTADO:** migración, inserción/descarga de PDF real, permisos de Storage y PostgREST en Supabase DEV. Antes de aplicar, inspecciona las políticas existentes de `storage.objects`; cualquier política cliente SELECT/ALL detendrá 003 para auditoría. Prueba el bucket privado y las operaciones RPC en DEV sin datos reales. La prueba SQL usa metadatos Storage simulados; no prueba el servicio binario.

## Ruta de contacto

`POST /api/contacto` acepta JSON limitado a 8 KiB, valida en servidor y confirma solo después de `record_contact_message`. Requiere la clave privilegiada del entorno activo exclusivamente en servidor. En Vercel usa el encabezado de IP que entrega el ingreso para derivar HMAC; fuera de Vercel solo permite un cupo compartido durante desarrollo local y falla cerrado en otro runtime de producción. Si falta la migración o configuración, responde error y conserva los datos en el formulario. No llama a Resend ni marca un correo como enviado.

## Cotización y financiamiento

`POST /api/cotizaciones` acepta solo IDs y cantidades del carrito, nombre y correo opcional. Devuelve referencia y token privado solo tras `issued`; si Storage falla antes, deja `failed` o `generating` para auditoría y responde error. Un resultado incierto después del `UPDATE` no borra el PDF que podría haber quedado emitido. `POST /api/cotizaciones/[id]/pdf` consume el grant atómicamente y entrega bytes verificados con `Content-Disposition: attachment`, sin URL pública o ruta interna en la respuesta. El token se conserva solo en la sesión del navegador para pasar a financiamiento; el usuario debe guardar el PDF durante la pausa de correos.

`POST /api/financiamiento/borradores` requiere una cotización emitida, token privado, datos validados y consentimiento explícito. Confirma únicamente el estado `draft_recorded`, con verificación pendiente y entrega deshabilitada. No despacha automáticamente borradores cuando se integre el correo.

Las vistas `/admin/consultas` y `/admin/financiamiento` comprueban sesión y rol de administrador antes de cualquier lectura privilegiada. Muestran 50 registros por página y no tienen acciones de envío, verificación o cambio de estado. Operadores no tienen acceso a financiamiento; por prudencia, tampoco a consultas hasta que exista una decisión de permisos más amplia. La comprobación de rol y vistas en Supabase DEV sigue **NO EJECUTADO**.

# Financiamiento con PDF por Gmail · implementación verificada en DEV

Fecha: 25/10/2026. El usuario aprobó expresamente el modelo y la migración 030 solo en DEV, configuró su propio buzón de prueba como principal de Cooperativa y autorizó el PDF con disponibilidad pendiente para este propósito. No se hicieron commit, push, despliegue ni cambios en PROD.

## Comportamiento entregado

- El bloque de contacto en `/financiamiento` usa el logotipo blanco original, transparente, sin filtros ni recortes. Fuente oficial: https://www.concepcionrl.com/wp-content/uploads/2025/03/logoConce-blanco.png (8000 × 2863).
- El formulario toma productos/cantidades del carrito. El servidor consulta precios/ofertas, calcula importes y emite el PDF privado. Solo el propósito explícito `financing` permite disponibilidad pendiente; las cotizaciones normales siguen exigiendo existencias. La advertencia queda congelada en el PDF. No se modifica inventario, pagos ni decisiones de crédito.
- Al continuar se guarda el borrador y consentimiento `finance-share-v2`. Se envía un código al correo del solicitante: seis dígitos, diez minutos, cinco fallos, espera de sesenta segundos para reenvío, cinco emisiones por correo/hora y veinte por origen/hora. Reenviar invalida el anterior. El código no se almacena en claro.
- El cliente puede descargar y revisar el PDF privado. Tras verificar el código debe pulsar **Enviar solicitud y PDF**. Seleccionar productos, guardar el borrador o verificar el correo no envía datos a la cooperativa.
- El destinatario se obtiene en la base de datos del correo principal de Cooperativa configurado en Administración → Contacto. El visitante no puede elegirlo. From corresponde a Gmail autorizado y Reply-To al solicitante verificado. Se adjuntan los bytes originales del PDF, previa verificación de SHA-256 y tamaño.
- Una reclamación atómica evita envíos simultáneos/duplicados. Rechazos inequívocos permiten reintento explícito después de sesenta segundos, máximo cinco intentos. Un resultado incierto no se reenvía automáticamente. Si cambia el destinatario de un intento previo, se exige una nueva solicitud/confirmación.
- Administración → Financiamiento muestra verificación y estado de correo; permite reintentar un fallo de una solicitud ya confirmada. No activa borradores históricos. No se añadieron scopes Google ni autenticación Google para clientes; el formulario sigue siendo accesible sin cuenta.

## Archivos del alcance

- Migración: `supabase/migrations/20261025003000_financing_gmail.sql`.
- Estado, acceso, OTP y envío: `src/lib/financing/{workflow,http}.ts` y `src/lib/gmail/financing-delivery.ts`.
- Plantillas/MIME: `src/lib/gmail/{financing-message,mime,message}.ts`. La plantilla de contacto conserva su comportamiento; el compositor admite PDF.
- Rutas: `src/app/api/financiamiento/{borradores,verificacion,estado,enviar,pdf}/route.ts`; reintento administrativo en `src/app/api/admin/financiamiento/reintentar/route.ts`.
- Cotización: `src/app/api/cotizaciones/route.ts`, `src/domain/quotes/build-pending-quote.ts`. Se mantiene el generador PDF y su almacenamiento privado existentes.
- UI: `src/presentation/components/financing-form.tsx`, `src/app/financiamiento/page.tsx`, estilos específicos añadidos a `src/app/globals.css`; logotipo en `public/images/cooperativa-concepcion-blanco.png`.
- Administración: `src/app/admin/financiamiento/{page,retry-button}.tsx`, filtros en `src/lib/admin-list-config.ts`, descripción vigente en `src/app/admin/contacto/contacts-admin.tsx`.
- Configuración/continuidad: `.env.gmail.example`, `AGENTS.md`, `GREENBEL_VARIABLES_DE_ENTORNO.md`, `GREENBEL_AVANCE.md` y esta carpeta.
- Pruebas: `tests/financing-message.test.mjs`, `tests/financing-workflow.sql`, ampliación de `tests/build-pending-quote.test.mjs`; scripts DEV `dev-financing-{sql,http-qa,cleanup-qa}.mjs`.

## Configuración local y Vercel

Se reutilizan `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, `GOOGLE_GMAIL_REDIRECT_URI`, `GMAIL_SENDER_EMAIL`, `GMAIL_NOTIFICATION_EMAIL` y `GMAIL_TOKEN_ENCRYPTION_KEY` de la integración de contacto. La variable GMAIL_NOTIFICATION_EMAIL continúa siendo el destino de contacto, **no el de financiamiento**.

Nueva variable exclusivamente de servidor: `FINANCING_OTP_HMAC_KEY`, 32 bytes aleatorios en Base64 estándar, diferente en cada entorno. Se generó y guardó privadamente en el `.env` local ignorado por Git. Para generar otra sin reutilizar DEV: `openssl rand -base64 32`. No ponerla en NEXT_PUBLIC ni copiar su valor a documentación.

Para producción, primero autorizar su alcance y aplicar el modelo en el Supabase de producción; configurar variables privadas en Vercel, URL activa y callback `https://green-bel.vercel.app/api/integrations/gmail/callback`, conectar Gmail desde Administración → Consultas en ese entorno y establecer el correo principal real de Cooperativa. Verificar requisitos de publicación/autorización OAuth de Google; la aplicación ha estado en modo de pruebas y no se certifica funcionamiento permanente. No reutilizar el token cifrado ni las claves de DEV en PROD. El destinatario actual en DEV es un buzón controlado para QA.

## Evidencia ejecutada

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Precondiciones de destino DEV y simulación DDL | PASS; rollback antes de aplicación | `2026-10-25-financing-migration-rollback.log` |
| Aplicación 030 y paridad local/remota | PASS; 30 migraciones | `2026-10-25-financing-migration-apply.log`, `...-migration-list.log` |
| Gmail/contacto y MIME de financiamiento/OTP | PASS; 26 pruebas | `2026-10-25-financing-regression.log` |
| Importes, propósito de financiamiento y PDF | PASS; 6 pruebas | `2026-10-25-financing-quote-tests.log` |
| Seguridad/transiciones SQL de financiamiento | PASS; 25 casos, todos revertidos | `2026-10-25-financing-sql-qa.log` |
| Regresión SQL Gmail de contacto | PASS; 20 casos, todos revertidos | `2026-10-25-financing-contact-sql-regression.log` |
| HTTP anónimo autorizado/denegaciones, no duplicado y PDF íntegro | PASS; 13 casos | `2026-10-25-financing-http-qa.json` |
| TypeScript, ESLint del alcance, diff whitespace | PASS | `2026-10-25-financing-types.log`, `...-lint.log` |
| Build Next.js en copia aislada | PASS; salida 0, sin alterar `.next` del servidor de trabajo | `2026-10-25-financing-build.log` |
| OTP real y confirmación desde Chrome | PASS | Prueba propia `QA Financiamiento GreenBel 030`; código leído de Gmail e introducido en el formulario |
| Recepción real en buzón principal de prueba | PASS, **Gmail lo clasificó como Spam** | `2026-10-25-financing-receipt.json`, `...-mail-received.png` |
| Adjunto recibido vs. original privado | PASS; 4128 bytes, SHA-256 idéntico; render/texto revisados | `...-receipt.json`, `...-pdf.png`, `...-pdf-text.txt`; muestra en `output/pdf/financiamiento-prueba-dev.pdf` |
| Remitente/destinatario/Reply-To | PASS en detalles de Gmail | From greenbel502@gmail.com, destino de prueba configurado, Reply-To al correo verificado del solicitante |
| Vista administrativa | PASS en Chrome | Registro mostró “Correo aceptado por Gmail”, destinatario configurado y PDF privado; no aprobación financiera |
| Layout del formulario | PASS a 390 × 900, 820 × 900 y 1440 × 900 CSS; sin overflow horizontal | `...-390.png`, `...-820.png`, `...-desktop.png`, `...-responsive.json` |
| Teclado | PASS; Tab de Nombre a Correo en móvil | Observado en Chrome; campos sin salir del viewport |
| Limpieza de fixtures propios | PASS; simulación y transacción aplicada, protección reactivada, datos ajenos idénticos | `...-cleanup-simulation.json`, `...-cleanup-applied.json` |

La selección real de QA fue BIORADICANTE 250 CC: 2 × Q83.25 = Q166.50. Se recibió un solo correo de solicitud y un código de verificación. Un POST repetido conservó un único intento de Gmail. No se envió a una cooperativa real. Los tests SQL de errores usan fixtures revertidos y no realizan envíos reales.

Se retiraron únicamente la cotización, solicitud, línea, dos accesos, desafío y notificación creados por esta prueba, además de su objeto privado Storage. Respaldo privado antes de borrar, simulación revertida y comparación de todas las tablas public/greenbel_private excluyendo esos IDs. Los triggers de historial quedaron habilitados antes del commit. Las evidencias y el PDF local permanecen; no se borraron correos ni se cambiaron contactos administrativos. Los scripts SQL/HTTP positivos requieren recrear un fixture propio autorizado para volver a ejecutarse.

## Límites concretos

PROD/Vercel: NO EJECUTADO. No se afirma llegada permanente a Recibidos: la recepción real se encontró en Spam. El destinatario deberá revisar su clasificación y remitente antes de operar. No se modificó la configuración antispam de Gmail. No se probaron otros clientes de correo ni el paso OTP en un navegador móvil físico. Los tamaños responsive se emularon en Chrome y se comprobó el formulario; la operación real de OTP/envío se ejecutó en escritorio.

Continuidad: implementación y verificación DEV completadas. Futuras pruebas deben utilizar correos controlados y solicitudes nuevas; no reactivar registros históricos ni enviar de nuevo un resultado incierto.

# Gmail API para consultas de GreenBel · 25/10/2026

**Actualización posterior de presentación:** se eliminó Producto o código del formulario y se renovó la plantilla con logotipo CID. Ver [cambios y nueva verificación real](2026-10-25-template-refresh.md). Las evidencias de esta página documentan la integración inicial.

**Completado y probado en DEV.** La cuenta greenbel502@gmail.com quedó autorizada por el administrador. Una consulta enviada sin sesión se guardó en Supabase y generó un correo real recibido en esa cuenta. El botón Responder de Gmail seleccionó el correo ficticio del cliente; no se envió una respuesta.

No hubo commit, push, despliegue ni cambios en PROD. El formulario conserva sus componentes, distribución, estilos y validaciones; solo se agregaron el honeypot invisible y la notificación posterior al guardado, y se retiraron los textos obsoletos de correo pausado. Financiamiento y OTP mantienen su pausa.

## Flujo implementado

1. El formulario existente envía a POST /api/contacto sin exigir autenticación. Se conservan el identificador de idempotencia, la validación de servidor y la RPC record_contact_message.
2. Supabase confirma la consulta. El servidor devuelve recorded, con HTTP 201 para un alta o 200 para una repetición idéntica. Solo entonces el formulario confirma el registro.
3. Un trigger crea una notificación privada para consultas nuevas cuando existe una conexión Gmail. No se copian consultas históricas al conectar o reconectar.
4. Next.js after programa la entrega después de responder al visitante. Una reclamación transaccional impide dos intentos activos para la misma consulta.
5. El servidor descifra el refresh token, obtiene un access token y usa la biblioteca oficial googleapis para llamar a users.messages.send con el buzón remitente configurado.
6. Se guarda el identificador devuelto por Gmail y el estado sent. Los access tokens permanecen en memoria; el refresh token se guarda cifrado.

La notificación contiene nombre, correo, teléfono opcional, tipo de consulta, producto/código, mensaje completo, fecha/hora de Guatemala e ID. El asunto es «Greenbel | Nueva consulta de [Nombre]». From y To provienen exclusivamente de las variables privadas; Reply-To contiene el correo validado del visitante. La plantilla tiene texto y HTML con datos escapados, encabezados protegidos y referencia estable por consulta. Se usa solamente gmail.send: la aplicación no lee el buzón.

## OAuth y almacenamiento

- Inicio y reintento restringidos al administrador activo de Supabase, con comprobación del origen. Se reutiliza la autorización y la renovación de sesión existentes.
- OAuth web server con offline, consentimiento, selección de cuenta y PKCE S256. Solo solicita https://www.googleapis.com/auth/gmail.send; el callback rechaza permisos adicionales.
- State aleatorio cifrado, vinculado al mismo administrador, con vigencia de diez minutos. Cookie HttpOnly, SameSite=Lax y Secure sobre HTTPS. Se valida antes de canjear el código y se elimina al finalizar.
- Refresh token cifrado mediante AES-256-GCM, IV aleatorio y contexto ligado al entorno/base/cliente/remitente. Cambiar esos valores o perder la clave requiere reconectar.
- Dos tablas en greenbel_private, con RLS y sin acceso directo para anon, authenticated ni service_role. Funciones concretas de servicio permiten al backend operar; el navegador no recibe tokens ni ciphertext.
- El cliente recibe únicamente el estado y una URL de autorización de Google. El botón abre explícitamente esa URL; mantiene POST/303 como alternativa sin JavaScript. Esto corrigió la apertura que el usuario reportó como «error 303».
- No se registran objetos de error de Google, tokens ni datos del mensaje. Los fallos usan códigos controlados e ID de consulta. El registro de solicitudes DEV omite el callback para no imprimir el código OAuth de su URL.

El 403 de Google se debía al modo External/Testing sin el usuario permitido. Con aprobación expresa del usuario se agregó únicamente greenbel502@gmail.com a los usuarios de prueba. El usuario completó personalmente el consentimiento y confirmó «Gmail conectado».

## Fallos, estados y reintentos

| Estado   | Comportamiento                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| not_sent | Consulta anterior o creada antes de existir una conexión. Se conserva y no se envía al conectar.                                |
| pending  | Notificación nueva aún no intentada; permite recuperación administrativa.                                                       |
| sending  | Un intento posee la notificación. No se permite otro envío concurrente. Tras dos minutos el panel advierte que se revise Gmail. |
| sent     | Gmail aceptó el mensaje. No puede reenviarse desde esta integración.                                                            |
| failed   | Fallo previo al envío o rechazo inequívoco del proveedor. Reintento administrativo con espera y máximo cinco intentos.          |
| unknown  | Resultado incierto después de iniciar el envío. No permite reintento automático ni desde el botón, para evitar duplicados.      |

Si Gmail falla, la consulta permanece guardada y el visitante conserva su confirmación de registro. Una autorización revocada marca la conexión como pendiente de reconexión; las consultas nuevas durante esa interrupción quedan recuperables. Reconectar por sí mismo no despacha pendientes ni históricos. El administrador decide cuándo reintentar las notificaciones pendientes/fallidas desde Consultas.

La espera de reintentos aumenta desde 60 segundos hasta una hora. Un timeout, 5xx o pérdida de respuesta durante el envío puede significar que Gmail aceptó el mensaje: queda sin confirmar. Si Gmail aceptó pero falla el acuse en Supabase, se reintenta únicamente ese acuse idempotente, nunca el envío.

**Límite explícito:** Gmail send no ofrece aquí una clave de idempotencia con garantía de entrega exactamente una vez. El Message-ID estable facilita la revisión; no se presenta como una garantía de deduplicación de Gmail. Un proceso interrumpido en sending requiere revisión del buzón mediante la referencia antes de cualquier resolución manual.

## Protección del formulario público

Se conserva la cuota durable de la RPC y la huella de contenido por idempotencyKey; una repetición idéntica no duplica consulta ni notificación, y usar la misma clave con otros datos devuelve 409. El origen debe estar autorizado. El cuerpo está limitado a 8 KiB, el nombre a 160 caracteres, el correo a 254, el teléfono a 40, el tipo a 120, el producto a 160 y el mensaje a 10–5000. Se rechazan campos adicionales, caracteres de control y el honeypot rellenado.

La cuota usa la IP de ingreso confiable de Vercel convertida en HMAC; no guarda la IP en claro ni acepta un encabezado libre del cliente. DEV local comparte una cuota durable porque no tiene un ingreso IP confiable. Un servidor optimizado fuera de Vercel requiere adaptar explícitamente ese ingreso; no se declara compatible por inferencia.

## Archivos de la integración

| Área                                | Archivos creados o modificados                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencias                        | package.json, package-lock.json: googleapis y google-auth-library oficiales.                                                                    |
| Configuración, cifrado y OAuth      | src/lib/gmail/config.ts, crypto.ts, oauth.ts.                                                                                                   |
| Mensaje, persistencia y entrega     | src/lib/gmail/message.ts, repository.ts, deliver.ts.                                                                                            |
| Rutas administrativas               | src/app/api/integrations/gmail/connect/route.ts, callback/route.ts, retry/route.ts.                                                             |
| Registro existente                  | src/app/api/contacto/route.ts.                                                                                                                  |
| Formulario existente                | src/presentation/components/contact-form.tsx; src/app/contacto/page.tsx: confirmación y textos.                                                 |
| Panel mínimo de autorización/estado | src/app/admin/consultas/page.tsx, gmail-connection.tsx, gmail-connect-button.tsx; src/app/admin/inbox.module.css; src/lib/admin-list-config.ts. |
| Sesión y logs                       | src/middleware.ts: matcher exclusivo añadido para rutas Gmail; next.config.ts: ocultar callback en log DEV.                                     |
| Modelo aprobado                     | supabase/migrations/20261025002800_gmail_contact_notifications.sql y 20261025002900_gmail_pending_recovery.sql.                                 |
| Pruebas                             | tests/gmail.test.mjs, tests/gmail-notifications.sql, scripts/dev-gmail-sql-qa.mjs, scripts/dev-gmail-http-qa.mjs.                               |
| Configuración y continuidad         | .env.gmail.example, GREENBEL_VARIABLES_DE_ENTORNO.md, GREENBEL_AVANCE.md, AGENTS.md y esta carpeta docs/gmail.                                  |

El archivo privado .env recibió únicamente una clave de cifrado aleatoria generada para DEV; las cinco variables Gmail ya estaban presentes. No se incluye en Git. El repositorio contiene trabajo previo de catálogo, carrito, capacitaciones y otros módulos; esos cambios no forman parte de esta integración y se conservaron.

## Variables de entorno

Todas son privadas del servidor, sin prefijo NEXT_PUBLIC_. Ejemplo sin secretos en [.env.gmail.example](../../.env.gmail.example).

| Variable                   | Uso / valor por entorno                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| GOOGLE_GMAIL_CLIENT_ID     | Cliente OAuth web «Greenbel Gmail Sender».                                                                                      |
| GOOGLE_GMAIL_CLIENT_SECRET | Secreto del mismo cliente OAuth.                                                                                                |
| GOOGLE_GMAIL_REDIRECT_URI  | DEV: http://localhost:3000/api/integrations/gmail/callback. PROD: https://green-bel.vercel.app/api/integrations/gmail/callback. |
| GMAIL_SENDER_EMAIL         | Cuenta que autoriza el envío. DEV probado: greenbel502@gmail.com.                                                               |
| GMAIL_NOTIFICATION_EMAIL   | Destinatario fijo. DEV probado: greenbel502@gmail.com; puede coincidir con el remitente.                                        |
| GMAIL_TOKEN_ENCRYPTION_KEY | Exactamente 32 bytes aleatorios en Base64 estándar. Claves distintas en DEV/PROD.                                               |

Se reutilizan APP_ENV, DEV_APP_URL/PROD_APP_URL y las variables Supabase del ambiente activo. La URL de callback debe coincidir con el origen de APP_URL activo y con la registrada en Google. En PROD exige HTTPS. No se usan las credenciales de la CLI en el runtime.

Guardar la clave en un gestor de secretos y en Vercel; no copiar el token cifrado de DEV a PROD. Si se cambia la clave, el cliente OAuth o el remitente, volver a autorizar Gmail. La ausencia de configuración Gmail no impide registrar consultas ni habilita otros correos. DEV_EMAIL_DELIVERY_MODE/PROD_EMAIL_DELIVERY_MODE continúan controlando la pausa anterior de financiamiento/OTP, no esta autorización explícita de contacto.

## Autorizar o reconectar Gmail

1. Iniciar sesión en GreenBel con una cuenta administradora activa.
2. Abrir /admin/consultas y pulsar Conectar Gmail o Reconectar Gmail.
3. En Google elegir exactamente la cuenta configurada en GMAIL_SENDER_EMAIL, ahora greenbel502@gmail.com, y autorizar únicamente el envío.
4. Al volver debe aparecer Gmail conectado. No deben introducirse tokens en campos del navegador ni copiarse a consultas.
5. Si aparece reconexión requerida, repetir el consentimiento y después reintentar individualmente las notificaciones pendientes/fallidas que corresponda.

Este flujo ya se completó realmente en localhost. El 303 del flujo alternativo es una redirección HTTP esperada, no un error de Google.

## Promoción futura a Vercel — preparada, NO ejecutada

1. Revisar el historial independiente de Supabase PROD y obtener autorización para sus cambios. Aplicar las migraciones pendientes en orden; esta sesión solo aplicó 028/029 a DEV. No ejecutar migraciones al arrancar Next ni copiar datos/credenciales DEV.
2. En Google Cloud registrar exactamente https://green-bel.vercel.app/api/integrations/gmail/callback en el cliente OAuth. Verificar la configuración de marca/audiencia y los requisitos de publicación del permiso gmail.send. No ampliar a permisos de lectura.
3. En Vercel Production cargar las seis variables Gmail privadas, APP_ENV=PROD, PROD_APP_URL=https://green-bel.vercel.app y las variables Supabase PROD existentes. Usar una clave de cifrado nueva. Para Preview usar un entorno y callback expresamente registrados; no reutilizar automáticamente la autorización PROD.
4. Elegir un Node soportado por Vercel y el SDK, por ejemplo 22 o 24; se verificó localmente Node 23.10.0 y Next 15.5.27. No se cambió el runtime del proyecto durante esta sesión.
5. Con autorización de despliegue, construir/publicar. La ruta usa runtime Node.js y maxDuration=60; after está integrado con el ciclo de respuesta de Next. Confirmar que el plan/configuración de funciones conserve ese tiempo. El envío tiene timeout de 15 segundos y sin reintentos automáticos de transporte.
6. En el sitio desplegado, iniciar sesión como administrador y conectar Gmail nuevamente. Las cookies Secure y la sesión corresponden al dominio publicado; la conexión DEV no se promueve.
7. Ejecutar una consulta anónima controlada en producción y comprobar Supabase, recepción real, contenido y Responder. Esto sigue **NO EJECUTADO**.

**Google sigue en Testing:** las autorizaciones de usuarios de prueba, incluidos refresh tokens offline con este scope, caducan a los siete días. La pantalla observada tenía la publicación pendiente de completar Branding. Se requiere resolver marca/publicación y la verificación aplicable antes de considerar estable el funcionamiento permanente; pasar a producción no se realizó. [Requisitos de audiencia/publicación de Google](https://support.google.com/cloud/answer/15549945?hl=en).

## Resultados y evidencia

| Comprobación                                                                                | Resultado real                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias sobre código TS, OAuth, MIME, seguridad y fallos                                  | **20/20 PASS**. Proveedor/DB simulados donde corresponde; [log](2026-10-25-unit.log).                                                                                         |
| SQL DEV: permisos/RLS, transiciones, concurrencia lógica, idempotencia, fallos/reconexión   | **20/20 PASS**, transacción revertida; [log](2026-10-25-sql-qa.log).                                                                                                          |
| HTTP DEV sin sesión: validación, autenticación administrativa, registro, envío y duplicados | **18/18 PASS**; [resultados](2026-10-25-http-results.json).                                                                                                                   |
| Autorización administrativa de Google                                                       | **PASS real**, consentimiento completado por el usuario.                                                                                                                      |
| Notificación real                                                                           | **PASS**, recibida en Recibidos de greenbel502@gmail.com.                                                                                                                     |
| Contenido y Responder                                                                       | **PASS real**: campos completos, HTML escapado y destinatario de respuesta qa-greenbel@example.invalid. No se envió ninguna respuesta.                                        |
| Duplicado del mismo POST                                                                    | **PASS**: HTTP 200, un solo intento y mismo ID Gmail; una coincidencia en la búsqueda del asunto.                                                                             |
| TypeScript, ESLint, Prettier, diff y compilación optimizada aislada                         | **PASS**, build exit 0; no se sustituyó .next del servidor del usuario.                                                                                                       |
| Secretos en JS público                                                                      | **PASS**, 103 archivos revisados contra tres secretos reales; [resultado](2026-10-25-client-secret-scan.json).                                                                |
| Tarjeta administrativa a 389/820/1440 CSS px en Chrome                                      | **PASS**, sin desbordamiento horizontal, estado y botón visibles; [medidas](2026-10-25-responsive.json). Viewport restablecido.                                               |
| DEV migraciones                                                                             | **PASS**, 29/29 local/remoto; [historial](2026-10-25-migration-history.log).                                                                                                  |
| Datos ajenos                                                                                | **PASS**, comparación HTTP de catálogo/inventario/pedidos/pagos/cotizaciones/financiamiento sin diferencias.                                                                  |
| Limpieza QA                                                                                 | **PASS**: solo la consulta propia y su job retirados; otras consultas y autorización Gmail idénticas. El correo de evidencia permanece; [resultado](2026-10-25-cleanup.json). |
| Vercel/PROD, dispositivo físico, expiración real de siete días                              | **NO EJECUTADO**. Las pruebas de revocación/reconexión son unitarias/SQL, sin revocar la autorización real.                                                                   |

La consulta real previa del usuario se conserva como Sin notificación; no se envió retroactivamente.

Prueba de correo: asunto «Greenbel | Nueva consulta de QA Gmail GreenBel 01ec86c2», consulta 04630c38-efaf-42fe-af5a-e1265ddf4d0e, ID Gmail 1a175c6555794aff, registrada el 25/10/2026 a las 19:14:53 de Guatemala. [Metadatos](2026-10-25-real-send.json), [correo recibido](2026-10-25-correo-recibido.png), [Responder verificado](2026-10-25-reply-to-verificado.png).

La primera QA SQL detectó que no se podía recuperar manualmente un pending. Se corrigió en 029 dentro del modelo ya aprobado y se repitieron las 20 verificaciones con éxito. Se conserva el [fallo inicial](2026-10-25-sql-first.log); no se editó una migración aplicada.

Para reproducir pruebas: node --test tests/gmail.test.mjs; node --env-file=.env scripts/dev-gmail-sql-qa.mjs. El script HTTP con --send-test envía un correo real al destinatario configurado y crea un fixture: usarlo solo como prueba controlada y limpiar únicamente ese fixture después. Los resultados finales ya están guardados; no es necesario enviar otra prueba.

## Pendientes y límites para producción

- Aplicación/despliegue/configuración/autorización y prueba real PROD pendientes; no presentar el build local como validación de Vercel.
- Completar los requisitos OAuth de Google y salir de Testing con la verificación que aplique. Reautorizar después para una operación estable.
- No se implementó un despachador programado de pendientes. El primer intento usa after y la recuperación es administrativa; una caída deja el estado persistido para revisión, sin enviar históricos al conectar.
- npm audit señaló versiones preexistentes de Next 15.5.27 y Zod 4.4.3. Revisar su actualización antes de promover. La corrección Next de la rama 15.5 es 15.5.28. El sharp usado por Next ya es 0.35.5 mediante el override existente, mitigación indicada para el aviso SVG; no se afirma que esa RCE siga sin mitigar. No se actualizó framework/validadores ajenos al alcance de Gmail. [Aviso oficial Next](https://nextjs.org/blog/nextjs-security-update-october-14-2026), [aviso Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

## Continuidad

DEV queda con Gmail conectado y sin fixtures propios pendientes. Servidor principal del usuario conservado, sin reinicio manual, commit/push ni despliegue. Para la siguiente fase, partir de esta evidencia, conservar la autorización privada y separar cualquier promoción PROD de la integración ya probada en DEV.

Referencias de implementación: [OAuth web server](https://developers.google.com/identity/protocols/oauth2/web-server), [envío Gmail/MIME](https://developers.google.com/workspace/gmail/api/guides/sending), [users.messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send), [Next after](https://nextjs.org/docs/15/app/api-reference/functions/after).

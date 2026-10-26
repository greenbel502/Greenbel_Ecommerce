# Gmail: variables por entorno

Nombres solicitados por el usuario el 26/10/2026. La selección del servidor depende de `APP_ENV`, sin recurrir al otro entorno ni a variables globales antiguas.

| Dato | DEV | PROD |
| --- | --- | --- |
| Cliente OAuth de envío | `GOOGLE_GMAIL_DEV_CLIENT_ID` | `GOOGLE_GMAIL_PROD_CLIENT_ID` |
| Secreto OAuth | `GOOGLE_GMAIL_DEV_CLIENT_SECRET` | `GOOGLE_GMAIL_PROD_CLIENT_SECRET` |
| Callback Gmail | `GOOGLE_GMAIL_DEV_REDIRECT_URI` | `GOOGLE_GMAIL_PROD_REDIRECT_URI` |
| Remitente autorizado | `GMAIL_SENDER_DEV_EMAIL` | `GMAIL_SENDER_PROD_EMAIL` |
| Destinatario de contacto | `GMAIL_NOTIFICATION_DEV_EMAIL` | `GMAIL_NOTIFICATION_PROD_EMAIL` |
| Cifrado de tokens | `GMAIL_TOKEN_ENCRYPTION_KEY` | `GMAIL_TOKEN_ENCRYPTION_KEY` |

El `.env` local puede contener ambos grupos y mantiene `APP_ENV=DEV`. Vercel Production utiliza `APP_ENV=PROD` y necesita el grupo PROD y `GMAIL_TOKEN_ENCRYPTION_KEY`. La clave de cifrado conserva un nombre común por decisión explícita del usuario; cada despliegue mantiene su valor existente, sin rotarlo. Ver `.env.gmail.example`. Los nombres antiguos en documentación del 25/10 son históricos.

## Conservación de autorizaciones

Se renombran las variables conservando sus valores. No se rotan secretos ni se copian tokens entre bases. Los contextos criptográficos, la huella del cliente, las cookies, el permiso exclusivo `gmail.send`, la persistencia y las reglas de notificación permanecen iguales. Una variable del entorno activo ausente deja la notificación sin configurar; no selecciona credenciales del otro entorno.

Los nombres independientes permiten configurar clientes OAuth diferentes, pero renombrarlos no crea proyectos ni clientes Google nuevos. La separación de esos clientes se administra en Google Cloud.

## Inicio de sesión con Google

Estas variables corresponden al envío administrativo de Gmail. «Continuar con Google» utiliza el proveedor configurado en **Supabase → Authentication → Providers → Google** de cada proyecto. No utiliza estas variables ni cambia su autenticación en esta adaptación. `GOOGLE_AUTH_CLIENT_SECRET`, solicitado como medio privado para completar esa configuración, no es una variable consumida por el runtime de Next.js.

## Verificación

PASS: 158 pruebas automatizadas (25 de Gmail), TypeScript, lint de los archivos modificados y comprobación de formato del diff. La configuración privada real de ambos entornos carga con los nombres nuevos, sin llamar a Google ni enviar correo.

Las pruebas comprueban la selección completa DEV/PROD, ausencia de fallback a DEV o nombres globales antiguos del cliente desde PROD, independencia frente a configuración inactiva incompleta y validación de callback/cifrado, además de los escenarios existentes de autorización y entrega.

Durante la transición Vercel conserva las variables anteriores para permitir el despliegue vigente y su reversión. El código actualizado utiliza únicamente los nombres de esta tabla; `GMAIL_TOKEN_ENCRYPTION_KEY` continúa activo. No se modifican migraciones, datos de negocio ni autorizaciones OAuth.

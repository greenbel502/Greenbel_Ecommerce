# GreenBel — Guía de variables de entorno para la IA

> **Decisión vigente · 29/09/2026:** solo el envío real de correos está temporalmente pausado en DEV y PROD. Se integrará después con Resend al configurar el dominio. Continúan formularios, PDF, validaciones y persistencia. No simular correo verificado ni envío exitoso. Contacto se registra sin notificación y financiamiento queda en borrador. No enviar automáticamente registros acumulados al reactivar. Ver GreenBel_Correos_Verificacion_Financiamiento.md.

## 1. Propósito y alcance

Este documento define cómo debe utilizar la IA las variables del `.env` de GreenBel: qué significa cada una, para qué se necesita y cómo separar desarrollo (DEV) de producción (PROD).

Es una especificación de configuración; no certifica que el código ya implemente estas reglas. Antes de modificarlo, revisa el framework, la configuración y los clientes existentes. Conserva los nombres indicados y evita duplicar mecanismos de conexión.

Nunca copies valores reales del `.env` a este documento, al repositorio, a respuestas o a registros.

## 2. Variables del archivo compartido por el usuario

| Variable | Qué es y para qué sirve | Dónde usarla |
| --- | --- | --- |
| `APP_ENV` | Selector propio del proyecto. `DEV` usa desarrollo; `PROD` usa producción. Actualmente: `DEV`. | Configuración central del servidor y scripts que implementen explícitamente este selector. |
| `DEV_APP_URL` | URL base de la aplicación en desarrollo. Permite construir enlaces hacia la web, por ejemplo enlaces incluidos en correos. No es la URL de Supabase. | Servidor; puede compartirse como dato público si hace falta. |
| `DEV_SUPABASE_URL` | Dirección del proyecto Supabase de desarrollo. | Cliente Supabase de DEV, en navegador o servidor. |
| `DEV_SUPABASE_PUBLISHABLE_KEY` | Clave pública del proyecto DEV para acceso anónimo o con sesión del usuario, sujeto a permisos y políticas RLS. | Navegador y servidor cuando se actúa como usuario. |
| `DEV_SUPABASE_SECRET_KEY` | Clave privilegiada del proyecto DEV. Permite operaciones administrativas y omite RLS. | Exclusivamente servidor, en operaciones justificadas y autorizadas. |
| `PROD_SUPABASE_URL` | Dirección del proyecto Supabase de producción. | Cliente Supabase de PROD. |
| `PROD_SUPABASE_PUBLISHABLE_KEY` | Clave pública del proyecto PROD, con el mismo propósito que la de DEV. | Navegador y servidor cuando se actúa como usuario. |
| `PROD_SUPABASE_SECRET_KEY` | Clave privilegiada del proyecto PROD. Omite RLS. | Exclusivamente servidor, en operaciones justificadas y autorizadas. |
| `RESEND_API_KEY` | Credencial para enviar correos mediante Resend. Se utilizará una sola clave para DEV y PROD. | Exclusivamente servidor; no lleva prefijo DEV ni PROD. |
| `SUPABASE_ACCESS_TOKEN` | Token de acceso para herramientas de administración de Supabase, como la CLI y la Management API. No inicia sesión a los compradores. | Entorno de desarrollo o automatización administrativa; no es necesario para el funcionamiento normal de la tienda. |
| `SUPABASE_DB_PASSWORD` | Contraseña de PostgreSQL del proyecto al que se conecten las herramientas. No es una API key ni una contraseña de usuario de la tienda. | Conexiones administrativas y migraciones. Verificar de qué proyecto es antes de usarla. |
| `SUPABASE_DEV_PROJECT_REF` | Identificador del proyecto Supabase DEV para seleccionar el destino de scripts o enlazar la CLI. No es una contraseña. | Herramientas de desarrollo; el script debe leerlo y pasarlo explícitamente al comando correspondiente. |

## 3. Selección de ambiente

Implementa una sola configuración central con esta correspondencia:

| Configuración activa | `APP_ENV=DEV` | `APP_ENV=PROD` |
| --- | --- | --- |
| URL de Supabase | `DEV_SUPABASE_URL` | `PROD_SUPABASE_URL` |
| Clave pública | `DEV_SUPABASE_PUBLISHABLE_KEY` | `PROD_SUPABASE_PUBLISHABLE_KEY` |
| Clave privilegiada, si la operación la necesita | `DEV_SUPABASE_SECRET_KEY` | `PROD_SUPABASE_SECRET_KEY` |
| URL de la aplicación | `DEV_APP_URL` | `PROD_APP_URL` |
| Clave de correo | `RESEND_API_KEY` | `RESEND_API_KEY` |

Reglas obligatorias:

1. Aceptar únicamente `DEV` o `PROD`. Si falta el selector o tiene otro valor, detener la inicialización con un error claro.
2. Validar las variables que necesita el ambiente y la funcionalidad activa. Informar los nombres faltantes sin imprimir valores.
3. No recurrir a credenciales PROD si falta una variable DEV, ni al revés. No combinar URL y claves de proyectos distintos.
4. `APP_ENV` es una convención nuestra: escribirla en el `.env` no cambia automáticamente el destino de Supabase, Resend, la CLI ni el hosting. El código debe implementar la selección.
5. No confundir `APP_ENV` con `NODE_ENV`: una compilación optimizada puede estar conectada a DEV.
6. Antes de publicar PROD, definir su URL base. Se propone agregar `PROD_APP_URL`; todavía no figura en las variables proporcionadas. No generar enlaces de producción con `DEV_APP_URL`.

## 4. Acceso a datos y seguridad

- Utilizar la clave pública y la sesión del usuario para las operaciones que deban respetar RLS, incluso cuando se ejecuten desde el servidor.
- Reservar la clave secreta para tareas que realmente necesiten privilegios. Validar identidad, permisos y datos de entrada antes de ejecutarlas. No usarla para solucionar errores de políticas RLS.
- Mantener separado el cliente administrativo del cliente asociado a la sesión del usuario.
- Exponer al navegador únicamente la URL y la clave pública del ambiente activo. Nunca exportar el objeto completo de configuración ni importar módulos con secretos desde componentes del navegador.
- Adaptar la exposición de valores públicos al framework detectado. Estos nombres personalizados no se vuelven públicos automáticamente; no renombrarlos sin revisar sus usos.
- Mantener archivos con secretos fuera de Git. Si se crea un `.env.example`, debe contener únicamente nombres y valores ficticios o vacíos.

## 5. Correos mediante Resend

Usar `RESEND_API_KEY` desde el servidor para los correos que se implementen en GreenBel, por ejemplo notificaciones y solicitudes de financiamiento con una cotización PDF adjunta.

La misma clave se usará en ambos ambientes por decisión del proyecto. `APP_ENV=DEV` no convierte Resend en un simulador: una llamada de envío puede mandar un correo real.

Cuando se autorice la integración futura, limitar cualquier prueba real a destinatarios controlados configurados explícitamente. Mientras dure la pausa no se genera OTP ni se simula una verificación o un envío exitoso. No enviar solicitudes de prueba a clientes ni a la cooperativa. Si se añaden variables para este control, documentarlas como nuevas.

La API key no define por sí sola el remitente ni los destinatarios. Antes de activar el envío, configurar un remitente permitido por Resend, verificar el dominio cuando corresponda y confirmar el correo receptor de la cooperativa. No inventar direcciones. Se incluye `RESEND_FROM_EMAIL` como variable adicional recomendada y vacía mientras dure la pausa.

La integración de Resend en el código no configura automáticamente los correos de Supabase Auth; revisar ese flujo por separado si se necesita.

## 6. Herramientas, migraciones y destino DEV

`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` y `SUPABASE_DEV_PROJECT_REF` tienen un propósito administrativo. No deben utilizarse como credenciales del cliente web ni exigirse para que un comprador navegue o inicie sesión.

Antes de una migración:

1. Confirmar el destino real de la CLI o conexión, no solo el valor de `APP_ENV`.
2. Comprobar que coincide con `SUPABASE_DEV_PROJECT_REF` cuando el trabajo sea para DEV.
3. Confirmar que `SUPABASE_DB_PASSWORD` corresponde a ese proyecto. Su nombre no indica ambiente y no se selecciona automáticamente.
4. Revisar la migración y su impacto antes de aplicarla. Tener credenciales disponibles no constituye autorización para modificar producción.

No ejecutar migraciones al iniciar la tienda. No asumir que la CLI carga el `.env` de la aplicación: revisar cómo el script recibe las variables y cargar únicamente las necesarias, sin mostrarlas.

## 7. Instrucción final para la IA

Revisa el código y conecta estas variables siguiendo este documento. Trabaja en DEV mientras `APP_ENV=DEV`. Centraliza la selección de ambiente, conserva las políticas de acceso y documenta cualquier variable adicional. Si falta una credencial o configuración, indica su nombre y propósito sin inventar valores ni cambiar a PROD. Este documento no autoriza despliegues ni cambios en producción.

## Referencias oficiales

- Claves Supabase: https://supabase.com/docs/guides/getting-started/api-keys
- Seguridad RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Ambientes y credenciales de herramientas: https://supabase.com/docs/guides/deployment/managing-environments
- API de correo Resend: https://resend.com/features/email-api

Documento preparado el 29 de septiembre de 2026, a partir de los nombres de variables proporcionados. No se inspeccionó el repositorio ni el `.env` real.

## Actualización de configuración: pausa de correo

Usar los nombres descritos en esta guía para el `.env` local ignorado por Git. El archivo `.env.example` del paquete original no está presente en este checkout y su eliminación preexistente se conservó. `DEV_EMAIL_DELIVERY_MODE=disabled` y `PROD_EMAIL_DELIVERY_MODE=disabled` expresan la pausa; si faltan, el modo efectivo también es `disabled`. El servidor no instancia un proveedor, no requiere sus credenciales, no genera OTP ni programa envíos. La aplicación arranca sin `RESEND_API_KEY` ni `RESEND_FROM_EMAIL`.

`RESEND_API_KEY` y `RESEND_FROM_EMAIL` quedan vacíos hasta la integración. El remitente futuro debe pertenecer al dominio autorizado de GreenBel; no fijarlo a Outlook. Los destinatarios, el correo de prueba y un secreto HMAC para acceso invitado no figuran en el archivo actual; no exigir esas variables al arrancar. Al implementar cada función, definir y documentar su configuración necesaria. Si el acceso invitado requiere un secreto, configurarlo antes de habilitarlo o usar otro mecanismo seguro; nunca omitir autorización por carecer de una variable. Nunca enviar el objeto de configuración al navegador.

No configurar EmailJS ni Microsoft Graph. No desactivar Supabase Auth ni omitir su seguridad por la pausa de los tres correos de negocio; revisar confirmación y recuperación de Auth por separado. PROD y DEV permanecen separados y la CLI solo trabaja en DEV autorizado.

## Contrato mínimo actualizado al archivo del usuario

El paquete documental describía un `.env.example` con los nombres del archivo compartido y cuatro incorporaciones recomendadas: `PROD_APP_URL`, `DEV_EMAIL_DELIVERY_MODE`, `PROD_EMAIL_DELIVERY_MODE` y `RESEND_FROM_EMAIL`. En este checkout el archivo de ejemplo no está presente; no supone que el usuario ya haya agregado esas variables a su `.env`.

- En DEV validar URL/clave publicable de DEV; requerir secret key solo para operaciones administrativas justificadas. PROD puede quedar vacío mientras no esté activo.
- Durante esta pausa, un modo de correo ausente también debe resolver a disabled; nunca habilitar envío por defecto. Ambos modos explícitos permanecen disabled.
- Resend puede quedar vacío y no debe impedir iniciar la aplicación.
- CLI requiere sus propias credenciales según comando y destino DEV comprobado; no exigirlas al runtime web ni cargarlas en Vercel.
- Variables adicionales de destinatarios, HMAC o pagos no forman parte del mínimo actual. Documentarlas cuando se implemente la función que las necesita; no inventar secretos ni desactivar controles de seguridad.
- La ausencia de variables de pagos no autoriza cobros reales: mantener la integración pendiente o en pruebas según las reglas del proyecto.

## Selector opcional del catálogo durante la transición DEV

`GREENBEL_CATALOG_SOURCE` es una variable **nueva y opcional**, ajena al `.env` original. En DEV, si `DEV_SUPABASE_URL` y `DEV_SUPABASE_PUBLISHABLE_KEY` están configuradas, la ausencia de esta variable usa Supabase por defecto. `mock` conserva los datos ficticios claramente identificados para trabajo aislado; `supabase` fuerza la lectura del catálogo publicado con RLS. Un error de consulta se muestra como error y no cambia silenciosamente a fixtures. En PROD se usa Supabase y `mock` se rechaza. No hace falta definir esta variable para iniciar funciones independientes en DEV.

## Google OAuth autorizado · 13/10/2026

Google complementa Auth correo/contraseña. Las credenciales del proveedor se configuran en **Supabase DEV → Authentication → Providers → Google**; no se añaden al frontend ni se requiere un client secret Google en el `.env` de Next. Se usan las mismas variables DEV de Supabase y `DEV_APP_URL`.

El retorno de Next es `/auth/callback`. En Supabase DEV se añadieron y releyeron los retornos exactos `http://localhost:3000/auth/callback` y `http://localhost:3001/auth/callback`, también sus variantes con `?next=%2Fcheckout`. El servidor conserva el puerto de origen local; otros puertos/hosts requieren una configuración DEV explícita antes de probarlos. El callback configurado para el cliente OAuth de **Google Cloud** es el endpoint `/auth/v1/callback` del proyecto Supabase, distinto del retorno Next.

La confirmación por correo de Supabase continúa habilitada. Google no activa los tres correos de negocio y no requiere Resend. [Sesiones, permisos, pruebas y nombre GreenBel en consentimiento](docs/dev-google-auth.md).

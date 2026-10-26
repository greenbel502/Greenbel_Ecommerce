# Financiamiento con cuenta · modelo 031 · DEV

Decisión vigente del usuario: no pedir un código de correo para financiamiento. Exigir la sesión existente, mejorar la selección del carrito y la plantilla, incluir GreenBel/Cooperativa y adjuntar únicamente el PDF. Aprobación explícita del modelo y migración 031 exclusivamente DEV. Trabajo sobre el checkout `Greenbel_Ecommerce`; no sobre el workspace documental `GreenBel`.

## Comportamiento implementado

1. El visitante puede explorar y conservar su carrito. El formulario de financiamiento muestra el aviso de sesión obligatoria y enlaces de ingreso/registro.
2. Login conserva el retorno permitido `/financiamiento#solicitud`. Se comprobó el recorrido real con una cuenta QA; no se reemplazó Supabase Auth ni su confirmación de correo.
3. La cuenta con perfil activo completa nombre, teléfono opcional, mensaje y consentimiento. El correo es el de Supabase y no se puede sustituir desde el navegador.
4. «Revisar solicitud» prepara una cotización/PDF privados y la solicitud vinculada a esa cuenta. Preparar no envía correo. Precio y cantidad se verifican en servidor; el PDF advierte disponibilidad por confirmar y no reserva inventario.
5. El segundo paso permite revisar/descargar el PDF y confirmar «Enviar solicitud y PDF» al correo principal de Cooperativa configurado en Administración → Contacto.
6. La reclamación de notificación es atómica por solicitud; doble clic/repetición no duplica el correo. Reintento administrativo solo para fallos confirmados de un envío previamente solicitado. Resultado ambiguo no se retransmite automáticamente.

El endpoint antiguo `/api/financiamiento/verificacion` responde 410 y no envía códigos. La base revoca al runtime los RPC antiguos de acceso anónimo/OTP; conserva su historial. No se encolaron solicitudes históricas. La etapa interna `verified` se conserva por compatibilidad y en solicitudes `finance-account-v3` significa identidad de la cuenta comprobada, no un OTP simulado.

Contacto sigue siendo anónimo. Las cotizaciones normales, inventario, cobros, checkout y permisos administrativos de otras áreas conservan su comportamiento.

## Interfaz

CSS modular para el formulario, resumen nativo desplegable con miniatura de 64 px, marca/código, cantidad × precio, importe y total. Cerrado por defecto; no ocupa toda la pantalla con la selección. En revisión usa las líneas congeladas del servidor. Dos pasos visibles y botón principal al final; campo de correo de solo lectura, consentimiento con checkbox proporcionado.

Se revisó Chrome con anchos CSS 390, 820 y 1440; ancho de documento igual al viewport, sin desbordamiento horizontal. Selección abierta/cerrada y teclado Space/Enter/Tab comprobados. Móvil usa una columna y los importes se acomodan bajo el nombre. Son tamaños emulados, no dispositivos físicos.

- [Escritorio](2026-10-25-financing-account-desktop.png)
- [Tablet](2026-10-25-financing-account-tablet.png)
- [Móvil](2026-10-25-financing-account-mobile.png)
- [Mediciones](2026-10-25-financing-account-responsive.json)
- [Visitante sin sesión](2026-10-25-financing-account-guest.png)

## Plantilla y entrega real

Cabecera corporativa con ambos logos originales, saludo al equipo de Cooperativa Concepción R.L., presentación del cliente por GreenBel, datos de contacto, mensaje y referencia del PDF. From es la cuenta Gmail autorizada; Reply-To es el correo de la cuenta solicitante. Texto alternativo y escape de HTML/encabezados preservados.

Los logos son PNG públicos por HTTPS desde `email-assets`, nombres inmutables calculados con SHA-256; no llevan identificadores de clientes ni tokens. Solo el PDF es parte MIME de adjunto. Se conservó la rama MIME de contacto y sus 22 pruebas. El bucket DEV contiene únicamente las dos artes públicas, límite 1 MB/tipo PNG, sin permisos de escritura de navegador; carga anónima rechazada.

La prueba final se envió al correo de prueba propio que el usuario había configurado como principal de Cooperativa. No se contactó a una cooperativa real. Se recibió la solicitud `7fc4e1eb-75b4-4711-b581-c5e65c8143fd`; Gmail mostró un único adjunto PDF y Reply-To de la cuenta QA. Descarga desde Gmail: SHA-256 `32faeeea8939aa671f313648c0ac5441ce23fe67bacf4f0649008936e906cff1`, idéntico al PDF privado de la solicitud. PDF renderizado e inspeccionado: 2 × Q83.25 = Q166.50.

Gmail clasificó inicialmente esa prueba como Spam y eliminó temporalmente los src de imágenes al mostrarla. Se marcó exclusivamente el mensaje de prueba como «No es spam»; al abrirlo en Recibidos ambos logos cargaron: GreenBel 552×104 y Cooperativa 8000×2863. La entrega no garantiza que otros destinatarios lo reciban en Recibidos. No se cambiaron OAuth/scopes ni configuraciones globales antispam.

- [Correo final recibido](2026-10-25-financing-account-mail.png)
- [Comprobación de recepción y adjunto](2026-10-25-financing-account-receipt.json)
- [Publicación/verificación de recursos](2026-10-25-financing-public-brand-assets.json)
- [Escritura anónima denegada](2026-10-25-financing-assets-write-denied.json)

## Archivos principales

| Área | Archivos |
| --- | --- |
| Datos y seguridad | `supabase/migrations/20261025003100_financing_account.sql` |
| Identidad, propiedad y entrega | `src/lib/financing/workflow.ts`, `http.ts`; rutas `api/financiamiento/{borradores,estado,pdf,enviar,verificacion}` |
| PDF con identidad de la sesión | `src/app/api/cotizaciones/route.ts` (solo propósito financing) |
| Interfaz pública | `src/presentation/components/financing-form.tsx`, `.module.css`; `src/app/financiamiento/page.tsx`; retirada del CSS anterior de financiamiento en `globals.css` |
| Retorno y aviso de ingreso | `src/lib/supabase/auth-navigation.ts`, `cuenta/{auth-forms,actions,ingresar/page,registro/page}`, `auth/{callback,confirm}/route.ts` |
| Correo | `src/lib/gmail/{financing-message,financing-assets,mime}.ts` |
| Administración | `src/app/admin/financiamiento/page.tsx` y reintento existente adaptado al nuevo claim |
| Evidencia y utilidades DEV | `scripts/dev-financing-account-{qa,sql-qa,cleanup}.mjs`, `dev-publish-mail-assets.mjs`; `tests/{financing-message,gmail,auth-navigation,build-pending-quote}.test.mjs`, `financing-workflow.sql` |

## Verificaciones ejecutadas

| Verificación | Resultado / evidencia |
| --- | --- |
| Migración 031 | Rollback DDL, dry-run, aplicación DEV y paridad local/remota: `financing-account-{rollback,dry-run,apply,migration-list}.log` de esta carpeta |
| Unitarias | **33 PASS**, incluye Gmail/contacto, MIME, escape, Reply-To, navegación segura y PDF de financiamiento: [log](2026-10-25-financing-account-unit.log) |
| HTTP DEV | **22 PASS**: anónimo/otra cuenta denegados, correo del cliente no sustituible, confirmación obligatoria, OTP retirado, PDF íntegro y envío real idempotente: [resultados](2026-10-25-financing-account-http.json) |
| SQL DEV | **24 PASS con rollback**: permisos privados, propietario inmutable, cuenta inactiva, concurrencia, fallo/reintento, destinatario cambiado, resultado ambiguo e históricos: [log](2026-10-25-financing-account-sql.log) |
| TypeScript / ESLint | Exit 0, logs `financing-account-types.log` y `financing-account-lint.log` |
| Build | Snapshot temporal aislado, exit 0; no se reemplazó `.next` ni se detuvo el servidor del usuario: [log](2026-10-25-financing-account-build.log) |
| Empaquetado | Ambos PNG presentes en el tracing de enviar/reintentar para no perder el archivo de Cooperativa al empaquetar: [resultado](2026-10-25-financing-account-tracing.json) |
| Navegador | Invitado → aviso/login real de cuenta QA → retorno a Financiamiento con dos unidades conservadas; preparación/revisión sin envío automático; cierre de la cuenta QA al terminar |
| Recepción real | Logos cargados fuera de Spam, único PDF, Reply-To y hash del adjunto comprobados |

La allowlist de retornos de Supabase DEV tenía solo los callback anteriores. Se añadieron exactamente dos URL de localhost:3000: `/auth/callback?next=%2Ffinanciamiento%23solicitud` y `/auth/confirm?next=%2Ffinanciamiento%23solicitud`. Se releyó la configuración: todos los retornos previos y demás ajustes Auth quedaron iguales; no se añadieron dominios, comodines ni scopes. [Evidencia](2026-10-25-financing-account-auth-redirects.json). El recorrido real se probó con contraseña; el retorno de Google/confirmación nueva cuenta se verificó por configuración y unitarias, sin un nuevo consentimiento Google ni alta real desde navegador.

## Limpieza y continuidad

Se retiraron solo tres solicitudes QA, dos cotizaciones con sus PDF privados y dos cuentas temporales propias. Respaldo privado fuera del repo; simulación rollback antes de aplicar, una transacción para los registros, suspensión de los cuatro guards estrictamente necesarios y reactivación antes del commit. Hash de todos los demás datos public/greenbel_private intacto. Los logos públicos son recursos de la funcionalidad y se conservaron. No se tocaron cuentas reales, carrito del usuario, correo principal configurado ni autorización Gmail.

Evidencias: [simulación](2026-10-25-financing-account-cleanup-simulation.json), [aplicación](2026-10-25-financing-account-cleanup-applied.json). La utilidad está fijada a los IDs de esta prueba; no es un purgador genérico.

## Pendiente antes de producción

- No hubo commit, push, despliegue ni cambios PROD. No se probó Vercel ni dispositivos físicos/otros clientes de correo. El principal de Cooperativa sigue siendo el correo de prueba que el usuario configuró; sustituirlo por el oficial antes de operación comercial.
- Aprobar y provisionar por separado las migraciones/configuración del entorno PROD y la autorización Gmail; Google OAuth sigue sujeto a su modo Testing y caducidad/requisitos de publicación existentes. No ampliar scopes.
- Provisionar `email-assets` en PROD con los mismos dos PNG y nombres de hash; nunca usar URLs DEV en PROD. Confirmar ambos logos accesibles antes de habilitar el envío. Los PNG locales deben formar parte del tracing del servidor para calcular sus nombres.
- Permitir los dos retornos exactos anteriores con el dominio de producción, por separado y con autorización PROD, antes de probar ingreso Google/confirmación con retorno a financiamiento.
- `FINANCING_OTP_HMAC_KEY` deja de ser necesaria para este flujo; se retiró del ejemplo. No se requieren nuevas variables del navegador. Contacto continúa usando `GMAIL_NOTIFICATION_EMAIL`; financiamiento usa el principal de Cooperativa.
- Una solicitud de información no aprueba crédito ni reserva existencias. Disponibilidad y entrega siguen por confirmar.

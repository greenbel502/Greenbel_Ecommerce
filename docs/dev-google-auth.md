# Acceso con Google en GreenBel DEV

Actualizado: 13/10/2026. Proyecto de código activo: `/Users/diederichsolis/Desktop/Greenbel_Ecommerce`. No se modificó PROD ni se desplegó. Google complementa el acceso existente con correo y contraseña.

## Probar personalmente

1. Desde esta carpeta ejecuta `npm run dev`. Abre el puerto que indique Next; los retornos Google locales de **localhost:3000 y localhost:3001** están permitidos en Supabase DEV. No ejecutes dos servidores sobre la misma carpeta `.next`.
2. Abre `/cuenta/ingresar` o `/cuenta/registro` y pulsa **Continuar con Google**, sin llenar los campos de correo/contraseña del formulario local.
3. Selecciona una cuenta que controles y revisa el consentimiento de Google. Si la aplicación OAuth está en modo Testing, la cuenta debe estar autorizada como usuario de prueba en Google Cloud.
4. Tras aceptar personalmente el consentimiento, debes regresar a `/cuenta`, ver tu correo y poder cerrar sesión. Repite el acceso: debe usar la misma cuenta, sin duplicar perfil ni pedidos.
5. Desde un carrito, abre checkout y continúa con Google: debes regresar a `/checkout` en el mismo puerto, conservando la selección local. Los datos de facturación y teléfono siguen siendo requeridos por checkout; no se inventan a partir del perfil Google.
6. Como cliente, no debe aparecer el panel administrativo ni ser posible ejecutar sus operaciones. Un administrador solo conserva ese acceso si su rol está asignado explícitamente en la base DEV. Para habilitarlo sigue [la guía de administrador](dev-admin-access.md), usando el UUID de Authentication → Users de la cuenta que acabas de crear con Google.
7. Cancelar, reutilizar un código o abrir un retorno sin su cookie PKCE debe mostrar un error de acceso, sin declarar una sesión exitosa. Un enlace de checkout conserva ese destino para el reintento.

No compartas URLs con códigos OAuth, cookies, tokens ni contraseñas al reportar errores. Comparte únicamente el mensaje visible.

## Cómo encaja con la base existente

- Supabase Auth gestiona la identidad Google y emite la misma clase de sesión autenticada que para correo/contraseña. La aplicación usa PKCE en servidor y cookies HttpOnly/SameSite=Lax; verifica la identidad con Auth, además del intercambio del código.
- En el primer alta de `auth.users`, el trigger real `greenbel_auth_user_created` llama a `greenbel_private.handle_new_auth_user()`. Inserta `profiles` con el mismo UUID y `user_roles` con **customer**, independientemente del proveedor o de los metadatos del usuario.
- El callback consulta el perfil y rol bajo la sesión del cliente y exige perfil activo. No crea roles en el navegador, no usa claves administrativas para iniciar sesión y no reactiva usuarios. Las operaciones de pedidos/documentos mantienen las reglas actuales de propiedad y RLS por UUID.
- Supabase puede vincular automáticamente identidades que comparten un correo verificado según sus reglas. GreenBel no fusiona cuentas, pedidos ni roles manualmente por coincidencia de correo. La vinculación real de una cuenta previa de correo/contraseña con Google sigue **NO EJECUTADA** hasta probarla personalmente con una cuenta controlada.
- No fue necesaria una migración. El trigger actual ya era independiente del proveedor. Las credenciales OAuth de Google permanecen en Supabase, sin variables Google nuevas en el frontend o `.env` del runtime.

## Por qué Google muestra un dominio de Supabase

La captura del usuario del 13/10 muestra la pantalla de consentimiento de Google usando el dominio técnico del proyecto DEV. **No demuestra por sí sola el retorno exitoso ni un fallo de sesión.** Según Google, el nombre y logo requieren verificación de marca; sin ella puede mostrarse el dominio. No se inspeccionó la configuración de Branding en Google Cloud, por lo que su estado concreto queda pendiente de revisión.

Para que aparezca **GreenBel**, revisar el proyecto que contiene el cliente OAuth en **Google Auth Platform → Branding** (nombre/logo/datos públicos) y **Verification Center**. Cuando exista el dominio y contenido público aprobado, comprobar los requisitos de Google y completar la verificación. Cambiar el nombre del proyecto Supabase o el título del login no cambia esta pantalla de Google.

Un dominio propio de Auth también permite presentar una URL de la marca. Requiere dominio/DNS y la capacidad correspondiente en Supabase; no se compró, configuró ni habilitó ese servicio. El callback del cliente OAuth en Google Cloud continúa siendo el endpoint Auth de Supabase, mientras que `/auth/callback` es el retorno permitido hacia Next.js: son dos puntos diferentes del flujo.

Fuentes: [Google: gestionar marca OAuth](https://support.google.com/cloud/answer/15549049?hl=en-AU), [Supabase: Google y PKCE](https://supabase.com/docs/guides/auth/social-login/auth-google), [Supabase: vinculación de identidades](https://supabase.com/docs/guides/auth/auth-identity-linking), [Supabase: dominios propios](https://supabase.com/docs/guides/platform/custom-domains).

## Evidencia de esta iteración

| Comprobación | Resultado |
| --- | --- |
| TypeScript, ESLint dirigido y diff sin errores | **PASS LOCAL** |
| Protección de destinos y orígenes | **PASS LOCAL 4/4**, `node --test tests/auth-navigation.test.mjs` |
| Build optimizado aislado y HTTP de callback con Auth ficticio local | **PASS LOCAL 15/15**, `node scripts/qa-google-auth.mjs --production` |
| Casos HTTP locales | PKCE, código ausente/repetido/sin verificador, cancelación, checkout, destino externo, perfil inactivo/ausente, rol ausente, fallo DB, metadata admin ignorada y operación admin HTTP 403; rol DB previo conservado |
| Vista Chrome real a 1440 y 390 CSS px | **PASS LOCAL**, sin desbordamiento; controles visibles, contraseña ocultable y Google independiente de validación del formulario de contraseña; guía flotante no superpuesta |
| Google habilitado, credenciales del proveedor presentes, confirmación de correo habilitada y trigger/RLS reales | **PASS DEV**, lectura remota sin exponer valores |
| Alta ficticia por Admin API y controles de rol/perfil | **PASS DEV**, `node --env-file=.env scripts/dev-google-auth-check.mjs`; metadata admin no concede admin, cliente no modifica rol/active. Solo se retiró la cuenta efímera creada por esa ejecución |
| Acción real → Supabase → autorización Google | **PASS DEV** hasta redirección a Google, PKCE y callback DEV correctos; puerto 3001/checkout conservados |
| Consentimiento de Google | **Pantalla observada en captura del usuario**; todavía no se comprobó la aceptación y regreso |
| Primer acceso Google, reingreso, vinculación y checkout con consentimiento real | **NO EJECUTADO end-to-end**; requiere completar personalmente el consentimiento |
| Nombre/logo GreenBel en consentimiento | **PENDIENTE** de revisión de Branding y verificación Google; dominio propio no configurado |
| Registro/recuperación por correo Auth | **APLAZADO** por decisión del usuario hasta SMTP; confirmación sigue habilitada |

Los tres correos de negocio siguen deshabilitados. Este acceso no activa contacto, cooperativa ni OTP de financiamiento.

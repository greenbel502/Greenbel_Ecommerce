# Probar Mi cuenta y los datos para comprar

13/10/2026 · Solo DEV. [Migración 021 aplicada y registro para futura promoción](migrations/021-customer-profile.md).

## Prueba personal

1. Inicia el proyecto con `npm run dev` desde `Greenbel_Ecommerce` y abre el puerto mostrado por Next (durante la revisión: `http://localhost:3001`). Ingresa normalmente con Google o correo/contraseña y abre `/cuenta`.
2. Debes ver el saludo, foto de Google o iniciales, formulario **Mis datos** y enlaces a pedidos/carrito. El panel administrativo aparece únicamente para un rol autorizado en base. Se retiró el texto técnico sobre Supabase de esta vista.
3. Completa **Nombre completo**, teléfono y dirección preferida. Teléfono y dirección pueden quedar vacíos en el perfil; checkout mantiene sus requisitos. Pulsa **Guardar mis datos**, espera la confirmación y recarga: deben persistir. Si otra pestaña cambió el perfil, la página pide actualizar antes de sobrescribirlo.
4. En **Cambiar foto**, selecciona JPG, PNG o WebP de hasta **2 MB**. Debe aparecer al finalizar y después de recargar. El servidor la convierte a WebP de 512×512 y retira los metadatos. Al sustituirla se retira la anterior. **Quitar foto subida** vuelve a la foto Google disponible o a las iniciales. Ninguna foto cargada tiene una URL pública permanente.
5. Añade un artículo **PRUEBA DEV** al carrito y abre checkout. **Usar mis datos guardados** completa los campos vacíos de teléfono, nombre completo/destinatario y dirección. Revisa nombre/apellido para CF o titular/NIT cuando corresponda; no se deducen automáticamente. Selecciona servicio y zona y revisa la tarifa del servidor. La dirección guardada no garantiza cobertura.
6. Recuperar una revisión previamente guardada mantiene los datos de esa revisión; cambiar el perfil no cambia pedidos o documentos históricos. No hay copia automática al confirmar ni cambio de precios por editar el perfil.
7. Revisa login, perfil y checkout en móvil. Login muestra fondo agrícola y texto de compra; su footer compacto conserva logo/enlaces legales, sin barra inferior sobrante ni franja vacía. Los textos y la tarjeta entran suavemente y la foto se mueve una vez; al activar movimiento reducido se muestran directamente. Las páginas públicas conservan el footer completo.
8. En la misma página, pulsa **Contraseña** en sus acciones para mostrar **Acceso con correo y contraseña**; inicialmente está oculta al entrar en `/cuenta`. Pulsa de nuevo para ocultarla (esto vacía los campos de contraseña, conservando la edición del perfil). El correo mostrado es tu identificador de ingreso. Introduce una contraseña de 8–128 caracteres y repítela exactamente. Cada ojito muestra/oculta solo su campo; valores distintos bloquean el formulario y también son rechazados en servidor. Tras **Guardar contraseña**, espera la confirmación; los campos quedan vacíos y permaneces en Mi cuenta. Un enlace directo a `/cuenta#seguridad`, incluida la recuperación, la abre automáticamente.
9. Cierra sesión e ingresa usando ese correo y la contraseña que guardaste. Para una cuenta creada con Google, esto añade acceso con contraseña a la **misma cuenta**, sin cambiar la contraseña de Google ni desconectarlo. No vuelvas a registrarte para habilitarlo. [Referencia oficial](https://supabase.com/docs/guides/auth/auth-identity-linking). La ruta anterior `/cuenta/restablecer` conserva compatibilidad y lleva a la sección de configuración.

## Verificación técnica ejecutada

### Contraseña en la cuenta

**Ajuste 15/10/2026:** sección oculta inicialmente y botón para mostrar/ocultar; enlaces de recuperación/directos la abren. **PASS LOCAL 17 casos** con Auth ficticio aislado, incluido teclado, foco, historial, edición del perfil conservada, vaciado al cerrar y 1440/390 px. Se corrigió el indicador global que se activaba por cambios de fragmento y se revisaron capturas estables. No se repitió la suite remota ni se cambiaron permisos/acciones de contraseña; los resultados DEV siguientes corresponden al 13/10/2026.

**PASS DEV:** 13 casos de guardado/ingreso, primera contraseña de una cuenta confirmada sin contraseña, invariantes de perfil/rol, validación en servidor, valores repetidos y aislamiento ante UUID/correo ajenos, inactivos y sesión ausente. **PASS LOCAL:** 9 casos de interfaz, validación antes del envío, ojos independientes, enlace interno, textos, registro sin envío y 1440/390 px. Se cerraron 19 casos y los tres restantes mediante continuación dirigida; se revisaron las dos capturas. TypeScript, ESLint dirigido y diff: **PASS**.

El arnés `scripts/dev-account-password-qa.mjs` necesita las mismas variables DEV y Playwright del ejemplo de abajo, además del acceso de herramientas para leer configuración Auth. Se ejecuta contra `http://localhost:3000`; `--remaining` después de la URL prepara cuentas nuevas y verifica solo sesión ausente, campos del registro y errores JS. Crea/retira únicamente sus usuarios ficticios, exige confirmación de correo habilitada y notificaciones de cambio de contraseña deshabilitadas, sin modificar esos controles ni enviar mensajes. Una sesión de fixture confirmada sin contraseña se obtiene mediante Admin API sin envío; no representa un consentimiento Google ni recuperación por correo real.

**NO EJECUTADO:** reingreso con contraseña de la cuenta Google personal y recepción/recuperación por SMTP. El código conserva los controles de reautenticación del proveedor y traduce sus errores; esa rama no se ejecutó porque el requisito no está activado en DEV. No se creó/aplicó migración. No se guardan contraseñas en perfiles ni se cambia el correo de la cuenta.

### Navbar autenticado

Una vez ingreses, el navbar muestra foto/iniciales, nombre del perfil y correo. En móvil la barra muestra el avatar; al pulsarlo aparecen los datos completos y enlaces a cuenta/pedidos/cerrar sesión. Solo los roles administrativos asignados en base ven el enlace operativo correspondiente. Guardar nombre o foto actualiza la barra sin recargar.

**PASS:** 14 comprobaciones DEV y 11 locales de esta interfaz, incluidas sesión real de cuentas ficticias, permisos, aislamiento, cierre, actualización y seis anchos entre 320 y 1440 px. La invalidación y recuperación del menú también se verificó con una respuesta local ficticia; no equivale a una prueba de consentimiento Google. No requirió otra migración.

El arnés está en `scripts/dev-navbar-account-qa.mjs` y usa los mismos requisitos y límites DEV del script de perfil. Ejecutar con `GREENBEL_QA_PLAYWRIGHT_MODULE` y la URL local como en el ejemplo de abajo. No usa la sesión personal del navegador ni envía correos.

### Perfil y compras

- **PASS DEV:** 28 casos sobre persistencia desde UI, RLS A/B, roles no tomados de metadata, formulario obsoleto, Storage privado, foto propia/ajena/anónima, límite real de 2 MB y stream sin Content-Length, formatos inválidos, reprocesado, reemplazo, perfil inactivo, retiro repetido y copia a checkout sin sustituir campos ya editados.
- **PASS LOCAL:** cuatro revisiones visuales de perfil/login a 1440 y 390 CSS px; tres comprobaciones adicionales sobre recuperación con respuesta HTTP ficticia, formulario checkout a 390 px y footer en ventanas altas. No se confirma una compra a partir del fixture de revisión.
- **PASS LOCAL:** validación de perfil/origen/avatar 3/3, TypeScript, ESLint dirigido, `git diff --check`, build optimizado aislado y regresión de callback Google con Auth ficticio local 15/15. Después de los parches Next 15.5.27/sharp 0.35.5 se repitió justificadamente la suite completa de perfil **32/32 PASS** y el build/callback 15/15. Las pruebas OAuth locales no sustituyen el consentimiento real. [Dependencias y avisos de herramientas pendientes](dev-dependency-security-20261013.md).
- **NO EJECUTADO:** carga de foto/cambio de perfil de la cuenta personal del usuario; QA utilizó exclusivamente cuentas ficticias efímeras. Confirmación de compra completa a 390 px, consentimiento/reingreso/vinculación real Google y registro/recuperación por correo Auth no se atribuyen a esta suite.
- Los tres correos de negocio siguen pausados y la confirmación Auth habilitada. SMTP, marca OAuth y PROD mantienen sus pendientes separados.

## Reproducir QA de forma autorizada en DEV

`scripts/dev-customer-profile-qa.mjs` comprueba selector/ref/enlace, usa el servidor local conectado a DEV y crea dos usuarios ficticios sin enviar correo. Solo retira esas cuentas/avatares al terminar. Necesita las credenciales DEV de herramientas y Playwright disponible para QA; Playwright no es dependencia del runtime de la tienda.

```bash
GREENBEL_QA_PLAYWRIGHT_MODULE=/ruta/al/modulo/playwright/index.mjs \
node --env-file=.env scripts/dev-customer-profile-qa.mjs http://localhost:3001

node --test tests/customer-profile.test.mjs
```

En otro sistema, `GREENBEL_QA_CHROME` permite seleccionar el ejecutable Chrome de prueba. `--remaining` después de la URL ejecuta solo checkout/visual/inactivos/retiro, preparando sus propias cuentas; se usó para completar los casos no alcanzados sin repetir los 21 ya cerrados. No utiliza ni modifica la sesión personal del navegador.

Las lecturas privadas del avatar usan `private, no-store` y una lectura fresca de Storage; se guardan rutas nuevas al reemplazar. [Referencia Supabase sobre caché e invalidación](https://supabase.com/docs/guides/storage/cdn/smart-cdn).

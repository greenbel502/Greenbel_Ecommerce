# GreenBel Ecommerce

Aplicación Next.js 15 y TypeScript construida sobre el mockup GreenBel. La interfaz conserva su identidad visual. Las migraciones 001–021 están aplicadas en Supabase **DEV**; el estado funcional comprobado de cada recorrido está en [GREENBEL_AVANCE.md](GREENBEL_AVANCE.md).

## Arranque local

```bash
cd /Users/diederichsolis/Desktop/Greenbel_Ecommerce
npm ci
npm run dev
```

Esta es la copia comprobada en `localhost:3000` el 13/10/2026. Para verificar el 404 en el servidor que realmente está abierto, ejecuta `node scripts/qa-live-not-found.mjs`: comprueba la URL reportada `/financiamientosds` y otras dos rutas inexistentes. No usa Supabase ni credenciales.

Abre `http://localhost:3000`. Define `APP_ENV=DEV` en tu archivo `.env` ignorado por Git. Si `DEV_SUPABASE_URL` y `DEV_SUPABASE_PUBLISHABLE_KEY` están configuradas, el catálogo usa Supabase DEV por defecto. `GREENBEL_CATALOG_SOURCE=mock` fuerza fichas y precios **ficticios** para trabajo aislado; esa vista no necesita credenciales de Resend ni de la CLI. Consulta [GREENBEL_VARIABLES_DE_ENTORNO.md](GREENBEL_VARIABLES_DE_ENTORNO.md) para los nombres del `.env` compartido; no copies sus valores al repositorio.

Para conectar Auth y Supabase DEV, se usan `DEV_SUPABASE_URL`, `DEV_SUPABASE_PUBLISHABLE_KEY` y `DEV_APP_URL`. Las operaciones privadas de servidor (cotizaciones, formularios persistidos y panel) requieren además `DEV_SUPABASE_SECRET_KEY`, exigida al usarlas. `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` y `SUPABASE_DEV_PROJECT_REF` pertenecen a herramientas administrativas y no son requisitos del runtime web. Ninguna variable PROD se usa como respaldo de DEV.

Para disponer de una cuenta de administración sin publicar contraseñas, sigue el [procedimiento de primer administrador DEV](docs/dev-admin-access.md). La [guía de prueba manual](docs/dev-manual-test.md) indica rutas y recorridos. Separa esa provisión manual del registro público de Supabase Auth, que sigue pendiente de SMTP para una prueba con confirmación real.

El login incluye **Continuar con Google** y una nueva vista adaptable. Usa el puerto que indique Next: los callbacks DEV de `localhost:3000` y `localhost:3001` están permitidos. [Cómo probar Google, permisos y marca pendiente](docs/dev-google-auth.md). El primer acceso recibe `customer`; el consentimiento/regreso real y la marca en Google se registran por separado de las verificaciones locales.

`/cuenta` permite guardar nombre, teléfono, dirección preferida y una foto privada, con foto Google/iniciales como alternativa. Checkout permite copiar los datos guardados a campos vacíos. [Cómo probar el perfil](docs/dev-customer-profile.md) y [registro de 021 para futura promoción](docs/migrations/021-customer-profile.md). El merge de código no aplica automáticamente el SQL en Supabase; PROD no se modificó.

El navbar autenticado muestra foto/iniciales, nombre y correo, con menú de cuenta, pedidos y cierre de sesión. En móvil la identidad completa aparece dentro del menú; los cambios de perfil actualizan la barra sin recargar. La consulta es privada y los enlaces administrativos siguen el rol de la base.

`GREENBEL_CATALOG_SOURCE=supabase` también habilita explícitamente la lectura pública con RLS. Si la consulta falla, la aplicación no sustituye silenciosamente los datos por el mockup. En PROD se exige Supabase. Los productos de prueba existentes en DEV están marcados como ficticios; no representan el catálogo comercial.

## Recorridos preparados en código

- `/productos` y `/productos/[slug]`: catálogo, filtros, ficha, galería privada, especificaciones, incluidos, relaciones verificadas de equipo/repuesto, capacitaciones asociadas, disponibilidad pública acotada y reseñas visibles. Producto sin precio: **«Precio próximamente»**. Reseñar exige cuenta y línea de pedido entregada; la publicación pasa por moderación.
- `/carrito`: selección persistida de IDs y cantidades, actualizada desde catálogo al restaurarse. Puede emitir cotización PDF sin cuenta con nombre y correo opcional cuando el producto real tiene precio y disponibilidad verificada. El servidor recalcula desde catálogo/inventario; el PDF se guarda y se descarga con token privado limitado. El carrito y la cotización no reservan.
- `/contacto`: valida y registra la consulta con idempotencia y límite por origen cuando SQL 003 está aplicada. La pantalla solo afirma «registrada» tras confirmación del servidor.
- `/financiamiento`: vincula una cotización emitida y consentimiento a un **borrador** privado. No verifica correo ni envía la solicitud a la cooperativa.
- `/cuenta/ingresar`, `/cuenta/registro`, `/cuenta/recuperar`, `/cuenta/restablecer` y `/cuenta`: Supabase Auth correo/contraseña y sesión protegida. `/cuenta/pedidos` y su detalle consultan únicamente pedidos propios, separan pedido, entrega y pago de prueba, y ofrecen cancelación directa de borrador o confirmado antes de preparación cuando la base la permite; después registran una solicitud de revisión. Inicio de sesión y aislamiento de dos usuarios se probaron en DEV; recuperación y correo propio de Auth siguen sin prueba.
- `/capacitaciones`: vídeos públicos publicados desde Supabase; en mock DEV muestra estado vacío. El administrador puede mantener título, descripción, vídeo HTTPS, relaciones y portada en Storage privado; una ruta controlada muestra la portada al público solo si la capacitación está publicada. `/admin/catalogo`, `/admin/inventario`, `/admin/capacitaciones`, `/admin/resenas`, `/admin/consultas`, `/admin/cotizaciones`, `/admin/financiamiento`, `/admin/entregas`, `/admin/ventas` y `/admin/usuarios` exigen rol autorizado según la operación. La gestión de usuarios cambia rol y acceso operativo con auditoría; Supabase Auth conserva contraseñas y confirmación de correo. Entregas y checkout usan configuración **PRUEBA DEV** ficticia editable; ventas separa preparación, entrega, cobro y depósito. Personal activo registra casos manuales; solo administrador activo registra una **solicitud** de reembolso sin ejecución. Cotizaciones/PDF y consultas tienen acceso protegido; 009 corrigió la lectura administrativa de contactos.
- `/api/admin/product-images`: la carga exige administrador, origen permitido, formato de imagen comprobado por firma y un límite del cuerpo medido en el flujo recibido antes de analizar el formulario multipart. La prueba local del límite cubre el caso sin `Content-Length` y el encabezado falso.
- `/checkout`: revisa precio, IVA incluido, entrega y medio desde Supabase DEV; la aceptación crea pedido y reserva en una transacción con reintentos seguros. La cobertura de transporte manual conserva el total pendiente hasta propuesta aceptada y nueva revisión. Los pagos online de prueba se procesan exclusivamente con `scripts/dev-simulated-payment.mjs` desde servidor DEV; el navegador no puede declarar éxito. El antiguo flujo de tarjeta simulada se conserva en `docs/legacy-mock/`, fuera de las rutas activas.

Los precios de producto se expresan en **GTQ (Q) e incluyen IVA**. No se suma IVA otra vez. CF requiere nombre, apellido y teléfono; facturación con NIT requiere NIT, titular, nombre completo, teléfono y correo opcional. La factura la emite GreenBel por su proceso interno. La cotización con transporte pendiente no presenta Q0 ni un total final inventado.

## Correos, pagos y operaciones

El envío de contacto, financiamiento y código de verificación de financiamiento permanece **deshabilitado** aunque exista una clave Resend. Hay plantillas de texto puras en `src/lib/server/business-email-templates.ts`, sin conexión a ninguna ruta. No hay EmailJS, Graph, OTP ficticio, confirmaciones de envío ni cola que despache borradores acumulados. Supabase Auth es independiente de esta pausa.

Los pagos siguen siendo **de prueba**: 011 agrega un simulador controlado por servidor solo DEV, sin llamada a pasarela ni cobro real; 012 documenta cobros presenciales/COD y depósito externo por separado. La corrección 020 exige pago simulado confirmado y stock consumido **antes de preparar** un pedido online; una reserva vigente sola no basta. Contra entrega conserva la preparación con reserva válida y el cobro separado. Recurrente no está confirmada. Las tarifas, cobertura, horarios y plazos cargados son exclusivamente ficticios, etiquetados **PRUEBA DEV** y editables. Los reembolsos se registran como solicitudes/revisión, nunca como dinero devuelto.

## Modelo, migraciones y verificación

El [modelo revisado](GREENBEL_MODELO_PARA_VALIDACION.md) fue aprobado para DEV. La secuencia aplicada está en `supabase/migrations/20260929000100_*.sql` hasta `20260929002000_*.sql`. La antigua `001_initial_schema.sql`, incompatible con las reglas actuales, se conservó en `supabase/legacy/`. Los bloques iniciales tienen notas de revisión en `supabase/MIGRATION_20260929_*_REVIEW.md`.

**001–020 constan en el historial de Supabase DEV.** Se creó `supabase/config.toml` y el enlace local de CLI coincide con la URL y referencia DEV. 009 corrigió consultas, 010 abrió checkout transaccional, 011 añadió simulador online DEV, 012 operación manual, 013 cancelación directa de confirmado, 014 y 015 reforzaron las reseñas, 017 añadió gestión de roles y acceso operativo con auditoría, 018 creó portadas privadas de capacitaciones y 019 corrigió la validación de UUID de su ruta. La regla 016 de preparación online se sustituyó por 020: exige pago confirmado antes de preparar o avanzar. No ejecutar `db reset`, pegar SQL en Dashboard para saltar el historial ni apuntar a PROD.

El preflight local de solo lectura ayuda a comprobar el selector, la URL y el archivo de enlace sin mostrar valores. **No verifica la base remota ni que la contraseña corresponda a DEV**:

```bash
node --env-file=.env scripts/dev-target-preflight.mjs
node --env-file=.env scripts/dev-supabase-cli.mjs version
node --env-file=.env scripts/dev-supabase-cli.mjs list
node --env-file=.env scripts/dev-supabase-cli.mjs dry-run
```

El wrapper descubre la CLI instalada o cacheada, deshabilita su telemetría,
transmite solo las credenciales de herramientas necesarias y exige que el
enlace real coincida con DEV para los dos comandos remotos. En esta máquina
usó la CLI 2.117.0. `list` y `dry-run` requieren conectividad a DEV; no escriben
en la base. Antes de cada migración 009–020 se verificaron destino/historial y un dry-run que enumeraba solo el archivo correspondiente.

```bash
node --test tests/*.mjs
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

Las pruebas directas en DEV son explícitas y crean datos ficticios identificados. `scripts/verify-dev-auth-rls.mjs`, `dev-catalog-inventory-check.mjs`, `verify-dev-order-rls.mjs`, `dev-storage-forms-check.mjs`, `dev-checkout-smoke.mjs`, `dev-online-payment-qa.mjs`, `dev-admin-http-check.mjs`, `dev-admin-users-qa.mjs`, `dev-paid-online-preparation-qa.mjs`, `dev-admin-spec-image-qa.mjs` y `dev-training-cover-qa.mjs` cubren Auth, permisos, catálogo, PDF, formularios, compra, inventario, pagos simulados, preparación, usuarios e imágenes. Las suites HTTP necesitan `npm run dev` contra DEV en `DEV_APP_URL`. Ejecuta cada script con `node --env-file=.env` y su bandera explícita indicada en el archivo. Algunos dejan pedidos/productos ficticios auditables y desactivan las cuentas Auth creadas. El registro público de Auth quedó sin prueba end-to-end por límite de envío 429; por decisión del usuario no se configurará SMTP de Auth hasta tener dominio y Resend. No se desactiva la confirmación. Checkout a 390 CSS px exactos tampoco se pudo ejecutar por límite del navegador de prueba; a 487 CSS px pasó. Esto es independiente de la pausa de correos de negocio. Para la matriz PASS/FAIL/NO EJECUTADO y el siguiente paso, consulta [GREENBEL_AVANCE.md](GREENBEL_AVANCE.md).

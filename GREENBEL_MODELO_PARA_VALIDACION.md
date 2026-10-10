# GreenBel — modelo de datos para validación

**Estado: APROBADO por el usuario el 29/09/2026 para crear y aplicar migraciones solo en DEV, tras comprobar el esquema real y el destino.** Revisión sobre `main` en `e42998d`, las etapas 1 y 2, el complemento de correos, la etapa 3 propuesta y el código actual. Este archivo no es una migración ni acredita por sí solo el estado de la base DEV. Las decisiones comerciales señaladas en la sección 7 siguen pendientes.

## 1. Alcance y decisiones de diseño propuestas

- PostgreSQL de Supabase, Auth con correo y contraseña, proyectos DEV y PROD separados. `auth.users` conserva credenciales; una cuenta comercial se relaciona por UUID.
- Una fila por SKU vendible, incluidas piezas y repuestos. Una categoría principal por producto; subcategorías mediante `parent_id`. El bloque «Incluye» es descriptivo y no descuenta otras unidades.
- Precio ausente = `NULL`; publicación independiente del precio. La web muestra **«Precio próximamente»**. Las operaciones monetarias de esas líneas permanecerán deshabilitadas hasta que se apruebe su regla comercial; nunca se calculará un total con cero ficticio.
- Cantidad almacenada como `numeric(14,3)`, con producto entero por defecto y fracción habilitable solo si se confirma el caso. Un inventario global, sin sucursales. Un destino y una entrega por pedido en esta primera versión; no hay entregas parciales.
- Importes en `numeric(14,2)` y **GTQ (quetzales)**, con redondeo decimal en servidor. El usuario confirmó que los precios de producto **ya incluyen IVA**; no se suma otra vez al subtotal. Un eventual desglose de IVA se registra como dato informativo cuando se defina su método, sin cambiar el precio final. Totales, condiciones, método de cobro y datos comerciales de documentos confirmados se congelan. No se garantiza vigencia de precio de una cotización.
- Historial comercial, pagos y movimientos se conservan; los registros del catálogo se archivan en vez de borrar referencias. Los JSON de snapshots tienen esquemas versionados y campos permitidos, nunca aceptan objetos arbitrarios del navegador.

## 2. Tablas, relaciones y restricciones

Todas las tablas con identificador UUID, salvo claves compuestas indicadas; fechas de creación y actualización donde sean útiles. FK indexadas; importes no negativos salvo ajustes expresamente firmados; estados con `CHECK`/dominios y transiciones de servidor. No hay borrado en cascada de historia comercial.

| Área | Tablas y relaciones | Restricciones principales |
| --- | --- | --- |
| Identidad | `profiles.id` PK/FK `auth.users.id`; `user_roles.user_id` PK/FK `profiles.id` | Un rol `customer/operator/admin` por cuenta; cliente no se asigna rol elevado; perfil idempotente antes de comprar; sin contraseñas en tablas propias. |
| Contenido | `site_content(key UQ, payload, status)`; `operational_settings(key UQ, value)` | Claves y esquemas tipados; publicación expresa; secretos fuera de estas tablas. |
| Catálogo | `brands`; `categories.parent_id` FK propia; `products.brand_id/category_id` FK | SKU y slug únicos; categorías sin ciclos; `regular_price NULL OR >0`; `publication_status` independiente; moneda y tipo de producto validados; archivar producto usado. |
| Ficha | `product_images.product_id`, `product_specs.product_id`, `product_inclusions.product_id`, `product_compatibilities(equipment_id,part_id)` | Una imagen principal por producto; orden estable; especificación característica/valor/unidad opcional; incluidos con cantidad positiva sin FK a saldo; par equipo/repuesto único, tipos comprobados y sin autorrelación. |
| Ofertas | `product_offers.product_id` FK | Precio final `>0` y `< precio regular`, o porcentaje `>0` y `<100`; inicio anterior al fin; intervalos habilitados sin solapamiento por producto. Cambio de precio regular requiere revisión de oferta. |
| Capacitaciones | `trainings`; `training_products(training_id,product_id)`; `training_categories(training_id,category_id)` | Video o URL validada, una fuente activa, contenido público solo al publicar; pares únicos. Sin inscripciones ni cupos. |
| Entrega | `delivery_services`; `delivery_zones`; `service_zone_rates(service_id,zone_id)`; `service_payment_options(service_id,method,timing)` | Servicio/medio/cobertura activos antes de ofrecer; tarifa fija no negativa o costo manual `NULL`; retiro sin cargo; condiciones COD por servicio sin sembrar valores de proveedores. |
| Cotización | `quotes.user_id` FK opcional a `profiles`; `quote_items.quote_id` FK; `quotes.supersedes_id` FK opcional | Referencia e idempotencia únicas; nombre obligatorio, correo opcional; `(quote_id,line_no)` único; líneas, ofertas y términos congelados; revisiones nuevas, no mutación de una emitida. PDF privado listo antes de marcar `issued`. |
| Pedido | `orders.customer_id` FK `profiles`; `orders.source_quote_id` FK opcional; `order_items.order_id`; `shipping_proposals.order_id`; `shipments.order_id` | Cliente autenticado; idempotencia por operación; `(order_id,line_no)` único; snapshots de comprador, facturación CF o NIT, entrega, precios con IVA incluido y aceptación; importes/estados solo servidor; propuesta de transporte versionada; una entrega por pedido inicialmente. |
| Inventario | `inventory_balances.product_id` PK/FK `products`; `inventory_movements.product_id`; `stock_reservations.order_item_id` FK | `stock_balance>=0`, `0<=reserved<=stock_balance`; disponible = saldo − reservado; movimiento inmutable con motivo/actor/clave lógica única; una reserva activa por línea; reserva consumida o liberada una sola vez. |
| Pagos | `payments.order_id`; `integration_events.payment_id`; `carrier_settlements.shipment_id`; `settlement_receipts.settlement_id` | Intentos separados; referencia del proveedor única si existe; evento `(provider,event_id)` único; cobro al cliente independiente de depósito de transportista; deducciones documentadas y recibos parciales conciliables. No guardar tarjetas. |
| Formularios | `contact_messages(name,email,phone?,type?,product?,message)`; `financing_requests.quote_id` FK y correo; `guest_access_grants` ligado a cotización o solicitud | Claves de envío únicas, datos privados; tipo y producto de contacto opcionales/validados, sin sistema de tickets; financiamiento con consentimiento versionado y PDF de cotización; exactamente un recurso por token invitado, secreto aleatorio guardado como hash, vencimiento, revocación y límites. En pausa, solicitud `draft`, sin OTP, verificación ni envío. DPI, tipo de crédito y monto mínimo ficticios no pasan al esquema. |
| Posventa | `reviews.customer_id/product_id/order_item_id`; `service_cases.order_id`; `service_case_items.case_id/order_item_id`; `refunds.case_id/payment_id`; `audit_events` | Reseña 1–5 solo si la línea del comprador fue entregada; multiplicidad/edición pendientes, por ahora sin restricción cliente-producto. Reintegro de stock limitado por descuento previo y recepción/revisión. Reembolso no excede cobro y requiere autorización; auditoría sin secretos. |

`email_messages` e infraestructura de OTP quedan **diseñadas pero diferidas** hasta reactivar correo. Cuando se apruebe esa integración: evento de contacto, solicitud y verificación; deduplicación, estado de aceptación de proveedor separado de entrega, OTP con HMAC privado, diez minutos, cinco intentos y reenvío tras sesenta segundos. No se creará una cola que despache borradores acumulados al activarse.

## 3. Totales y documentos

- `quote_items` y `order_items` guardan SKU, nombre, cantidad, precio regular, descuento, precio final, garantía/oferta y total de línea. El servidor calcula con decimales en GTQ, redondea a dos posiciones y concilia cabecera y líneas. Los precios de producto ya incluyen IVA; ningún cálculo agrega un impuesto adicional por defecto.
- Facturación **CF**: nombre, apellido y teléfono. Factura con **NIT**: NIT, nombre del titular del NIT, nombre completo, teléfono y correo opcional. GreenBel emite la factura por su proceso interno; el sistema conserva el snapshot y no certifica ni valida el NIT por inferencia.
- Una cotización con transporte desconocido guarda `merchandise_total` conocido y `customer_total NULL`, más `shipping_status=pending`; el PDF dice expresamente que transporte y total final están pendientes. `excluded` e `included` se distinguen. No muestra costo desconocido como cero o gratis.
- Cotización se crea en estado interno de generación; solo se entrega referencia/descarga como emitida después de guardar el PDF privado y finalizar sus snapshots. Si falla el archivo, se informa error y se limpia el objeto huérfano o se reintenta idempotentemente. Documento emitido no cambia; una revisión crea otra fila.
- Pedido pendiente de cotizar envío no reserva ni cobra. Propuesta del operador y aceptación del cliente preceden a nuevo cálculo de precios/stock y confirmación. Pedido confirmado conserva importes de producto, impuestos, transporte cobrado por GreenBel o por tercero y total del cliente. El cargo del transportista por cobrar a destino no se convierte en deuda con GreenBel ni aparece como envío gratuito.

## 4. RLS, autorización y responsabilidades del servidor

RLS habilitado en cada tabla expuesta, con `GRANT` mínimo. Una vista pública solo expone productos/contenido/capacitaciones/reseñas publicados y disponibilidad comercial limitada; la vista usa seguridad del invocador o una función acotada. No muestra ledger, costos internos, datos de clientes ni cotizaciones ajenas. RLS filtra filas, y las proyecciones/permisos de columna filtran campos.

| Actor | Lectura y comandos permitidos |
| --- | --- |
| Visitante | Catálogo y contenido publicado. Cotización/contacto/financiamiento solo mediante endpoints limitados; PDF y borrador mediante token de acceso al recurso. Sin `SELECT` directo a formularios privados. |
| Cliente | Su perfil, pedidos, líneas, resumen de pagos, cotizaciones vinculadas por acceso demostrado y reseñas propias. Crear/cancelar/comprar mediante comandos de servidor; nunca escribir precios, saldos ni estados. |
| Operador | Pedidos, inventario, cobros presenciales, entregas y excepciones operativas auditadas. Acceso a financiamiento y autorización de reembolsos denegados hasta definir facultades. |
| Administrador | Catálogo, contenido, promociones, opciones, roles y operación mediante comandos autorizados/auditados; sin acceso a secretos de acceso invitado ni datos de tarjetas. |

Roles empresariales proceden de `user_roles` protegido, nunca de metadatos editables por el usuario. Endpoints y funciones transaccionales verifican identidad, pertenencia, rol, entrada y transición antes de operar; funciones elevadas fijan `search_path` y revocan `EXECUTE` general. La clave privilegiada, si se necesita, se usa solo en servidor tras autorizar explícitamente porque omite RLS. Un número de referencia o coincidencia de correo no es prueba de propiedad. El PDF vive en almacenamiento privado y se entrega con autorización y URL firmada corta, sin exponer ruta interna ni token en logs.

## 5. Transacciones críticas

1. **Confirmar pedido:** bloquear saldos de SKUs en orden estable; recalcular precio/oferta, entrega y disponibilidad; exigir aceptación del total final; escribir pedido/líneas y aumentar `reserved` con reserva activa en la misma transacción. Carrito, cotización y borrador de financiamiento nunca reservan.
2. **Consolidar:** pago online verificado por evento autenticado, despacho COD, o cobro y entrega de retiro disminuyen `stock_balance` y `reserved` una vez, consumen reserva y registran movimiento negativo. Despacho posterior de un pedido online pagado no descuenta de nuevo.
3. **Venta física/ajuste:** bloquear balance y reducir solo si `stock_balance - reserved` basta; entrada y ajuste con motivo, responsable, clave lógica y movimiento. Ajuste negativo nunca invade reserva web.
4. **Liberar/restituir:** cancelar antes de consolidar o vencer pago comprobado libera solo `reserved`. Pedido pagado no se libera por tiempo. Cancelación pagada antes de salida restituye con movimiento separado del reembolso; retorno después de despacho solo tras recepción e inspección y hasta la cantidad realmente descontada pendiente de restitución.
5. **Pago:** retorno de navegador no confirma. Evento firmado con `(provider,event_id)` único y transición/efectos en una transacción; reintento con otro evento tampoco duplica descuento. Confirmación tardía tras liberar reserva exige nueva disponibilidad o estado `review_required`, sin prometer entrega. Segundo cobro válido se registra para revisión/reembolso, no se oculta.
6. **Estados separados:** pedido, entrega, pago, depósito externo, reembolso y financiamiento son dimensiones independientes. Cobro del transportista al cliente no implica depósito a GreenBel; reembolso solicitado no significa confirmado.

## 6. Diferencias respecto de la etapa 3 y la migración existente

| Fuente | Ajuste de esta revisión |
| --- | --- |
| Etapa 3, `quotes.total` obligatorio | Separar mercancía conocida y total final nullable cuando transporte esté pendiente; PDF etiqueta el pendiente. |
| Etapa 3, emisión de PDF | Introducir estado interno de generación y publicar solo documento completo; revisión preserva PDF y datos originales. |
| Etapa 3, JSON de pedidos | Hacer explícito snapshot/versionado de impuesto y aceptación, sin fijar una política fiscal todavía. |
| Etapa 3, correo/OTP | Diferir tablas operativas de envío mientras dure la pausa; sin `queued`, OTP ni `sent_at` ficticios. Conservar contrato de integración futura. |
| Etapa 3, reseñas | No imponer unicidad ni edición aún. La relación con compra entregada sí se exige. |
| `001_initial_schema.sql` existente | Es una base antigua de siete tablas, sin RLS, Auth, reservas ni ledger; `products.stock` y `orders` sin `customer_id` contradicen reglas actuales. No editar ni aplicar a ciegas. Tras aprobación, comprobar en DEV si fue aplicada y preparar una secuencia compatible o una base nueva controlada, con conciliación de datos si existen. |

## 7. Decisiones pendientes que afectan funciones concretas

| Pendiente | Qué se puede hacer ya / qué espera decisión |
| --- | --- |
| Producto publicado sin precio | Mostrar etiqueta y ficha ya; compra, cotización monetaria y financiamiento de esa línea esperan regla comercial. Propuesta segura: bloquear esas tres acciones hasta que tenga precio. |
| Moneda, impuesto y campos de facturación | **Resuelto por el usuario:** GTQ, precios de producto con IVA incluido; CF con nombre, apellido y teléfono; NIT con NIT, titular, nombre completo, teléfono y correo opcional. Falta definir solo un eventual desglose informativo del IVA y el tratamiento de tarifas de entrega; no sumar IVA de nuevo. |
| Punto de retiro, cobertura, tarifas, medios por servicio y duración de reservas | Construir panel/configuración; no habilitar compra/entrega real sin valores aprobados y revisión de condiciones. |
| Cooperativa | Borrador, consentimiento, cotización/PDF y protección pueden construirse; envío real pausado y destinatario/requisitos finales pendientes. |
| Reembolsos y garantías | Registrar caso/resultado manual; autorización, automatismos y condiciones esperan política y rol facultado. |
| Recurrente y videos/Storage | Integración específica de pasarela pendiente de confirmación y credenciales de pruebas; alojamiento de videos/archivos requiere selección técnica antes de subir contenido real. |

La cantidad/edición de reseñas, variantes, stock exacto visible y entrega parcial pueden quedar sin habilitar en la primera versión sin bloquear catálogo y datos base.

## 8. Puerta de aprobación y verificación posterior

La aprobación del modelo ya fue otorgada para DEV. El Dashboard del proyecto cuya referencia coincide con `SUPABASE_DEV_PROJECT_REF` mostró `public` vacío y sin historial de migraciones; la SQL legacy no aparece aplicada. Antes de ejecutar cualquier SQL: revisar la migración nueva, volver a comprobar el destino y verificar el resultado después. Si se usa Supabase CLI, comprobar además el proyecto realmente enlazado; hoy no está instalada ni enlazada. RLS con dos cuentas, acceso invitado, cálculos en servidor, reintentos y dos compras de la última unidad siguen **NO EJECUTADO**.

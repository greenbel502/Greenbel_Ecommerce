# Revisión previa de la migración 010 · checkout transaccional

> **Archivo histórico (revisión local previa).** Las frases «no aplicada» y «NO EJECUTADO» siguientes describen el estado al redactar esta revisión, no el estado actual. Las migraciones 001–020 constan en el historial de Supabase DEV; los permisos y recorridos comprobados, con sus límites, están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). No modifica PROD.

**Estado:** SQL local preparado; no aplicado ni verificado en Supabase DEV todavía.
Archivo: `migrations/20260929001000_checkout_transaction.sql`. Requiere 001–009 aplicadas y el mismo destino DEV comprobado antes de `db push`. La 010 no contiene semillas ni afecta PROD.

## Impacto y conservación

- Añade una fila configurable `checkout_settings` sin valores precargados. Los plazos y el simulador permanecen deshabilitados hasta que el administrador/fixture DEV los configure.
- Añade columnas nullable de intención, términos y confirmación a `orders`; los borradores existentes se conservan. Crea el registro privado de reintentos de revisión.
- Redefine `reserve_order_core` con el mismo algoritmo e identidad/privilegios, pero evalúa oferta por `clock_timestamp()` después de los bloqueos y compara también el snapshot de la oferta. Si cruza la ventana de oferta antes de reservar, la transacción entera revierte.
- Instala las RPC `review_checkout(jsonb,uuid,uuid)` y `confirm_checkout(uuid,jsonb,integer,numeric,uuid)` con `EXECUTE` exclusivo de `authenticated`, Auth/propiedad/perfil activo y validación estricta SQL del JSON. Las RPC son `SECURITY DEFINER` con `search_path` fijo.
- Revoca `INSERT/UPDATE` directos a `service_role` de `orders`, `order_items`, `payments` y `shipments`. Conserva sus lecturas; pagos y despachos necesitarán wrappers posteriores. Endurece `shipments` para exigir el servicio, zona y COD del snapshot confirmado.
- Retira `orders_checkout_gate_pending` **al final** de la migración. `confirm_checkout` recalcula importe y términos bajo bloqueos, inserta aceptación y reserva en la misma transacción. No marca pago exitoso, no consolida inventario y no envía correos.

## Contrato de revisión

La intención JSON contiene sólo `lines`, `billing`, `delivery` y `paymentOptionId`. Para envío, `delivery` exige `recipientName`, `recipientPhone` y `addressLine` además de servicio, zona y modalidad de cobro. La revisión crea cabecera y líneas juntas, o revisa un borrador propio. Cada solicitud lleva `reviewKey` UUID; repetir la misma clave y entrada devuelve la respuesta guardada. Cambiar entrada con esa clave falla. Para modificar una revisión se envían su ID y una clave nueva.

La respuesta contiene `reviewId`, `revision`, estado, líneas y montos GTQ como **texto decimal de dos cifras**. En cobertura manual sin propuesta aceptada: `pending_shipping`, total y transporte `null`, sin reserva. Una propuesta aceptada fija sólo el transporte; la siguiente revisión recalcula mercancía y stock. Una propuesta ofrecida/aceptada bloquea cambios de intención que invalidarían su alcance.

## Contrato de confirmación

El cliente envía revisión, intención original, revisión/total aceptados y clave de confirmación UUID. Una clave repetida con la misma huella devuelve la operación previa; con distinta huella o pedido falla. Revisión, oferta, producto, existencia, servicio, zona, tarifa, propuesta, opción y plazos se comparan bajo bloqueos. El último saldo se bloquea por UUID ascendente, igual que la venta física. La aceptación cambia el pedido a `confirmed` y llama `reserve_order_core` antes de devolver éxito. Un error revierte ambos efectos.

`payment_method_snapshot` conserva `optionId`, `method`, `timing`, `testMode:true` y `paymentState:not_paid`; la respuesta indica `paymentStatus:pending`. La reserva online recibe `expires_at`; retiro/COD reciben `review_due_at`. Son fechas para **revisión**, sin liberación automática. Mensajería propia con transporte `at_destination` y pago online se rechaza hasta modelar un cobro dividido. Externo `at_destination` excluye el transporte de `amount_due_greenbel` y lo conserva en `amount_due_carrier_shipping`.

## Verificación requerida en DEV después de aplicar

1. Confirmar historial 001–010 y que `orders_checkout_gate_pending` desapareció sólo tras instalar RPC y revocaciones; consultar grants de `orders`, `order_items`, `payments`, `shipments` y RLS de tablas nuevas.
2. Dos clientes ficticios: sesión, perfil inactivo, lectura ajena, revisión ajena, DML directo, clave de revisión/confirmación repetida igual y con diferente entrada.
3. Crear revisión de retiro, envío propio, externo y tarifa manual. Revisar Q incluidos IVA, snapshots, NIT/CF y rechazo de producto sin precio, saldo no inicializado, opción/configuración inactiva y dirección ausente.
4. Cambiar precio/oferta, servicio, zona, tarifa, método y plazos tras revisión; confirmar que exige nueva aceptación incluso si el total queda igual. Probar oferta que vence durante una espera de stock; nunca confirmar con precio obsoleto.
5. Dos confirmaciones de la última unidad y carrera contra `record_inventory_change(...,'physical_sale',...)`: a lo sumo una reserva válida; reintentar misma clave no crea pedidos, movimientos ni pagos adicionales.
6. Comprobar que confirmación deja pago pendiente y reserva activa, `expires_at` o `review_due_at` correcto, sin envío/correo/cobro. La 010 sola deja pagos y despacho sin escritura directa hasta sus wrappers autorizados.

**Prueba local SQL:** no ejecutada: `initdb` de PostgreSQL 15 en sandbox falló con `shmget(...): Operation not permitted`; Docker daemon no está disponible. La revisión de sintaxis y transacciones deberá completarse con el preflight y prueba DEV controlada antes de declarar PASS.

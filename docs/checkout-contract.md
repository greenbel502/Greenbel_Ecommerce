# Contrato vigente de checkout en DEV

El checkout activo usa Supabase DEV. La migración 010 retiró la antigua compuerta `orders_checkout_gate_pending` e instaló las RPC transaccionales `review_checkout` y `confirm_checkout`. Las rutas HTTP son `/api/checkout/options`, `/api/checkout/review` y `/api/checkout/confirm`. La evidencia directa y sus límites están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). El diagnóstico del esquema anterior a 010 se conserva como [archivo histórico](checkout-transaction-review.md).

## Entrada, cálculo y aceptación

- Se exige una sesión Supabase Auth válida y un perfil activo. El cliente envía IDs y cantidades, datos CF o NIT, servicio, zona y opción de pago; el servidor obtiene precio, oferta, stock, tarifa y permisos desde DEV. Los esquemas de entrada rechazan precio, tarifa, rol, `customer_id` y estado aportados por el navegador.
- Los importes son GTQ y los precios de producto **ya incluyen IVA**. CF pide nombre, apellido y teléfono; NIT pide NIT, titular, nombre completo, teléfono y correo opcional. El sistema guarda un snapshot de facturación; no valida el NIT ante SAT ni emite una factura electrónica.
- La revisión guarda un borrador con revisión y total calculados por servidor. Si el transporte requiere propuesta manual, queda `pending_shipping` sin total confirmable, reserva ni cobro; después de aceptar la propuesta hay que revisar otra vez. El carrito y la cotización PDF no reservan unidades.
- La confirmación exige ID de revisión, versión y total aceptados y una clave de idempotencia. La base recalcula y bloquea los datos pertinentes en una transacción. Un cambio de precio, oferta, disponibilidad o condiciones obliga a una nueva aceptación; un reintento idéntico devuelve el mismo pedido. La última unidad y la venta física compiten por el mismo inventario.
- Un producto sin precio muestra «Precio próximamente» y queda excluido de operaciones monetarias. Un costo de transporte desconocido no se presenta como Q0.

## Pago y preparación

La confirmación crea una reserva y un pedido confirmado. **Una reserva vigente de un pedido de pago en línea no autoriza prepararlo.** Para empezar la preparación se exige un pago de prueba `test_succeeded` del importe exacto debido a GreenBel, con las reservas consolidadas como stock consumido y sin evento `test_review_required`. El guard SQL rechaza tanto la inserción de un envío nuevo como el avance de uno preparado bajo la regla anterior; la RPC de operador queda sujeta a este guard y mantiene sus comprobaciones de despacho/entrega. El simulador de pago 011 opera solo con credenciales administrativas DEV desde un script, sin pasarela ni cobro real. El retorno del navegador nunca confirma un pago.

Para pago presencial o contra entrega, el operador puede preparar el pedido confirmado con la reserva válida. El despacho o la entrega ejecutan la consolidación y los registros de cobro correspondientes al medio y servicio; el depósito de una transportadora externa es un hecho distinto. Cada operación lleva clave de idempotencia. La ruta de cancelación serializa contra preparación y pago; un reembolso queda en solicitud/revisión, sin movimiento de dinero.

## Configuración aún ficticia

Retiro, zonas, cobertura, tarifas, medios y plazos presentes en DEV son fixtures **PRUEBA DEV** editables y no representan condiciones comerciales reales. Recurrente sigue sin confirmación y no hay integración con pasarela. Antes de habilitar pagos o despacho reales hacen falta los datos aprobados de retiro/cobertura/tarifas, el proveedor y contrato de verificación de pagos, y las políticas de cancelación, reembolso y garantía. Los tres correos de negocio siguen deshabilitados.

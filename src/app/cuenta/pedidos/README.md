# Historial de pedidos de la cuenta

Las rutas `/cuenta/pedidos` y `/cuenta/pedidos/[id]` usan la sesión de Supabase Auth del comprador y las políticas RLS. El listado añade `customer_id` como filtro; el detalle comprueba primero que el pedido pertenece al usuario antes de consultar líneas, entrega, pagos de prueba y casos de posventa. Las consultas fallidas se muestran como indisponibilidad, nunca como un historial vacío.

Los tres estados se presentan por separado. Un pago `test_succeeded` se describe como prueba aprobada, no como cobro real. Los importes proceden de snapshots del servidor; esta UI no calcula precios. Las acciones del formulario pasan por `cancel_unprepared_draft_order` o `request_order_cancellation`, cuyas comprobaciones transaccionales tienen la última palabra. La pantalla solo muestra resultados de cancelación/solicitud tras volver a leer el estado persistido; no usa un parámetro de URL como prueba de éxito.

Mientras `orders_checkout_gate_pending` siga instalada, no habrá pedidos confirmados nuevos. La cancelación directa cubre únicamente borradores y pedidos pendientes de costo de envío sin preparación, pago de prueba aprobado ni reserva. CAN-01 para pedidos confirmados antes de preparación requiere el bloque futuro de checkout/pago/inventario. La ruta de solicitud posterior a confirmación está preparada, pero **NO EJECUTADA** contra un pedido confirmado real.

**Verificación:** ESLint de `src/app/cuenta/pedidos` PASS; `tsc --noEmit` PASS. Navegador móvil/escritorio, sesión Auth real, RLS remoto y recorridos de pedidos en Supabase DEV: **NO EJECUTADO** porque las migraciones aún no están aplicadas en DEV. Enlace a integrar desde `/cuenta`: `/cuenta/pedidos`.

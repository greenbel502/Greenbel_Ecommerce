# GreenBel — revisión local de entregas y pagos de prueba

> **Archivo histórico (revisión local previa).** Las frases «no aplicada» y «NO EJECUTADO» siguientes describen el estado al redactar esta revisión, no el estado actual. Las migraciones 001–020 constan en el historial de Supabase DEV; los permisos y recorridos comprobados, con sus límites, están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). No modifica PROD.

**Estado:** `20260929000400_delivery_payments.sql` probada en PostgreSQL 15.14 local después de 001 y 002. **DEV remoto: NO EJECUTADO.** No se usó SQL Editor, Supabase CLI, PROD, proveedor de pagos ni datos reales.

## Alcance y puerta de seguridad

- Configuración administrable: `delivery_services`, `delivery_zones`, `service_zone_rates` y `service_payment_options`. Todo inicia vacío. Los servicios y opciones nacen inactivos; no hay dirección de retiro, proveedor, tarifa ni condición COD sembrada. Solo un retiro activo y exige dirección, horario e instrucciones. Retiro no admite tarifa por zona. Tarifa `manual` guarda `shipping_fee NULL`, que significa costo pendiente; `fixed` exige importe no negativo en GTQ. La matriz de medios/momentos evita terminal externa inferida y exige términos COD antes de activar esa opción.
- `shipping_proposals` guarda revisiones y una sola oferta actual. El cliente del pedido puede aceptar la propuesta mediante `accept_shipping_proposal` idempotente; esto solo reconoce el costo de envío. No acepta el total final, no confirma el pedido, no reserva unidades y no cobra.
- `shipments` representa retiro o entrega manual, con transiciones y datos separados de cobro. Solo admite pedido confirmado. `payments` acepta **registros de prueba** (`test_mode=true`), sin pasarela elegida; un resultado `test_succeeded` exige pedido confirmado y evidencia de prueba. No afecta inventario ni constituye cobro real.
- `carrier_settlements` separa importe recaudado, comisión, envío deducido y otras deducciones documentadas. `settlement_receipts` conserva abonos parciales con clave idempotente; la referencia bancaria no es única y la suma no puede superar el neto esperado, incluso con dos sesiones simultáneas. Las liquidaciones requieren entrega externa COD registrada. No se infiere que entregar equivalga a cobrar o depositar.
- La restricción `orders_checkout_gate_pending` de 002 permanece: no hay pedido confirmable ni envíos/liquidaciones reales hasta completar y revisar checkout, entrega, factura, totales aceptados y pruebas de pago. 004 exige esta puerta en preflight. No hay webhook ni `integration_events` para proveedor todavía.

## Acceso

RLS está activo en las nueve tablas. Visitantes/clientes solo leen configuración activa con proyección de columnas que excluye contrato, límites y comisiones. Un cliente autenticado ve propuestas, entregas y pagos de prueba de sus pedidos; otro cliente no. Operador ve entregas y pedidos para operación, pero no liquidaciones ni recibos. Administrador activo puede leer finanzas; las escrituras de configuración, pago y liquidación corresponden al servidor `service_role` tras autorizar actor y transición. El cliente no actualiza importes ni estados directamente. La aceptación de propuesta comprueba `auth.uid()` en la función. Los recibos son inmutables; pagos de prueba y entregas terminales no admiten edición posterior.

## Verificación local

Pruebas con PostgreSQL 15.14 desechable en socket Unix, TCP deshabilitado y Auth/roles simulados solo en esa base. Fixtures `TEST` locales; ninguna migración trae datos iniciales.

| Estado | Evidencia |
| --- | --- |
| PASS | 004 antes de 001/002 falla en preflight y no deja tablas parciales. 001 → 002 → 004 se aplican en transacciones locales; reaplicar 004 se detiene. |
| PASS | Retiro activo sin datos, segundo retiro activo, tarifa de retiro, terminal de transportadora y COD sin términos se rechazan. Tarifa manual pública conserva `NULL`. Visitante no lee comisión interna. |
| PASS | Otro cliente no acepta propuesta ajena; el comprador acepta y reintenta sin duplicar; pedido queda `pending_shipping` y sin reserva. Segunda oferta vigente se rechaza. |
| PASS | Shipment de pedido no confirmado y pago `test_succeeded` para ese pedido se rechazan; `test_mode=false`, clave de pago duplicada y transición posterior a fallo terminal se rechazan. Cliente solo lee su propio pago de prueba. |
| PASS | Con la puerta de checkout retirada **solo dentro de una transacción local revertida**, un envío externo sintético avanzó preparando → despachado → entregado; retroceder se rechazó. Liquidación COD y dos recibos actualizaron estado parcial → liquidado; diferencia de cobro sin explicación, exceso, recibo duplicado y edición de recibo se rechazaron. Operador no leyó liquidación/recibos; administrador sí. Pago de prueba no cambió inventario. `ROLLBACK` restauró la puerta y quitó esas filas. |
| PASS | Dos sesiones insertaron simultáneamente abonos de 60 sobre neto esperado de 100 en una copia local: solo uno entró; el otro se rechazó por exceso, con un recibo y estado parcial. |
| NO EJECUTADO | Aplicación en Supabase DEV, integración real de Auth/checkout/proveedor de pagos, tarifas o contrato de transportadora, cobros, despacho real y UI. |

**Preflight DEV:** verificar destino y migraciones 001/002/003 en historial; comprobar que la puerta de checkout continúa instalada y que no existen tablas 004. Si hay configuración comercial o pagos previos, detener y auditar. La migración 004 no depende de tablas 003, aunque el runner debe mantener el orden de archivos. Nunca activar un servicio o medio con condiciones no aprobadas.

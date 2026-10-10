# GreenBel — revisión local del bloque de pedidos e inventario

> **Archivo histórico (revisión local previa).** Las frases «no aplicada» y «NO EJECUTADO» siguientes describen el estado al redactar esta revisión, no el estado actual. Las migraciones 001–020 constan en el historial de Supabase DEV; los permisos y recorridos comprobados, con sus límites, están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). No modifica PROD.

**Estado:** migraciones `20260929000100_catalog_foundation.sql` y
`20260929000200_order_inventory.sql` probadas en PostgreSQL 15.14 local.
**DEV remoto:** NO EJECUTADO. No se usó Supabase CLI, SQL Editor, PROD ni datos reales.
La revisión/aplicación en DEV debe seguir el orden 001 → 002, con proyecto,
historial y esquema público comprobados de nuevo antes de ejecutar.

## Esquema creado por 002

- `orders` y `order_items`: borradores de pedido autenticado, referencia e
  idempotencia únicas, líneas `(order_id,line_no)` únicas, importes y snapshots
  de cliente/facturación/entrega/pago preparados para congelarse. `source_quote_id`
  queda sin FK hasta crear `quotes`. Ningún pedido se puede confirmar con esta
  migración: `orders_checkout_gate_pending` impide `confirmed`, `completed` y
  `confirmed_at`. Un pedido cancelado es terminal; sus snapshots y líneas no se reabren.
  Carrito, cotización y borrador financiero no reservan.
- Facturación `billing_snapshot` versión 1: CF exige `first_name`, `last_name`,
  `phone`; NIT exige `nit`, `nit_holder_name`, `full_name`, `phone` y permite
  `email`. Se rechazan campos adicionales. El borrador puede mantenerlo `NULL`;
  la reserva exige que exista. No se inventa formato de NIT ni regla fiscal.
- Moneda del producto con precio y del pedido: `GTQ`. Los precios contienen IVA.
  `included_iva_amount` es informativo y nullable; nunca se suma al precio ni
  al total del cliente. No se fija desglose o tasa de IVA.
- `inventory_balances`: un saldo global por SKU, con `stock_balance >= 0` y
  `0 <= reserved <= stock_balance`. Una fila ausente significa inventario sin
  verificación; la migración no crea saldos ni deduce unidades de datos legacy.
- `inventory_operations`: clave de idempotencia global y huella de parámetros.
  `inventory_movements`: ledger inmutable con cantidad firmada, motivo, actor o
  línea de pedido, y vínculo a la operación. `stock_reservations`: intento por
  línea, máximo una activa y cierre consumido o liberado; sin plazos por defecto.
- `record_inventory_change` es una función de inventario para operador/admin
  activo: entrada verificada, ajuste o **descuento de stock** por venta física.
  Comprueba cantidad entera/fraccionaria, precio presente para venta física,
  saldo disponible, rol, motivo y clave idempotente. No registra ni afirma cobro.
- `reserve_order_core`, `consolidate_order_core` y `release_order_core` son
  primitivas internas `SECURITY DEFINER` sin permiso `EXECUTE` para `anon`,
  `authenticated` ni `service_role`; el esquema privado tampoco se expone.
  Bloquean pedido y saldos en orden estable, comprueban precios publicados
  actuales y snapshots, y escriben saldo/reserva/ledger en una transacción.
  La reserva sigue inejecutable por la puerta de checkout. Consolidar/liberar
  esperan wrappers posteriores que verifiquen el evento de pago, despacho o
  no pago antes de llamarlas. Repetir la misma clave devuelve la operación
  previa sin duplicar efecto, incluso si después avanzó el estado del pedido.

## Acceso y responsabilidades

RLS está activo en las seis tablas. El cliente autenticado lee solo sus pedidos
y líneas; operador/admin activo lee pedidos e inventario. Visitante no obtiene
acceso a esas tablas. Ningún rol de API escribe directamente saldos, reservas,
operaciones ni movimientos; `service_role` solo recibe lectura de inventario
y escritura de borradores de pedido. Las funciones internas tienen
`search_path` fijo. Movimientos/operaciones son append-only; snapshots y líneas
no se pueden cambiar tras confirmar o reservar.

La futura implementación de checkout debe instalar y probar, en la misma
transacción de confirmación: configuración real de entrega y medio admitido,
facturación, cálculo fiscal sin sumar IVA incluido, precio/oferta vigente,
disponibilidad, total final aceptado y snapshots versionados. Solo entonces
podrá eliminar la restricción `orders_checkout_gate_pending` y exponer una
función de confirmación que invoque la reserva interna. Las futuras funciones
de pago/despacho/cancelación deberán verificar evidencia real y transición
antes de invocar consolidación o liberación. No hay tarifas, pagos, reservas
temporales configuradas ni restitución posventa en este bloque.

## Verificaciones locales

Las pruebas usaron un clúster PostgreSQL 15.14 desechable en `/private/tmp`,
con socket Unix y TCP deshabilitado; `auth.users`, `auth.uid()` y los roles de
Supabase se representaron con stubs locales. Los datos de prueba se marcaron
`TEST-*` y nunca se insertaron en DEV.

| Estado | Comprobación y resultado |
| --- | --- |
| PASS | 002 antes de 001 falla en preflight y no deja tablas parciales. |
| PASS | 001 revisada (GTQ/IVA incluido) y 002 se aplican, cada una en una transacción, sobre base limpia. Reaplicar 002 falla en preflight sin alterar datos. |
| PASS | USD para producto con precio, facturación con campo no permitido y pedido `confirmed` se rechazan. No hay balance sembrado por las migraciones. |
| PASS | Cliente solo ve su pedido/línea y no inventario; operador puede registrar stock; cliente y `service_role` no pueden ejecutar reserva interna ni modificar saldo directamente. |
| PASS | Entrada y venta física repetidas con misma clave conservan una sola operación; reutilizar clave con distinta cantidad, vender producto sin precio y sobregirar stock se rechazan. Repetir una venta después de retirar el precio devuelve el movimiento original. |
| PASS | Dos sesiones compitieron por la última unidad física: una venta resultó, la otra recibió insuficiencia, quedó saldo 0 y un solo movimiento de venta. |
| PASS | En una transacción local con la puerta de checkout retirada temporalmente, reserva → consolidación y otra reserva → liberación actualizaron saldo/reservado y ledger una vez; intentos nuevos duplicados fallaron, reintentos con misma clave no duplicaron, snapshots confirmados quedaron inmutables. `ROLLBACK` restauró puerta y eliminó esas reservas de prueba. |
| PASS | En una copia desechable de la base, reserva web de dos unidades y venta física de esas dos unidades compitieron en dos sesiones: solo una resultó; disponible quedó 0 y hubo una operación. La puerta se retiró únicamente en esa copia de prueba. |
| PASS | Tras la revisión de seguridad, la secuencia local 001–007 y pruebas de posventa volvieron a pasar; reabrir un pedido cancelado o cambiar su titular/total se rechaza. Insertar, editar, borrar o mover líneas hacia ese pedido también se rechaza. |
| NO EJECUTADO | Aplicación o inspección SQL en Supabase DEV, integración Next.js/Supabase Auth real, webhooks, cobro, envío, interfaz móvil/escritorio y datos de inventario reales. |

**Preflight de DEV:** verificar que 001 figure aplicada en historial y que
`products`, `profiles`, `user_roles` y `catalog_products` coincidan con la
fundación revisada; confirmar GTQ y RLS. Si hay cualquier tabla de 002 o un
saldo preexistente inesperado, detener y auditar. Una vez aplicada 002, cada
producto requiere conteo/entrada verificada antes de permitir una operación
que dependa de su saldo. No cargar balances estimados ni stock del mockup.

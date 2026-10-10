# Revisión previa 013 · cancelación directa de confirmado sin preparación

> **Archivo histórico (revisión local previa).** Las frases «no aplicada» y «NO EJECUTADO» siguientes describen el estado al redactar esta revisión, no el estado actual. Las migraciones 001–020 constan en el historial de Supabase DEV; los permisos y recorridos comprobados, con sus límites, están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). No modifica PROD.

**Estado:** preparada en `supabase/pending/`, no aplicada. Se revisará el destino DEV, historial 001–012 y dry-run antes de moverla.

## Impacto

- Amplía `service_cases.intake_path` con `direct_confirmed`; conserva las filas actuales y exige caso de cancelación cerrado.
- Añade un guard de caso que exige pedido cancelado y operación de liberación registrada. Sólo la RPC autenticada `cancel_unprepared_confirmed_order` crea ese caso en la misma transacción.
- La RPC bloquea el pedido, comprueba propiedad y perfil activo, la clave de reintento, reserva completa y ausencia de cualquier envío, movimiento de inventario, solicitud de cancelación abierta y pago `test_created`, `test_succeeded` o `test_review_required`.
- Cambia el pedido a `cancelled`, invoca `release_order_core` y registra caso/auditoría en una única transacción. Un fallo revierte todo. La misma clave/entrada devuelve el caso existente; una entrada diferente falla.
- Pagos fallidos terminales no afirman cobro y permiten cancelar si no hay otro impedimento. Un evento simulado tardío de 011 queda como `test_review_required` para conciliación; no reconsolida el stock.
- No decide reembolsos, devuelve dinero ni repone mercancía consumida. Pedidos preparados, pagados, entregados o con evento ambiguo requieren solicitud y revisión manual.

## Verificaciones DEV requeridas

1. Caso confirmado sin envío/pago: cancelación directa, una sola liberación, saldo reservado vuelve a cero, caso cerrado y reintento idéntico; clave distinta no duplica el efecto.
2. Cliente ajeno/anon/perfil inactivo y DML directo no pueden cancelar. Pedido con preparación o pago pendiente/exitoso/en revisión queda en `confirmed` y exige `request_order_cancellation`.
3. Carrera entre cancelación y pago simulado/operador: el lock del pedido serializa; nunca libera stock ya consolidado ni registra éxito después de la cancelación.
4. Pedido entregado o con cobro aprobado no cambia a cancelado por esta ruta. No se emite reembolso ni correo.

**Prueba local SQL:** no ejecutable por `initdb shmget Operation not permitted` y Docker inactivo. Aplicación/QA remota aún pendiente.

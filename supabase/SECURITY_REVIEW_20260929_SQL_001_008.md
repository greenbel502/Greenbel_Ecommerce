# GreenBel — revisión final local de seguridad SQL 001–008

> **Archivo histórico (revisión local previa).** Las frases «no aplicada» y «NO EJECUTADO» siguientes describen el estado al redactar esta revisión, no el estado actual. Las migraciones 001–020 constan en el historial de Supabase DEV; los permisos y recorridos comprobados, con sus límites, están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). No modifica PROD.

**Estado:** PASS en PostgreSQL 15.14 local con Auth/Storage simulados; **Supabase DEV: NO EJECUTADO**. Los archivos 001–008 se instalaron en orden en una base limpia sin datos comerciales sembrados. Esta revisión no autoriza aplicar migraciones ni abrir checkout.

## Controles comprobados

| Estado | Control y evidencia |
| --- | --- |
| PASS | Todas las tablas `public` tienen RLS. `anon`/`authenticated` no tienen `INSERT`, `UPDATE` ni `DELETE` directo en ninguna; `anon` no ejecuta RPC GreenBel. Siete RPC son ejecutables por `authenticated`: cambio de inventario (rol staff), aceptación de propuesta propia, cancelación de borrador propio, solicitud de cancelación propia, registro manual de devolución/garantía (staff activo), registro de solicitud de reembolso sin importe (admin activo) y cambio de imagen principal (admin activo). |
| PASS | Funciones `SECURITY DEFINER` fijan `search_path`; las primitivas de reserva/consolidación/liberación permanecen en `greenbel_private` sin permiso de cliente ni `service_role`. Las RPC de contacto, cotización, grants y financiamiento son solo para `service_role`, con cuotas/idempotencia transaccionales. |
| PASS | Pedidos conservan `orders_checkout_gate_pending`; no se pueden confirmar ni reservar desde API. Pagos solo aceptan `test_mode=true` y no realizan cobros. Contacto conserva `not_sent`; financiamiento conserva `draft`; no hay OTP simulado, correo, cola de entrega ni semillas. |
| PASS | Buckets `quote-pdfs` y `product-images` se crean privados. Los preflight 003/006 detienen políticas de lectura Storage de clientes preexistentes y recursos del mismo nombre sin auditar. 006 no añade política cliente a `storage.objects`; el lector público pasa por RLS de producto publicado y servidor. |
| PASS | Se corrigió 002 para impedir reabrir o alterar cabecera y líneas de un pedido cancelado. Tras la corrección, la secuencia completa 001–007 y pruebas de posventa volvieron a pasar; se rechazaron inserción, edición, borrado y traslado de líneas hacia el cancelado. |
| PASS | RLS de imágenes y disponibilidad oculta borradores/categoría o marca inactiva; 007 publica solo `product_id`, `verified`, `available` y no cantidades. Su preflight exige propietario correcto y RLS sin `FORCE`. |
| PASS | 008 cambia la portada con sesión Auth de admin activo, bloqueo de producto, comparación de la portada observada y auditoría en la misma transacción. Imagen ajena y estados obsoletos se rechazan; dos sesiones dejan un único cambio, y una falla de auditoría revierte la portada. Secuencia limpia 001–008 PASS tras el ajuste. |
| PASS | Tras el ajuste de 005, una base PostgreSQL 15 nueva instaló 001–008 en orden. `tests/sql/manual_service_cases.test.sql` PASS sobre esa secuencia: caso y líneas atómicos, reintento idempotente, bloqueo antes de despacho/entrega y Auth de staff; solicitud de reembolso admin sin dinero o stock y operador denegado. `has_function_privilege` confirmó ejecución de ambos RPC para `authenticated`, denegación para `anon` y de reembolso para `service_role`; cero tablas `public` sin RLS y la puerta de checkout sigue presente. |
| NO EJECUTADO | Permisos y políticas efectivos de Supabase DEV, Storage binario real, PostgREST, Auth real, rutas HTTP, checkout/pagos integrados y pruebas de navegador móvil/escritorio. |

## Responsabilidades y bloqueos abiertos

- El servidor con `service_role` debe comprobar la identidad del actor y su permiso en **cada** operación administrativa. Los disparadores de 004/005 comprueban que IDs como `recorded_by`, `moderated_by` y `handled_by` pertenezcan al rol requerido, pero no pueden probar que sean el actor de la petición. Los endpoints deben escribir auditoría mínima sin secretos; `audit_events` no se llena automáticamente.
- La vista 007 lee balances con derechos de su propietario para calcular dos booleanos; su filtro de publicación y `security_barrier` son parte de la frontera de seguridad. Cambiar el catálogo o el propietario requiere repetir pruebas de filas ocultas y permisos.
- CAN-01 de cancelación directa de **pedido confirmado** antes de preparación, conciliación de pago/reembolso, restitución auditada y checkout con entrega/impuesto/total aceptado continúan pendientes. La función 005 cubre solo borradores mientras la puerta está cerrada. Ninguna limitación temporal se interpreta como política comercial.
- Antes de cualquier aplicación DEV, verificar referencia enlazada e historial del runner, estructura real de `auth`/`storage`, políticas previas, bucket/objetos previos y ausencia de datos que requieran migración. Si difieren del preflight probado, detener y auditar sin usar SQL Editor para saltarlo.

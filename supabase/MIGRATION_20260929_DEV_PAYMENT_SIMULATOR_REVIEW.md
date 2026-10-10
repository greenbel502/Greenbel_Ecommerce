# Revisión previa 011 · simulador de pago online DEV

> **Archivo histórico (revisión local previa).** Las frases «no aplicada» y «NO EJECUTADO» siguientes describen el estado al redactar esta revisión, no el estado actual. Las migraciones 001–020 constan en el historial de Supabase DEV; los permisos y recorridos comprobados, con sus límites, están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). No modifica PROD.

**Estado:** SQL pendiente y script local preparados; ninguna aplicación ni evento ejecutado. La 011 requiere 010 comprobada en Supabase DEV y preflight de proyecto enlazado/historial. No contiene credenciales ni semillas.

## Alcance

- `create_dev_online_payment_attempt(orderId,key)` y `record_dev_online_payment_event(paymentId,eventKey,outcome,evidence)` son RPC `SECURITY DEFINER` con `EXECUTE` sólo para `service_role`. El script `scripts/dev-simulated-payment.mjs` verifica `APP_ENV=DEV`, referencia, URL y enlace DEV antes de usar exclusivamente `DEV_SUPABASE_SECRET_KEY`; no hay ruta de navegador ni retorno `success=true` que pueda marcar pago.
- El intento usa `provider=DEV_SIMULATOR`, `test_mode=true` e importe calculado desde `orders.amount_due_greenbel`. Una misma clave repite el intento. Una clave nueva permite reintentar tras `test_failed` o `test_cancelled` sólo mientras la reserva siga vigente; se rechaza si hay intento abierto, exitoso o pendiente de revisión.
- El ledger `dev_payment_events` conserva cada evento con clave global, resultado y respuesta. Repetir clave/entrada devuelve la respuesta original; cambiar datos con la misma clave falla. Un segundo evento de éxito no descuenta stock otra vez.
- Un éxito **antes** del vencimiento, con pedido confirmado y reserva activa completa, llama `consolidate_order_core(...,'online_payment',...)` y luego marca `payments.test_succeeded`, todo en una transacción. Rechazo marca `test_failed`; expiración marca `test_review_required`. Ninguno libera stock automáticamente.
- Un éxito tras vencimiento, cancelación o pérdida de la reserva marca `test_review_required` si el intento aún estaba `test_created`. Si ya había un estado terminal, el ledger registra `late_success_review`; el pago original se conserva conforme al guard de 004 y se crea una segunda fila `test_review_required` visible al personal, una sola por intento original. Un evento contradictorio después de éxito también crea esa alerta. El despacho online debe exigir éxito por importe exacto **y ausencia de cualquier** pago online pendiente de revisión.
- Pago externo real, reembolso, transferencia bancaria, correos y cancelación automática quedan fuera de 011. La 012 usará métodos presenciales separados y no reconsolidará stock de online.

## Verificaciones DEV necesarias

1. Confirmar que 010 precede a 011 y que `anon`/`authenticated` no pueden ejecutar ambas RPC ni leer o escribir el ledger. `service_role` tampoco debe tener DML directo sobre `payments` o `dev_payment_events`.
2. Con pedido ficticio online: crear intento, repetir misma clave, rechazar y reintentar con nueva clave mientras la reserva siga vigente; no permitir intentos paralelos, exitosos o pendientes de revisión. Expirar y comprobar que inventario sigue reservado sin pago exitoso.
3. En otro pedido, éxito puntual: una única fila de pago `test_succeeded`, una consolidación y un movimiento negativo por línea; saldo/reservado coherentes. Repetir evento con misma y distinta clave sin nuevos movimientos.
4. Forzar vencimiento antes del éxito: `test_review_required`, reserva intacta. Cancelar sólo mediante el flujo autorizado y enviar éxito posterior: ledger `late_success_review`, sin nueva consolidación ni liberación.
5. Intentar evento de pago ajeno, duplicar clave con otra entrada y marcar `test_mode=false`: todo rechazado. Verificar que `scripts/dev-simulated-payment.mjs` se niega a operar cuando el selector/enlace/URL no son DEV.

**Prueba local:** `node --check` y ESLint del script pasaron. SQL no ejecutado en PostgreSQL local por restricción de memoria compartida del sandbox; la prueba directa en DEV sigue pendiente.

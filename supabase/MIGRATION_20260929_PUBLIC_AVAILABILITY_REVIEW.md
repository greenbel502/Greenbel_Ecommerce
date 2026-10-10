# GreenBel — revisión local de disponibilidad pública

> **Archivo histórico (revisión local previa).** Las frases «no aplicada» y «NO EJECUTADO» siguientes describen el estado al redactar esta revisión, no el estado actual. Las migraciones 001–020 constan en el historial de Supabase DEV; los permisos y recorridos comprobados, con sus límites, están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). No modifica PROD.

**Estado:** `20260929000700_public_availability.sql` probada en PostgreSQL 15.14 local tras 001/002/004/005/006. **Supabase DEV: NO EJECUTADO.** No crea saldos ni cifras ficticias.

## Contrato

La vista `product_availability` expone únicamente `product_id`, `verified` y `available`:

| Estado interno | `verified` | `available` | Interpretación de interfaz |
| --- | --- | --- | --- |
| No existe fila de saldo | false | false | Disponibilidad sin verificar; no llamarlo agotado. |
| Saldo verificado sin unidades libres | true | false | Agotado. |
| `stock_balance > reserved` | true | true | Disponible al instante de lectura. |

La vista solo devuelve productos publicados con categoría activa y marca activa si la tienen. Los saldos, reservas, operaciones y movimientos permanecen privados. La vista se ejecuta deliberadamente con derechos de su propietario para calcular dos booleanos desde `inventory_balances`; `security_barrier` y los filtros explícitos impiden que una condición del cliente lea primero filas ocultas. Esta configuración exige revisar cuidadosamente cualquier cambio futuro a los filtros de publicación. La disponibilidad es informativa: la reserva transaccional de 002 sigue siendo la autoridad para una compra concurrente.

## Verificación local

| Estado | Evidencia |
| --- | --- |
| PASS | Secuencia completa 001 → 002 → 003 → 004 → 005 → 006 → 007 instalada en base local limpia con Storage simulado. 007 sin 002 se detiene sin crear vista y su reaplicación se rechaza. Si el propietario de la migración no posee el saldo o `FORCE RLS` está activo, el preflight se detiene para evitar falsos `unverified`. |
| PASS | Visitante ve `false/false` para saldo sin inicializar; `true/false` para cero o todo reservado; `true/true` para saldo libre. No ve producto borrador, marca inactiva ni categoría inactiva. |
| PASS | Cliente autenticado no lee saldos de `inventory_balances`, pero sí la vista; la vista tiene solo tres columnas. Al reservar todas las unidades de un saldo de prueba, `available` cambia a `false`. |
| NO EJECUTADO | Supabase DEV, consultas HTTP reales del catálogo y respuesta de la UI. |

**Preflight DEV:** confirmar 001/002 y ausencia de vista previa; comprobar permisos/propietario de `inventory_balances` y probar las cuatro combinaciones públicas con RLS antes de usar el indicador en la UI. No derivar disponibilidad de una cifra estática en el cliente.

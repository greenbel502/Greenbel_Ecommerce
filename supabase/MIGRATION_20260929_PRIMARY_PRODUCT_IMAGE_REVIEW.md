# GreenBel — cambio atómico de imagen principal

> **Archivo histórico (revisión local previa).** Las frases «no aplicada» y «NO EJECUTADO» siguientes describen el estado al redactar esta revisión, no el estado actual. Las migraciones 001–020 constan en el historial de Supabase DEV; los permisos y recorridos comprobados, con sus límites, están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). No modifica PROD.

**Estado:** `20260929000800_primary_product_image.sql` probada tras 001–007 en PostgreSQL 15.14 local. **Supabase DEV: NO EJECUTADO.** No se subieron, eliminaron ni cambiaron archivos de Storage.

## Contrato de la RPC

`public.set_product_primary_image(p_product_id uuid, p_image_id uuid, p_expected_primary_id uuid DEFAULT NULL) RETURNS uuid` se ejecuta con la sesión **Auth** de un administrador activo. `NULL` significa que no había imagen principal al cargar la pantalla. El servidor/UI debe enviar el ID de la portada observada para evitar sobrescribir silenciosamente un cambio concurrente; si ya cambió, la RPC responde `P4090` y se debe recargar el producto. Si la imagen solicitada ya es la principal, la RPC devuelve su ID sin nuevo evento de auditoría.

La función bloquea la fila del producto, confirma que la imagen pertenece a él, desmarca la portada previa, marca la nueva y registra `primary_image_changed` con IDs anteriores/nuevos en `audit_events`, todo dentro de la misma transacción. El índice parcial de 001 sigue garantizando como máximo una principal. Los clientes `anon`, `customer`, `operator`, `service_role` y administrador inactivo no ejecutan la operación. `service_role` conserva sus permisos de catálogo para las rutas administrativas ya existentes, por lo que el servidor debe usar esta RPC con sesión Auth para cambios de portada y no escribir `is_primary` directamente.

## Verificación local

| Estado | Evidencia |
| --- | --- |
| PASS | 008 se instala tras 001–007; reaplicarla se detiene en preflight. Primera portada con esperado `NULL`, cambio de portada y reintento idéntico dejan exactamente una principal y la auditoría correspondiente sin duplicación. |
| PASS | Imagen de otro producto, expectativa obsoleta, cliente, operador, visitante, administrador inactivo y `service_role` se rechazan. |
| PASS | Dos sesiones intentan cambiar la misma portada observada: una confirma, la otra recibe `P4090`; queda una principal y solo un evento nuevo. Una falla forzada de auditoría revierte el cambio de imagen. |
| NO EJECUTADO | Supabase DEV/Auth real, PostgREST, integración del panel y archivos binarios Storage. |

**Preflight DEV:** confirmar historial 001–007 y ausencia de la RPC; comprobar imágenes/índice de principal y auditoría. Aplicar solo por runner verificado tras revisión. La UI debe refrescar el ID principal luego de éxito o `P4090`.

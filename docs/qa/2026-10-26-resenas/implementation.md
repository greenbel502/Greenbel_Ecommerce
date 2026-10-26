# Reseñas de solicitud por WhatsApp — DEV, 26/10/2026

Modelo 032 aprobado explícitamente por el usuario; aplicado únicamente en el proyecto DEV enlazado y comprobado. Sin commit/push/despliegue/PROD.

## Resultado

- Después de continuar con PDF/WhatsApp aparece «Escribir reseña». El formulario abre un panel derecho con cinco estrellas, comentario, privacidad y acción final. También queda acceso al cerrar la confirmación, mientras permanezca esa vista del carrito.
- Sesión/perfil activo, invitación propia del PDF, validación de origen/tamaño/contenido y cuota persistente. Una reseña por invitación, reintento idéntico sin duplicados. Un fallo del servicio de reseñas no bloquea PDF ni WhatsApp.
- Tabla administrativa con cliente, opinión, origen, estrellas, estado, fecha y «Revisar». Panel derecho de moderación con confirmación, motivos permitidos y registro de cambios. No permite reescribir la opinión.
- Inicio muestra solo opiniones publicadas sobre la experiencia de solicitud, con nombre de pila. Permanecen separadas de las reseñas verificadas de productos entregados.
- Abrir WhatsApp no demuestra que se envió el mensaje ni crea una venta/entrega. No se enviaron mensajes de prueba ni se cambiaron pagos/inventario/pedidos.
- Sileo y confirmación global. Se corrigió el bloqueo de un modal solicitado desde una acción React pendiente mediante commit inmediato de la apertura; cancelación y confirmación verificadas en navegador.

## Archivos principales

- `src/presentation/components/whatsapp-purchase.tsx`, `whatsapp-review-drawer.tsx` y su CSS: acceso al final del recorrido y formulario.
- `src/app/api/cart/whatsapp/pdf/route.ts`, `reviews/route.ts`, `src/lib/server/whatsapp-reviews.ts`, `src/lib/reviews/*`: invitación/guardado/validación.
- `src/app/admin/resenas/*`, `src/lib/server/admin-reviews.ts`: tabla, filtros, panel y moderación.
- `src/app/page.tsx`, `whatsapp-testimonials.tsx` y su CSS: opiniones públicas con fuente separada.
- `src/presentation/notifications/notification-provider.tsx`: corrección puntual del modal.
- `supabase/migrations/20261026003200_whatsapp_reviews.sql`: modelo, proyecciones y comandos. Se refinó dentro de esta misma iteración DEV la extracción del nombre de pila ante saltos de línea, conservando paridad del SQL registrado en el historial. No hay migración extra ni cambios históricos comerciales.
- Pruebas y scripts: `tests/whatsapp-reviews.*`, pruebas WhatsApp/PDF; `scripts/dev-whatsapp-reviews-qa.mjs` y limpieza acotada.

## Evidencia ejecutada

| Comprobación | Resultado |
| --- | --- |
| Unitarias de API, autenticación, moderación, PDF y regresión visual | PASS: 26 (`unit.log`) |
| Integración HTTP contra Next y Supabase DEV | PASS: 16 (`http.json`) |
| SQL real, funciones/roles y RLS, transacción revertida | PASS: 29 (`sql-applied.log`) |
| Simulación de la migración antes de aplicarla | PASS: rollback |
| Tablas comerciales protegidas al migrar | PASS: 16 digests sin cambios |
| UI cliente: continuar, reseñar, estrellas con teclado, salida/cancelación, guardado real | PASS |
| UI admin: tabla, apertura inmediata, cancelar/publicar/ocultar con motivo y filtros | PASS |
| Opinión publicada en Inicio, solo nombre de pila y estrellas | PASS |
| 390/820/1440: cliente, tabla/filtros y opiniones | PASS. Tabla con desplazamiento interno en pantallas estrechas; sin desbordamiento de página tras corregir el texto accesible de acciones |
| Limpieza acotada con respaldo privado, simulación y guardas restauradas | PASS: 2 reseñas, 3 invitaciones y 2 cuentas técnicas; datos restantes preservados |
| Carrito del navegador | PASS: restaurado a vacío, estado observado al iniciar esta prueba |

Los ejemplos visibles en capturas son registros técnicos retirados, no reseñas comerciales. No se publicaron mensajes en WhatsApp. Capturas `cliente-390.png`, `cliente-1440.png`, `admin-390.png`, `admin-1440.png`, `inicio-1440.png`.

Build/types/lint: PASS; build aislada posterior a las correcciones terminada correctamente. Logs guardados. Ninguna prueba equivale a un despliegue de producción.

## Continuidad

Reseñas terminadas en DEV. El usuario añadió una nueva tarea: convertir la guía Bell en chatbot con datos reales, sin APIs comerciales. Auditoría/propuesta en `docs/chatbot/2026-10-26-plan.md`; migración 033 requiere su validación independiente. No actualizar inventario, checkout ni autenticación como parte del chatbot.

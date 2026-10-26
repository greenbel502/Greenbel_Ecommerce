# Módulos administrativos inhabilitados · 25/10/2026

Estado: **COMPLETADO en DEV**. Solicitud actual del usuario: indicar como inhabilitados Ventas y posventa, Envíos externos y Entregas y pagos durante la fase de compra por WhatsApp.

## Cambios

- Los tres siguen visibles en el menú con candado y texto **Inhabilitado**, sin href ni entrada en el recorrido de Tab; `aria-disabled` y nombre accesible comunican el estado. El modo contraído conserva icono/candado y descripción.
- Sus tarjetas de Inicio son informativas y no tienen enlace de apertura.
- Las rutas `/admin/ventas`, `/admin/envios`, `/admin/entregas` y el detalle `/admin/ventas/[id]` conservan su autorización y presentan un aviso de pausa antes de consultar los datos del módulo. El aviso permite volver al Inicio.
- Inventario y el resto de enlaces conservan su disponibilidad. Se mantiene el código original de las pantallas para una futura decisión de reactivación.
- Alcance de esta entrega: navegación y presentación. Sin cambios en acciones de negocio, endpoints, esquema, datos, permisos, correo, pagos ni PROD. Sin commit/push/despliegue.

## Archivos

`src/lib/admin-module-status.ts` centraliza los módulos pausados y cubre sus subrutas. `src/app/admin/_components/paused-module.tsx` contiene el aviso común. Se adaptaron AdminShell, Inicio, las cuatro páginas mencionadas y estilos acotados al final de `admin.css`.

## Verificación ejecutada

- **PASS:** TypeScript (`npx tsc --noEmit --incremental false`), ESLint sin advertencias, Prettier de los TS/TSX afectados y `git diff --check`. No se reformateó el CSS histórico ajeno al bloque.
- **PASS en Chrome autenticado:** los tres elementos del menú son enlaces deshabilitados sin href y con `tabIndex=-1`; las tres tarjetas de Inicio carecen de enlace; Inventario conserva su enlace activo.
- **PASS:** acceso directo a las tres páginas y a un detalle de venta con UUID válido muestra título/aviso y cero formularios de operación. Se esperó al encabezado visible para evaluar cada ruta; lecturas iniciales durante navegación todavía mostraban contenido transitorio.
- **PASS responsive:** Inicio/menú a **389×844, 820×1024 y 1440×900 CSS px**, sin desbordamiento horizontal. Menú móvil abierto/cerrado, modo contraído/expandido y aviso de Ventas a 389 CSS px revisados. Viewport y menú restablecidos; se dejó la página original de Inventario abierta.
- Evidencia: `2026-10-25-modulos-pausados-browser.json`, PNG de Inicio, menú, modo contraído, aviso móvil y estado final en este directorio. Captura recortada del menú: `2026-10-25-modulos-pausados-menu.png`.
- **NO EJECUTADO:** nueva compilación de producción ni pruebas de operaciones de inventario/ventas/pagos; no son necesarias para esta modificación reversible de presentación. No se generaron movimientos ni fixtures de negocio.

Continuidad: la lista de pausa es explícita e independiente de la política ya cerrada del checkout. Reactivar estas pantallas requiere una nueva decisión del usuario; no borrar la implementación previa ni cambiar el estado de la pasarela por inferencia.

# Productos: carga de imágenes y detalles · 25/10/2026

## Fallo observado y causa en el código

La captura del usuario muestra el editor abierto y «Cargando fotografías y detalles del producto…» sin los controles de la galería ni las especificaciones.

Antes de esta corrección, el clic cambiaba la URL con History API y ejecutaba `router.refresh()`. Las secciones dependían de que el `selectedId` de la respuesta de **toda la página del catálogo** coincidiera con el `editorId` local. El indicador `requested` impedía volver a solicitar la misma selección y no existían ni un estado de error ni un límite de espera. Un refresco fallido o que no entregara la selección esperada dejaba el mensaje permanentemente visible. La verificación anterior solo cubría la apertura inmediata; no demostraba que terminase de cargar tras el clic. No se atribuye una traza de navegador a esta inspección del código.

## Corrección implementada

- `ProductsAdmin` carga únicamente el producto seleccionado mediante `GET /api/admin/products/[id]`. Abrir/cerrar no ejecuta el refresco general del catálogo. La URL/historial y la apertura inmediata se mantienen.
- La respuesta incluye producto, imágenes, especificaciones, incluidos, compatibilidades y sus referencias concretas. Las lecturas principales corren en paralelo y están restringidas al ID del producto. No se vuelven a consultar los listados, totales ni filtros de los otros módulos al abrir una fila.
- La petición completa del cliente tiene **10 segundos de límite**, con cancelación y mensaje comprensible junto a **Reintentar carga**. Las consultas de datos del servidor reciben además una señal de cancelación de 8 segundos. No se altera la resolución de Auth ni sus permisos.
- Cerrar/cambiar de selección cancela la solicitud anterior. Respuestas tardías u otras que no corresponden al producto no pueden sustituir los datos de la selección actual.
- Si falla una actualización y ya había datos, se conservan; el error/reintento se muestra aparte. Lo escrito en el formulario no se borra al reintentar.
- Las operaciones confirmadas de fotografías y detalles notifican a esta carga específica para renovar la información visible. Se conserva el refresco de la lista después de escrituras; ese refresco ya no es la condición para mostrar las secciones.
- Acceso directo conserva el contenido servido inicialmente y lo actualiza sin bloquearlo. Un producto sin fotografías muestra el estado vacío y el control de carga de archivos, en lugar de confundirlo con una carga pendiente.

## Seguridad y alcance

La nueva lectura exige administrador activo en servidor, valida el UUID y devuelve `private, no-store` y `nosniff`. Anónimo, cliente, operador y administrador inactivo quedan excluidos. Respuestas de error genéricas, sin consultas, claves ni trazas; las filas de imagen no contienen sus rutas de Storage.

No se modificaron acciones de escritura, precios, inventario, validaciones, esquema, migraciones, políticas ni roles comerciales. El recurso privado de bytes de imagen y la ruta pública mantienen sus protecciones anteriores.

Archivos: `products-admin.tsx`, `product-editor.tsx`, `catalog-form.tsx`, `products.module.css`; `src/lib/products/product-editor-data.ts`, `src/lib/server/product-editor-data.ts`, `src/app/api/admin/products/[id]/route.ts`.

## Verificación ejecutada

| Comprobación | Resultado |
| --- | --- |
| DEV/HTTP | **PASS 17/17**: tres cargas completas, cabeceras/propietario correctos, cantidades iguales a la base existente, lector del cliente real, permisos y 404. Solo lectura de un producto existente; identidades temporales eliminadas y estado previo idéntico. |
| Dominio y listas | **PASS 8/8**: cinco casos nuevos del lector y tres existentes de listas. Timeout aun con transporte que no termina, cancelación, reintento, errores de permiso/red/JSON y rechazo de datos de otro producto. |
| Componentes React en DOM simulado | **PASS 13/13**: la carga tras Editar **termina** y aparecen galería/especificaciones sin recibir nuevas props del servidor ni llamar `router.refresh`; error→reintento preservando campos, cambio rápido de producto/reapertura, respuestas tardías ignoradas y recarga tras operación confirmada. Incluye pruebas previas del selector y guardado. |
| TypeScript / ESLint / diff / formato | **PASS** en los archivos finales y lint global. |
| Build aislado | **PASS**, Next 15.5.27, exit 0. El `.next` del servidor de desarrollo no se sustituyó. |
| Chrome/capturas/responsive real | **NO EJECUTADO**: `cua.getState()` continúa con cero navegadores y fallo de inicio del control nativo. No se confunde jsdom con una comprobación visual real. |

### Tiempos medidos

`6732`, `771` y `682` ms desde el cliente HTTP local con sesión de administrador. La primera petición incluyó la compilación en DEV: el span local `compile-path` de esa ruta duró `4467` ms. Las otras dos respuestas completaron en menos de un segundo. Son medidas de esta sesión local, no una garantía de latencia de producción ni una medición de descarga/decodificación de fotografías.

El producto leído tenía **0 imágenes, 2 especificaciones y 0 incluidos**; las cantidades de la respuesta coinciden con la base. Por ello un estado sin fotografías es correcto para esa ficha, pero no lo era el indicador de carga indefinido.

Evidencia: `2026-10-25-load-performance.json`, `2026-10-25-load-verification.json`, logs `load-http`, `load-unit` y `load-dom` junto a este documento. La primera verificación local detectó sintaxis de parámetro TypeScript no admitida por el ejecutor de pruebas y dos tipos potencialmente nulos; se corrigieron antes de los PASS finales. No hubo escrituras ni nuevos actores de auditoría inmutable en esta prueba. El actor histórico bloqueado de la iteración anterior no fue modificado.

## Continuidad

Con navegador disponible: abrir una fila desde el listado, esperar la galería/especificaciones, cerrar/reabrir, cambiar rápidamente de producto, simular desconexión y reintentar; comprobar foto real cuando exista y conservación de campos escritos. Las pruebas de esta corrección no volvieron a ejecutar operaciones de escritura comerciales.

Solo DEV/local. Sin commit, push, despliegue, PROD, correo comercial ni cobros.

# Filtros, categorías laterales y eliminación · 24/10/2026

## Implementado

- **Filtros compartidos:** búsqueda en una fila propia con icono y espacio para el texto. Estado, orden, dirección, tamaño de página y acciones en un grupo flexible, con anchos mínimos y salto de línea. En móvil pequeño los campos ocupan la fila; Aplicar/Limpiar se acomodan sin posiciones absolutas. Se retiraron las reglas anteriores que mezclaban flex y supuestas columnas de grid en Marcas. Parámetros, búsquedas, consultas y paginación en servidor conservados.
- **Categorías:** tabla con nombre, categoría superior cuando corresponde, estado y acciones. Crear/Editar abren el mismo tipo de diálogo modal lateral derecho que Marcas. Apertura local de filas ya disponibles, sin esperar una recarga. Acceso directo por `category`, selección fuera de la página, historial, cierre y retorno de foco contemplados. El formulario separa datos, jerarquía y visibilidad, con guardado final, progreso, prevención de doble envío, errores por campo y conservación de datos.
- **Marcas y categorías:** Eliminar junto a Editar. Confirmación accesible con nombre del registro, Cancelar como foco inicial, bloqueo durante envío y aviso del resultado. La lista se refresca después de una eliminación confirmada; los filtros se conservan y la consulta existente ajusta la página válida.
- **Servidor:** ambas acciones vuelven a verificar sesión, administrador y perfil activo. Exigen ID válido, confirmación explícita y nombre esperado para evitar eliminar un registro renombrado mientras se confirma.
- **Vínculos protegidos:** una marca asignada a productos, incluso borradores, no se elimina. Una categoría con productos, subcategorías o capacitaciones vinculadas tampoco. Se ofrece desactivar desde el editor. Las FK `RESTRICT` existentes siguen vigentes para las carreras entre comprobación y borrado; no se agregan cascadas, reasignaciones o suspensiones de triggers.
- **Logo:** solo se elimina el archivo propiedad de la marca después de confirmar el borrado de su fila. Un rechazo conserva el archivo. Un fallo de limpieza se registra y se comunica como pendiente, sin fingir que el registro sigue existiendo. Se mantiene la ruta pública controlada.

No hay migración nueva ni cambio de modelo, RLS, roles o infraestructura: las tablas ya permiten este borrado restringido por las relaciones existentes y comandos autorizados de servidor. No se toca checkout, precios, stock, pagos o correos.

## Archivos principales

- `src/app/admin/_components/list-controls.tsx`, `src/app/admin/admin.css`: presentación compartida de filtros.
- `src/app/admin/catalogo/categories-admin.tsx`, `category-editor.tsx`: tabla y formulario de categorías.
- `catalog-drawer.tsx`: diálogo lateral compartido por Marcas y Categorías.
- `catalog-delete-dialog.tsx`, `actions.ts`: confirmación y eliminación con validación real de servidor.
- `brands-admin.tsx`, `brands.module.css`, `catalog-admin.tsx`, `page.tsx`: integración, estilos, selección directa y nombres de superiores mediante consulta acotada a los padres de esta página/selección.

## Verificación ejecutada

| Entorno | Resultado |
|---|---|
| DEV + HTTP local | **35 PASS**: HTML actual de tabla/filtros/drawer; acceso directo, nuevo y fuera de página; acciones reales de creación/edición/visibilidad; validación de campos; ciclo jerárquico; bloqueos por productos/subcategorías/capacitaciones; rechazo de cliente, operador y anónimo; confirmación y nombre obsoleto; búsqueda/filtro/orden/tamaño/página inválida; eliminación real de fixtures y logo; página vacía válida; datos previos conservados. |
| LOCAL | **11 PASS** de pruebas existentes de estado de listas, rutas de logos y guardado de marcas. |
| LOCAL | TypeScript, ESLint completo, `git diff --check` y build optimizado final: **PASS**. Build en copia aislada para conservar el servidor y su `.next`. |
| Navegador | **NO EJECUTADO**: inventario vacío y fallo de arranque del control nativo. Clics, foco real, apertura/reapertura, teclado y capturas responsive no se atribuyen a las pruebas HTTP. |

La primera ejecución se detuvo por una aserción del arnés: confundía el nombre del padre mostrado dentro de una subcategoría con otra fila. Se corrigió para distinguir el título de cada fila; no requirió cambiar la consulta de filtros. Ambas ejecuciones limpiaron sus fixtures. La segunda terminó con 35 PASS y comparación íntegra de las filas previas.

Solo se crearon cuentas y registros temporales con marcador de esta ejecución: tres sesiones de rol, marca/logo, dos categorías, capacitación en borrador y producto en borrador. Todos se retiraron. Las ocho marcas y sus logos comerciales, categorías comerciales, productos, perfiles y roles previos se conservaron. No se ejecutó Eliminar sobre una cuenta, marca o categoría real.

Evidencia: [DEV/HTTP](classification-verification.json), [controles locales y límites](classification-local-verification.json). Registro privado de fixtures/limpieza en `~/.codex/private/greenbel-brands-qa/`, sin contraseñas persistidas.

## Revisión pendiente en navegador

1. Recargar `/admin/catalogo?view=brands` y `?view=categories`.
2. Revisar filtros en 320/390/820/1440 px y zoom 200 %: campos completos, acciones disponibles, tabla con scroll propio y página sin overflow.
3. Editar → cerrar → editar la misma fila → otra fila → nueva; comprobar apertura inmediata, Escape, historial y foco.
4. Verificar el formulario de categorías, selección de superior, errores visibles, guardado y desactivación solo con registros temporales.
5. Probar Cancelar en Eliminar. Para probar el borrado, usar únicamente una marca/categoría temporal sin vínculos; comprobar el mensaje de bloqueo de una temporal vinculada, sin modificar datos comerciales.

No repetir suites de fixtures salvo para un riesgo concreto. No hacen falta nuevas migraciones ni repetir la importación de logos. Solo DEV; sin commit, push, despliegue, PROD, cobros o correos.

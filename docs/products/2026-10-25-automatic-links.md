# Enlaces de producto automáticos · 25/10/2026

## Petición y alcance

El usuario pidió retirar «Nombre en el enlace» del formulario y generarlo por defecto. Implementado en la copia `Greenbel_Ecommerce`, rama `dev`, base `0644f86`, preservando el trabajo local previo. Sin migraciones, cambios de esquema, PROD ni publicación Git.

## Implementación

- `product-editor.tsx`: retirados el campo y su ayuda. No se envía un slug oculto.
- `actions.ts`: creación con slug generado exclusivamente en servidor a partir del nombre y código. Un valor `slug` enviado por un cliente antiguo o manipulado se ignora. Las actualizaciones omiten esa columna y mantienen la dirección existente, aunque cambien nombre o código.
- `product-slug.ts`: normalización de tildes, espacios y signos; máximo 160 caracteres; base `producto` cuando no quedan letras/números válidos. La restricción única existente resuelve colisiones. Solo una colisión de slug se reintenta, hasta tres intentos, usando sufijo UUID; un código de producto duplicado continúa rechazándose.
- Marcas/categorías, precios, inventario, permisos y operaciones vinculadas conservados. No se regeneraron direcciones del catálogo existente.

## Validación ejecutada

- **PASS:** 15 comprobaciones finales en DEV/HTTP, con usuarios/categoría/productos efímeros: formulario sin campo; alta y edición sin slug; persistencia y resolución anónima en `catalog_products`; nombre/código modificados conservando URL; valores del cliente ignorados; dos altas simultáneas con colisión normalizada; código duplicado rechazado; permisos de cliente/anónimo; limpieza y comparación exacta del estado previo.
- **PASS:** 13 pruebas de componentes en DOM simulado. Campo ausente incluso de `FormData`; selectores y botón final conservados.
- **PASS:** 3 pruebas unitarias de normalización, límites/caracteres y discriminación de errores de unicidad.
- **PASS:** TypeScript, ESLint, Prettier, `git diff --check` y build aislado con exit 0. La copia de build no sustituyó `.next` del servidor de desarrollo.

Evidencias: `2026-10-25-slug-verification.json`, `2026-10-25-slug-http.log`, `2026-10-25-slug-dom.log`, `2026-10-25-slug-unit.log`. Comandos: `node --env-file=.env scripts/dev-brands-qa.mjs --product-slug`, `NODE_PATH=/tmp/greenbel-picker-dom-qa/node_modules node --test scripts/qa-entity-picker-dom.mjs`, `node --test tests/product-slug.test.mjs`, `npx tsc --noEmit --incremental false`, `npm run lint`.

## Límite observado y continuidad

- **FAIL de comprobación de página completa:** el intento adicional de abrir por HTTP la ficha pública de un producto efímero superó 45 segundos. Se conserva la ejecución fallida en `2026-10-25-slug-public-timeout.{json,log}`; su limpieza pasó y no dejó fixtures. No se presenta la lectura del catálogo público como prueba de render completo.
- Una consulta de control posterior a una ficha comercial existente devolvió **HTTP 200 en 33 108 ms**, sin modificar datos (`2026-10-25-slug-public-control.json`). Se observa lentitud en la ruta pública local; esta iteración no cambia esa ruta ni atribuye la causa al slug. La comprobación final se centra en el guardado y la resolución pública del identificador. Revisar rendimiento de ficha pública como trabajo separado.
- **NO EJECUTADO:** interacción/render visual en Chrome, móvil/tablet/zoom. `cua.getState()` devolvió navegadores/apps vacíos y `Sky Computer Use native pipe startup failed`.
- Limpieza final: sin nuevo actor de auditoría retenido ni diario QA abierto. El actor técnico histórico bloqueado documentado en una iteración anterior permanece intacto. Correos de negocio pausados; sin cobros, commit/push/despliegue ni PROD.

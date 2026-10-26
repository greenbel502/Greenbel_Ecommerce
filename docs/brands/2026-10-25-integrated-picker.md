# Selector único con búsqueda integrada · 25/10/2026

## Petición y corrección

El editor de categoría superior mostraba un buscador y un select separados. Se sustituyen por **un único control visible**: al abrirlo, la búsqueda aparece dentro del desplegable y filtra las opciones devueltas por la consulta existente. El usuario selecciona allí mismo.

- `src/app/admin/_components/entity-picker.tsx`: componente compartido corregido, búsqueda solo al abrir, debounce, cancelación de respuestas obsoletas, carga/error/reintento/sin coincidencias, selección conservada y navegación con flechas/Enter/Escape.
- `src/app/admin/_components/entity-picker.module.css`: estilos aislados, foco visible, controles de 44 px o más, textos largos, scroll interno y movimiento reducido. Lista en la capa superior nativa para no quedar recortada por el drawer; posición ajustada al viewport y teclado virtual.
- `src/app/admin/catalogo/category-editor.tsx`: opción «Sin categoría superior» y ayuda coherente para mantener una categoría principal.

El mismo componente se reutiliza en las selecciones de marca/categoría/producto/servicio/zona existentes. No se cambian consultas, endpoint, permisos, acciones, rutas ni reglas de validación. El campo nativo conserva FormData, required y el evento change usado por el guardado de la categoría superior. La búsqueda no se envía como dato del formulario. Sin escrituras de negocio ni migraciones.

## Verificación ejecutada

| Control | Resultado y alcance |
| --- | --- |
| Interacciones del componente | **PASS 7/7**, DOM simulado con React y jsdom: un único control cerrado, búsqueda dentro de la lista, selección por clic/teclado, cambio nativo y FormData correctos, exclusión de la propia categoría, conservación y limpieza del padre, validación requerida, fieldset deshabilitado, error/reintento/sin coincidencias/más resultados, respuesta obsoleta ignorada y cierre al salir del control. |
| Posición calculada | **PASS en DOM simulado**: un viewport de 320 px limita el panel a 296 px y 12 px de margen; abre hacia arriba cuando corresponde. No demuestra el renderizado responsive real. |
| TypeScript | **PASS**, `npx tsc --noEmit --incremental false`. |
| ESLint global | **PASS**, `npm run lint`, sin errores ni advertencias finales. |
| Compilación | **PASS**, build aislado Next 15.5.27, exit 0. No se reemplazó el `.next` del servidor de desarrollo. |
| Diff | **PASS**, `git diff --check`. |
| Consulta sin sesión | **PASS HTTP**, `GET /api/admin/lookup?entity=categories&q=Foliar` devuelve 401 y mensaje genérico. No se escribieron datos. |
| Chrome real, screenshots y top layer nativa | **NO EJECUTADO**: `cua.getState()` devuelve cero navegadores y fallo de inicio del control nativo. No se atribuyen a jsdom pruebas visuales, de accesibilidad asistida ni del drawer real. |

La primera ejecución de interacción tuvo un fallo en el arnés: se midió stopPropagation con un listener nativo en el mismo nodo raíz delegado de React. Se corrigió para observar el manejador React superior y comprobar además preventDefault, que evita cerrar el diálogo nativo con Escape. Dos ejecuciones posteriores: 7/7. ESLint detectó después imports CommonJS en el arnés; se convirtió a módulo ESM usando createRequire exclusivamente para cargar/transpilar el TSX. Lint final limpio.

## Repetición acotada

Arnés: `scripts/qa-entity-picker-dom.mjs`. jsdom 26.1.0 se instaló **solo en `/tmp/greenbel-picker-dom-qa`**, como herramienta externa de QA. No se modificaron package.json/package-lock.json ni se añadió una dependencia al producto.

```sh
NODE_PATH=/tmp/greenbel-picker-dom-qa/node_modules node --test scripts/qa-entity-picker-dom.mjs
```

Resultado guardado en `integrated-picker-dom-results.log` junto a esta nota. El mock de Popover API únicamente permite probar eventos/estado; no sustituye comprobar la capa superior del navegador.

## Continuidad

Al estar Chrome disponible: abrir Editar categoría → Categoría superior, escribir «Foliar» en el desplegable y seleccionar con clic y teclado; comprobar que se habilite Guardar cambios; cancelar para no alterar datos reales. Revisar 320/390/820/1440 px, scroll del drawer, teclado virtual y Escape cerrando solo la lista. Las pruebas de escritura previas de categorías siguen siendo evidencia histórica y no se declaran reejecutadas aquí.

Solo cambios locales DEV, sin commit, push, despliegue ni PROD. Correo comercial pausado.

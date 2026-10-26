# Marcas: guardado único y carga visual · 24/10/2026

**Presentación actual:** el editor ahora se superpone como [diálogo lateral](2026-10-24-drawer.md); el guardado único descrito aquí se conserva.

## Objetivo y diagnóstico

Corregir la confusión de guardar nombre y logo por separado; conservar el editor a la derecha, colocar la acción final al pie e implementar una zona de carga como la referencia del usuario.

**Comprobado antes de editar:** DEV tenía ocho marcas activas con `logo_path` vacío y ningún archivo en `brand-logos`. La captura del usuario muestra una imagen seleccionada y el botón «Guardar logotipo» aún separado de «Guardar datos». En el código, seleccionar solo generaba un blob de vista previa; guardar datos no incluía esa selección. No se atribuye ese estado a un fallo de Storage sin evidencia. Las pruebas HTTP anteriores verificaban operaciones separadas, no la experiencia de un único guardado.

## Implementación

- Se mantiene la tabla y el editor lateral. Un solo formulario de nombre/identificador, logotipo y visibilidad; un botón **Guardar cambios al final**. «Cancelar» conserva su propósito.
- Carga con zona de arrastre y botón para abrir el selector, vista previa proporcional, fila con nombre/tamaño, estado «Pendiente de guardar» o «Guardado», descartar selección y retirar logo con opción Deshacer antes de guardar. Límites/formato del servidor conservados.
- El mismo guardado incluye el archivo seleccionado. Muestra la etapa real en curso con un indicador indeterminado, sin porcentajes inventados ni éxito al seleccionar.
- Usa las acciones protegidas existentes para datos/visibilidad y la misma API para el logo. La respuesta de esa API incluye ahora el puntero confirmado, para actualizar la vista previa y reintentos. No modifica tablas, roles, RLS, Auth ni validaciones comerciales; **sin migración nueva**. 024 permanece inmutable y aplicada solo DEV.
- La creación sigue siendo inactiva; la casilla comienza desmarcada. Si el administrador elige mostrarla, se activa después de guardar datos e imagen y confirmar. Una marca existente conserva su estado inicial hasta guardar la elección.
- Son operaciones sucesivas, **no una transacción única de base de datos**: si falla una etapa, informa qué se confirmó, conserva el ID y los datos pendientes y no anuncia éxito completo. Un fallo de logo no activa una marca nueva. Si se confirmó el logo y falla la visibilidad, reintentar no vuelve a subirlo. Un resultado incierto requiere revisar el registro antes de reintentar.
- Estilos locales de marca, controles accesibles, adaptación de tabla/editor, acciones apiladas en móvil con Guardar al final, foco y movimiento reducido. Sin librerías nuevas.

## Verificación

| Ámbito | Estado | Alcance ejecutado |
|---|---|---|
| Local | **PASS: 8** | Cinco regresiones de guardado/archivo/reintento/confirmación y tres de rutas/propiedad de imagen e identificador |
| Local | **PASS** | TypeScript sin emisión, ESLint dirigido sin errores/advertencias, build optimizado aislado exit 0, diff sin errores |
| DEV + HTTP | **PASS: 14** | HTML con un formulario/acción final y zona de carga; controlador real compartido con el editor invoca las acciones autenticadas y API; persiste nombre/logo/visibilidad; Inicio y Nosotros incluyen el `src` con la versión guardada; bytes HTTP coinciden con archivo privado; fallo de imagen no anuncia guardado completo; reintento conserva ID sin duplicar; reemplazo actualiza ambas páginas; desactivar deniega imagen; retirada; acción de cliente denegada; limpieza |
| Visual en navegador | **NO EJECUTADO** | La herramienta sigue sin Chrome: inventario vacío y fallo de inicio del control nativo. No se ejecutaron clic/arrastre/selector real, teclado, vista previa hidratada, navegación cliente/caché, anchos responsive ni capturas. HTTP/controlador/compilación no sustituyen estas comprobaciones |

Evidencia: [DEV/HTTP](unified-save-verification.json), [local](single-save-local-verification.json), [conteos finales](single-save-final-counts.json), `tests/brand-save.test.mjs`.

La primera ejecución del arnés nuevo falló al recortar a 40 los 42 caracteres del ID compilado de una acción de Next. Se corrigió el lector del arnés y se repitió el recorrido completo: 14 PASS, sin fallos abiertos del controlador/HTTP. La limpieza se ejecutó también tras aquel fallo; no se modificaron cuentas ni marcas reales.

Se conservan ocho marcas, 116 productos, tres perfiles y tres roles; cero imágenes o cuentas QA pendientes. El script compara filas preexistentes antes/después, además de los conteos. Los logs y contraseñas temporales no se publican. Correos de negocio pausados y configuración Auth intacta.

## Uso personal

1. Recargar `/admin/catalogo?view=brands` para cargar el editor actualizado y editar la marca deseada.
2. Volver a seleccionar la imagen: una selección local anterior no era un archivo guardado. Arrastrar o usar «selecciona una imagen»; debe indicar **Pendiente de guardar**.
3. Revisar «Mostrar esta marca en el sitio». Para una marca ya activa no hace falta volver a activarla.
4. Pulsar **Guardar cambios**, al final. Esperar la confirmación completa; si falla una etapa, leer el mensaje y conservar la selección para corregir/reintentar.
5. Abrir Inicio y Nosotros. Una marca activa con imagen guardada debe entregar su logo; una inactiva no aparece. No se cargó automáticamente un logo comercial ni se alteró Futureco para las pruebas.

Para repetir solo este bloque, con servidor local DEV activo:

```bash
node --env-file=.env scripts/dev-brands-qa.mjs --unified-save http://localhost:3000
node --test tests/brand-save.test.mjs tests/brand-logo.test.mjs
```

**Reanudación:** conectar Chrome a la herramienta y verificar este formulario con archivo real, teclado, errores, confirmaciones, navegación a Inicio/Nosotros sin recarga forzada y anchos 320/390/820/1440 px. Sin rehacer migraciones ni repetir checkout. Sin PROD, cobros, correos, commit, push o despliegue.

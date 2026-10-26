# Eliminar capacitación con confirmación · completado en DEV · 25/10/2026

## Resultado

Botón **Eliminar** junto a **Editar**. Modal nativo con título del registro, aviso de borrado irreversible de video/portada/votos/asociaciones y botones Cancelar/Eliminar capacitación. Cancelar y Escape no envían la acción; foco inicial en Cancelar y restauración al botón de origen. Durante la operación se bloquean los botones y los envíos duplicados. Un error conserva la fila y el modal; tras confirmar éxito se retira la fila, se avisa y se actualizan lista/promedios.

La Server Action exige UUID/título y confirmación explícita, comprueba administrador activo y obtiene el actor de Auth. La RPC vuelve a validar rol/cuenta, bloquea el registro y elimina únicamente su capacitación, calificaciones y enlaces en una transacción. No elimina productos/categorías maestros. Tras confirmar el borrado, la acción elimina solamente las rutas de video/portada pertenecientes a esa capacitación. Storage y PostgreSQL no comparten transacción: si falla limpiar un archivo, se comunica limpieza pendiente sin anunciar que ese archivo se eliminó.

## Autorización y migraciones

El usuario solicitó **«termina donde te quedaste por favor»** después de recibir la propuesta concreta de la operación/migración 026 y de informarle que ese era el único paso pendiente. Se continuó exclusivamente con ese alcance DEV. Modelo 025 existente preservado; no se añadieron tablas/columnas ni se cambiaron FK o RLS.

- **026 aplicada solo DEV:** nueva RPC `admin_delete_training(uuid,text,uuid)`, SECURITY INVOKER, ejecución exclusiva de service_role, autorización y transacción acotadas.
- **027 aplicada solo DEV:** corrección del código de conflicto de esa misma RPC. La 026 aplicada se conservó inmutable.
- **Paridad 27/27 y permisos PASS:** `2026-10-25-delete-migration-verification.json`. Anónimo/autenticado no ejecutan la RPC; service_role sí. No quedan consultas de eliminación activas.

## Fallos observados y corregidos

Las dos primeras pruebas terminaron por timeout al comprobar un título obsoleto. Una tercera prueba aisló el mismo problema llamando directamente a la RPC, sin pasar por Next: el SQLSTATE `40001` de la 026 se interpretaba como fallo transitorio y PostgREST reintentaba. Se confirmó con documentación primaria de Supabase. La 027 cambia ese conflicto comercial a `PT409`, conservando validación y rollback. La misma llamada que agotaba 12 segundos respondió luego en **126 ms** y también pasó la comprobación mediante Server Action. Se preservaron los logs fallidos `delete-first-*`, `delete-second-*` y `delete-direct-diagnosis-*`; cada ejecución retiró sus fixtures y confirmó el baseline anterior intacto.

La siguiente ejecución completó borrado real y limpieza de archivos, pero su verificador esperaba HTTP 404 en el HTML de detalle. Next devolvió HTTP 200 con estado not-found/noindex y sin reproductor ni URL del video, conforme al streaming documentado. Se corrigió el verificador para exigir ese estado real y ausencia del contenido; las dos rutas de bytes siguen exigiendo HTTP 404. Esa ejecución fallida se conserva como `delete-streaming-check-*`. La repetición completa final pasa.

## Evidencia final

| Comprobación | Resultado |
| --- | --- |
| DEV + HTTP | **27 PASS**, `2026-10-25-delete-http.log` y `delete-http-verification.json`. Fixture con video MP4 real, portada, voto y asociaciones; eliminación total, permisos de anónimo/cliente/operador/inactivo, RPC directa restringida, confirmación explícita, título obsoleto sin pérdida de datos, actualización de promedio/cantidad, maestros conservados, contenido retirado, repetición y limpieza. |
| React DOM simulado | **12 PASS**, `delete-dom.log`; cancelar/Escape/foco, bloqueo de doble envío, error/reintento y retirada solo tras éxito; conserva las nueve verificaciones de carga/editor/calificaciones. |
| Server Action con dependencias controladas | **5 PASS**, `delete-unit.log`; autorización, confirmación, conflicto, identidad de sesión, respuesta inesperada y limpieza posterior de archivos propios. |
| Chrome real | **PASS** apertura/cancelar/Escape, Tab y Shift+Tab, foco inicial/restaurado. Modal completo sin desbordamiento a **389×844**, **820×1024**, **1440×900 CSS px**; botones móviles 44 px. Medidas en `delete-responsive.json`, capturas mobile/tablet/confirmation. Vista inicial natural de escritorio también revisada. |
| Gates locales | **PASS** TypeScript, ESLint, Prettier, diff y build aislado exit 0 (`delete-{types,lint,format,build}.log`). No se reemplazó .next activo. |
| Datos y limpieza | **PASS**, `delete-cleanup.json`: cero capacitaciones QA y diario pendiente; registro real del usuario con portada/video/voto conservados. El script comparó el estado anterior completo y confirmó que permanece idéntico. |

Chrome conservaba un zoom que hizo que la primera solicitud de viewport 390 mostrara **520 CSS px**. Ese intento está identificado como `delete-520-initial.png`; no se declara como prueba de 390. Se ajustó el tamaño y se midieron realmente 389 CSS px. El viewport temporal se restableció al terminar.

**Límite de la verificación:** el borrado confirmado se ejecutó por HTTP con fixtures propias. En el Chrome del usuario solo se abrió y canceló el modal de su registro real; no se pulsó Eliminar capacitación. No se borró ese registro. Tampoco se afirman pruebas en dispositivos físicos ni zoom 200 %.

## Continuidad

Eliminación operativa en DEV. El panel del usuario se actualizó, muestra su única capacitación real y quedó con el modal cerrado. Sin trabajo pendiente del alcance solicitado. Sin PROD, correos, cobros, commit/push o despliegue. Correos comerciales continúan pausados.

Fuentes primarias del diagnóstico: [Supabase: 40001 y reintentos](https://github.com/orgs/supabase/discussions/50151), [Next.js: not-found y respuestas con streaming](https://nextjs.org/docs/app/api-reference/file-conventions/not-found).

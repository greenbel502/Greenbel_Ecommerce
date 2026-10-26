# Capacitaciones implementadas · 25/10/2026

## Alcance y estado

Copia activa `/Users/diederichsolis/Desktop/Greenbel_Ecommerce`, rama `dev`, base `0644f86`. Cambios previos conservados. La ampliación de modelo y migración 025 recibió aprobación explícita del usuario antes de crear/aplicar SQL. Implementación y verificaciones de servidor/componentes completadas; revisión visual en navegador real pendiente por indisponibilidad de la conexión nativa.

## Diagnóstico inicial

La biblioteca y el detalle públicos ya existían, con video HTTPS externo y portadas privadas. El editor administrativo mezclaba un formulario desplegable, selección adicional de registro y operaciones separadas; no admitía adjuntar archivos de video. No existían calificaciones de capacitación. Las reseñas de productos con compra entregada son una función independiente y se conservaron.

## Cambios reales

### Cliente

- `/capacitaciones`: tarjetas con portada 16:9, título, descripción breve, promedio real y acceso al detalle. Búsqueda por título/descripción y paginación de doce videos; conserva la búsqueda, limita consultas y ajusta páginas fuera de rango.
- `/capacitaciones/[slug]`: reproductor con portada, título, descripción completa y productos relacionados existentes. Archivos privados MP4/WebM se entregan mediante la ruta controlada; YouTube/Vimeo usan reproductores integrados tras pulsar Reproducir; otros enlaces HTTPS conservan acceso al origen.
- Cinco estrellas mediante controles de radio etiquetados. La persona inicia sesión con una cuenta activa para calificar; puede actualizar su voto. La identidad se obtiene de Auth, no de un campo enviado por el navegador. Los resultados se guardan y no se simulan.
- Promedios con estrellas parciales, valor numérico y cantidad de votos. Sin votos se muestra «Sin calificaciones»; un error del servicio se distingue de un promedio vacío.

### Administración

- `/admin/capacitaciones`: listado con miniaturas, estado, promedio individual y acciones Editar/Ver. Creación y edición en el mismo diálogo lateral que catálogo, con apertura local inmediata y lectura específica de asociaciones, timeout y Reintentar.
- Un botón principal final guarda título, descripción, portada, video y publicación. El enlace se genera automáticamente y no cambia al renombrar. La carga de portada/video ofrece selección y arrastre, previsualización y estado del archivo.
- Los registros nuevos se crean en borrador antes de adjuntar medios y se publican al completar las etapas necesarias. Un fallo de portada conserva el ID creado y la selección para reintentar sin duplicar el registro ni subir otra vez un video ya confirmado. Las asociaciones conservan sus acciones explícitas y no se anuncian como parte de un guardado global ficticio.
- Video directo a Storage mediante TUS en fragmentos de 6 MiB, autorización temporal, progreso confirmado y recuperación del offset dentro de la carga. Límite configurado: 50 000 000 bytes, MP4/WebM. Las cargas completas se validan por metadatos y firma antes de vincularlas; no se incorpora un transcodificador ni se afirma verificación de todos los códecs.
- `/admin`: nuevo resumen de calificaciones; el módulo muestra además promedio global, votos y número de capacitaciones valoradas. El promedio global pondera votos individuales, no promedios de promedios.

### Persistencia y protección

Migración **025 aplicada en DEV**: bucket privado `training-videos`, publicación con una única fuente válida entre las dos columnas existentes, rutas de archivo limitadas a su capacitación y tabla `training_ratings` con clave capacitación/cuenta. RLS, privilegios de columnas y trigger protegen propietario, cuenta activa, rango entero 1–5 y publicación vigente. La agregación pública no expone usuarios ni votos individuales; las vistas administrativas están reservadas al servicio y sus rutas comprueban administrador activo.

La entrega de video comprueba publicación o permiso administrativo en cada solicitud y admite rangos de bytes. Confirmaciones repetidas o concurrentes no eliminan el archivo ganador. Reemplazos obsoletos se rechazan. No se abrió acceso público al bucket, ni se alteraron roles, carrito, precios, inventario, checkout o reseñas de compras. No se activó correo comercial.

## Validación ejecutada

| Comprobación | Resultado y evidencia |
| --- | --- |
| Flujo DEV/HTTP y base | **67 PASS**, `2026-10-25-http-verification.json` y `2026-10-25-http.log`. Alta/edición/publicación, portada, carga TUS real de MP4 de 1 128 375 bytes, CORS de carga, lectura privada/pública, rangos y bytes, autorización, RLS A/B, valores inválidos, promedios conocidos, actualización sin duplicar votos, agregación ponderada, panel/Inicio, búsqueda, trece resultados y dos páginas, archivos falsos, reemplazo obsoleto, confirmación concurrente y asociaciones. |
| Componentes React en DOM simulado | **8 PASS**, `2026-10-25-dom.log`: cinco opciones, guardado/edición y error de calificación, bloqueo de duplicados pendientes, visitante, botón final/formularios, secuencia de medios y publicación, recuperación de portada sin duplicados, apertura/reintento de editor conservando campos y reproducción de embed tras clic. |
| Lector/carga de medios | **4 PASS**, `2026-10-25-unit.log`: fuentes y hosts permitidos, firmas/rutas, reanudación tras perder una respuesta y parada tras fallos acotados. Incluye fragmentos de 6 MiB en prueba controlada; no se presenta como transferencia real de 50 MB. |
| Migración | **PASS**, `2026-10-25-migration.log` y `2026-10-25-migration-history.json`: dry-run contenía únicamente 025; aplicación y paridad local/remota DEV comprobadas. |
| Gates locales | **PASS**: TypeScript, ESLint, Prettier, diff y build aislado exit 0. Logs `types.log`, `lint.log`, `format.log`, `2026-10-25-build.log`. La copia de build no sustituyó `.next` del servidor activo. |
| Limpieza | **PASS**: fixtures/cuentas/portadas/videos de la ejecución final retirados y comparación del estado comercial previo idéntica. Verificación posterior: cero capacitaciones QA, cero objetos/carpetas de video y ningún diario de limpieza pendiente (`2026-10-25-cleanup-verification.json`). Sin nuevos actores de auditoría retenidos. |

Comandos: `node --env-file=.env scripts/dev-trainings-qa.mjs`, `NODE_PATH=/tmp/greenbel-picker-dom-qa/node_modules node --test scripts/qa-training-dom.mjs`, `node --test tests/training-media.test.mjs`, `npx tsc --noEmit --incremental false`, `npm run lint`, Prettier y build aislado. No se agregaron dependencias de aplicación; jsdom continúa exclusivamente en `/tmp`.

## Fallos observados y corregidos durante QA

- La primera transferencia usó el endpoint TUS general y fue rechazada. Se corrigió a **`/storage/v1/upload/resumable/sign`**, conforme al ejemplo oficial de Supabase; después pasó la carga real sin ampliar políticas de Storage. Ejecución inicial conservada en `2026-10-25-http-first.*`.
- Se detectó que React podía restablecer el radio nativo después de un resultado de error. La selección controlada y el valor enviado ahora se mantienen sincronizados; la prueba fallida queda en `2026-10-25-dom-first.log` y su repetición final pasa.
- Una ejecución sufrió `fetch failed` por conexión local, con limpieza exitosa; se conservó como `2026-10-25-http-interrupted.*`. No se convirtió en un PASS.
- La primera aserción de paginación buscaba texto continuo en HTML con comentarios de hidratación intercalados. Se corrigió el verificador para leer el texto sin esos comentarios y se repitió con trece registros reales. Esa ejecución tuvo además un fallo transitorio de limpieza: se completó después con `--cleanup` antes de iniciar otra ejecución. El registro fallido se conserva en `2026-10-25-http-pagination-check.*`; la ejecución final pasó limpieza y comparación completa.
- La primera comprobación de historial no contemplaba los backticks que incluye el CLI. Se corrigió el lector; 025 está presente tanto localmente como en DEV.

## Responsive, accesibilidad y límites reales

CSS preparado para una columna móvil, dos en tablet y tres/cuatro en escritorio; tablas con desplazamiento contenido, diálogo de ancho limitado al viewport, textos extensos con ajuste, controles de 44 px y reducción de movimiento. Colores centralizados existentes de GreenBel; título/jerarquía coherentes y alternativas textuales para estados y estrellas. **Esto es implementación/revisión de CSS, no prueba visual ejecutada en esos anchos.**

**NO EJECUTADO:** capturas y medición visual a 320/390/820/1440 px, zoom 200 %, teclado/foco nativo del diálogo y reproducción decodificada en Chrome/dispositivos reales. `cua.getState()` devolvió apps/navegadores vacíos y `Sky Computer Use native pipe startup failed`. Los tests DOM no certifican top layer, geometría, códecs o reproducción real. La carga, persistencia y entrega de bytes/rangos sí están verificadas.

El video utilizado en QA procede del ejemplo público de MDN, se usó solo como fixture y se retiró de DEV. No se cargaron capacitaciones comerciales inventadas. Los videos y portadas definitivos deben ser aportados/publicados por GreenBel desde **Nueva capacitación**.

## Continuidad

1. Revisar visualmente biblioteca, detalle, estrellas y diálogo en Chrome conectado, móvil/tablet/escritorio y zoom 200 %; probar reproducción, pausa y avance con los videos definitivos.
2. Mantener la migración 025 aplicada inmutable. Cualquier promoción a PROD exige autorización e historial propio; no se publicó Git ni se desplegó.
3. Mantener correo comercial deshabilitado. La demora pública de productos documentada en la iteración anterior y la tipografía Mont licenciada pendiente conservan su estado; no se presentan como resueltas por este módulo.

Fuentes técnicas: [TUS con autorizaciones firmadas de Supabase](https://github.com/supabase/supabase/tree/master/examples/storage/resumable-upload-signed-uppy), [límites de archivos](https://supabase.com/docs/guides/storage/uploads/file-limits), [ejemplo de video MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video).

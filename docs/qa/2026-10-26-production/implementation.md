# Gmail y presentación de producción

26/10/2026 · Proyecto PROD autorizado: `mlukdwahxggofraunbfw`; dominio `https://www.greenbel.store`.

## Diagnóstico y resultado del correo

Las cuatro primeras consultas quedaron persistidas como `not_sent`, sin intentos ni registros de notificación, porque no había una cuenta Gmail autorizada en PROD. El formulario confirmó correctamente el registro; no acreditó envío. El permiso agregado en Google Cloud no sustituye el consentimiento de la cuenta desde Administración → Consultas.

El usuario completó esa autorización y confirmó recepción. La lectura posterior de PROD mostró conexión `connected` y una consulta nueva `sent`, con identificador de aceptación de Gmail, un intento y ningún error. No se consultaron ni imprimieron tokens; no se alteraron las cuatro consultas anteriores ni se enviaron registros históricos. El agente no generó otra consulta ni otro correo para esta comprobación.

El panel explica ahora que las consultas se guardan aunque Gmail no esté conectado y muestra la acción necesaria para autorizarlo. El aviso externo «Google no verificó esta app» pertenece al estado OAuth de Google Cloud; no se elimina con CSS ni cambiando el nombre del cliente a PROD. [Referencia oficial](https://support.google.com/cloud/answer/7454865?hl=en).

## Cambios de presentación y datos públicos

- Encabezado administrativo: la etiqueta DEV depende del ambiente real seleccionado en servidor y desaparece en PROD.
- Pie normal y compacto: eliminado «Ecommerce demostrativo».
- Inicio administrativo y lista de pedidos: descripciones neutrales y coherentes con los módulos vigentes; se conservan avisos veraces si un registro de pago es realmente simulado. Los módulos comerciales pausados siguen inhabilitados.
- Financiamiento: texto actualizado al flujo con cuenta, sin afirmar que sigue requiriendo OTP.
- Demo interna: `/loader-demo` devuelve 404 en PROD antes de transmitir HTML, con `noindex`; continúa disponible en DEV. Las páginas legales temporales ya estaban restringidas a DEV.
- El buscador general importaba fixtures de forma incondicional. Ahora consulta `/api/catalog/search`, que reutiliza el repositorio oficial, RLS anónimo y precio efectivo. Máximo seis resúmenes públicos; consulta de hasta 120 caracteres, cancelación de solicitudes anteriores, espera breve al escribir, estados de carga/error/vacío y ningún fallback ficticio. Los resultados de demostración se excluyen de PROD.

No se modifican autenticación, reglas de compra, inventario, precios, permisos, esquema ni migraciones. No se vuelve a autorizar Gmail al publicar estos cambios.

## Verificación antes de publicar

- PASS: 166 pruebas automatizadas; dos nuevas comprueban proyección acotada, precios y exclusión de fixtures del buscador en PROD.
- PASS: TypeScript, ESLint de los archivos modificados, diff y build Next.js de producción en checkout aislado. Se regeneraron tipos de rutas tras agregar el endpoint; el servidor local del usuario se conservó.
- PASS: comprobaciones HTTP de SEO sobre el build optimizado, incluido 404 real de la demo, sitemap, canonical e imagen social.
- PASS: búsqueda inicial, búsqueda de FUT1023, ausencia de resultados, entradas largas/duplicadas y pie de página normal/compacto. Todos los IDs y precios devueltos coincidieron con lecturas anónimas de `catalog_products` en PROD.
- Pendiente en esta nota previa al despliegue: verificar visualmente el encabezado autenticado y el buscador en el dominio publicado. El envío y la recepción del correo sí se confirmaron por persistencia y por el usuario antes del despliegue.

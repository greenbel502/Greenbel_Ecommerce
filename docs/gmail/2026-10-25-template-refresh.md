# Renovación de correo y simplificación del contacto · 25/10/2026

**Completado en DEV, con recepción real en Gmail.** Se retiró «Producto o código» del formulario y del payload que envía. Tipo de consulta ocupa ahora todo el ancho. Se conservan validación, honeypot, idempotencia, guardado y confirmación existentes.

## Nueva presentación

La referencia aportada por el usuario orientó la jerarquía y la distribución, usando la identidad oficial de GreenBel: cabecera beige, logotipo original, título destacado, acento verde, mensaje en un bloque propio, datos de respuesta con separadores y pie verde oscuro con acción de respuesta.

Se usa el logotipo horizontal extraído previamente del manual, convertido proporcionalmente a PNG 552×104, mostrado a 184 px. Va incrustado como recurso MIME CID dentro de multipart/related; no depende de localhost ni de un host de imágenes. La alternativa de texto sigue disponible. El remitente, destinatario, Reply-To y el identificador estable permanecen iguales.

Las tablas de presentación y los estilos inline mantienen una base sencilla para clientes de correo; una media query ajusta título, espaciado y datos en pantallas pequeñas. [Soporte CSS documentado por Gmail](https://developers.google.com/workspace/gmail/design/css). No se usa una fuente remota.

El enlace «Responder al cliente» abre mailto con el correo validado y un asunto fijo. También se mantiene la respuesta normal de Gmail mediante Reply-To. No se envió ninguna respuesta durante QA.

El campo opcional product se conserva en el contrato de servidor/base para compatibilidad e información histórica; la UI nueva no lo envía y se guarda null. No se borraron valores anteriores. La plantilla omite la fila cuando no hay producto y conserva el dato si se reintenta legítimamente una consulta anterior que lo tenga.

## Archivos

- src/presentation/components/contact-form.tsx: eliminar campo, esquema de UI, payload y reset; ampliar Tipo de consulta.
- src/lib/gmail/contact-template.ts: renderer HTML/texto separado de la construcción MIME.
- src/lib/gmail/message.ts: multipart/related e imagen CID; encabezados y validaciones conservados.
- public/images/brand/greenbel-email.png: conversión del arte oficial existente, sin redibujar.
- tests/gmail.test.mjs: comprobar imagen MIME, ausencia de fila vacía, saltos de línea, escape y registro sin producto.
- Documentación y evidencias en esta carpeta y GREENBEL_AVANCE.md.

No se modificaron esquema, migraciones, APIs de registro, OAuth, estados de notificación, catálogo, carrito ni otros formularios. No se agregaron variables ni dependencias.

## Comprobaciones ejecutadas

| Verificación                                                      | Resultado                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Suite Gmail ampliada                                              | **22/22 PASS**; [log](2026-10-25-template-unit.log).                                                                                                   |
| TypeScript, ESLint acotado, Prettier y diff                       | **PASS**.                                                                                                                                              |
| Build optimizado aislado                                          | **PASS, exit 0**; [log](2026-10-25-template-build.log).                                                                                                |
| Asset PNG en tracing de funciones                                 | **PASS**; [resultado](2026-10-25-template-trace.json). Esto comprueba empaquetado local, no despliegue Vercel.                                         |
| Formulario real de Chrome sin sesión                              | **PASS**, confirmación tras guardado, product=null, un intento Gmail.                                                                                  |
| Recepción real y logotipo incrustado                              | **PASS**, correo en Recibidos de greenbel502@gmail.com, logo visible, texto completo y sin fila Producto. Reply-To del cliente comprobado en detalles. |
| Formulario a 389/820/1440 CSS px                                  | **PASS**, cinco campos visibles, Tipo de consulta a todo el ancho y sin desbordamiento; [medidas](2026-10-25-contact-form-responsive.json).            |
| HTML del renderer a 360/390/640 CSS px                            | **PASS**, logo, contenido y acción visibles; [medidas](2026-10-25-template-responsive.json).                                                           |
| Nombre/correo largos y mensaje de casi 5000 caracteres a 360 px   | **PASS**, sin desbordamiento horizontal.                                                                                                               |
| Limpieza                                                          | **PASS**, solo consulta/job propios eliminados; otras consultas y conexión Gmail idénticas. El correo de evidencia se conserva.                        |
| Dispositivo físico, Gmail móvil nativo, Outlook/Apple Mail y PROD | **NO EJECUTADO**. Gmail web de escritorio sí fue observado; los tamaños móviles son del HTML real del renderer en Chrome.                              |

La primera ejecución del test nuevo falló por un nombre de fixture incorrecto del propio test; se corrigió y las 22 pruebas finales pasaron. No se trataba de un fallo del envío.

Prueba real: consulta a30e283d-4b43-4a7f-b052-cdfa0a206f7c, mensaje Gmail 1a175fc8817ec544, asunto «Greenbel | Nueva consulta de QA diseño GreenBel 38c77869», el 25/10/2026 a las 20:14 de Guatemala. [Registro de verificación y limpieza](2026-10-25-template-real-send.json).

Capturas: [Gmail recibido](2026-10-25-template-gmail.png), [pie en Gmail](2026-10-25-template-gmail-footer.png), [HTML móvil 390 px](2026-10-25-template-390.png), [HTML 640 px](2026-10-25-template-640.png), [formulario 1440 px](2026-10-25-contact-form-1440.png). Las vistas HTML de ejemplo usan datos ficticios y el mismo renderer; no se presentan como otra recepción Gmail.

## Continuidad

Los siguientes mensajes usan la nueva plantilla; los correos ya recibidos no cambian. No se reenviaron consultas históricas. Viewport restablecido, servidor temporal de preview detenido y servidor principal del usuario conservado. Sin commit, push, despliegue ni cambios PROD. Las condiciones OAuth de Testing y pendientes de producción de la integración original permanecen.

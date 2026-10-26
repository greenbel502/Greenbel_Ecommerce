# Contactos administrables y compra por WhatsApp · 25/10/2026

Estado: **implementado y comprobado en DEV**. Repositorio `Greenbel_Ecommerce`, rama `dev`. Sin commit, push, despliegue ni cambios PROD. El envío comercial de correos sigue pausado.

## Resultado y uso

En **Administración → Configuración → Contacto** hay dos apartados, GreenBel y Cooperativa, cada uno con teléfonos y correos. Permiten agregar, editar y eliminar. El editor aparece como panel superpuesto a la derecha, con Guardar al final. Eliminar requiere un modal de confirmación; Cancelar y Escape conservan el contacto.

Para habilitar la compra, agregar el número oficial de GreenBel con código de país, marcar **Usar para las compras por WhatsApp** y guardar. Existe un solo principal por empresa/tipo. Elegir otro principal sustituye la selección anterior; eliminarlo deja el canal sin configurar y no elige un destinatario distinto automáticamente.

El número y el correo principales de GreenBel alimentan Contacto y el pie de página. Los contactos de la cooperativa permanecen en administración. Guardarlos no envía correos ni solicitudes de financiamiento. **No quedó cargado ningún número ficticio**: los contactos temporales usados en QA fueron retirados. Falta que el administrador registre los datos oficiales.

El carrito tiene una sola opción de compra: **Comprar por WhatsApp**. Abre el modal que indica que se descargará el PDF y pide adjuntarlo al mensaje. Preparar el documento no abre WhatsApp ni inicia una descarga. **Continuar** inicia la descarga y abre el enlace de WhatsApp en la misma interacción. Incluye opciones para repetir la descarga o abrir el chat si el navegador limita alguna acción. Cancelar no descarga ni abre el chat; el carrito conserva su selección.

El PDF contiene productos, códigos, cantidades, precios actuales y subtotal. El servidor calcula los importes desde el catálogo público; no acepta precios enviados por el navegador. Usa el logotipo oficial y la paleta GreenBel, con encabezados y pies por página. Es una solicitud para atención: no genera factura, pedido, pago, reserva ni cotización persistida. Entrega, existencias y pago quedan por confirmar con el asesor. El PDF se adjunta manualmente y el mensaje lo envía el usuario.

Se permite seleccionar productos publicados con precio y existencia por confirmar para consultar al asesor; agotados y productos sin precio mantienen su restricción. Se conservan los límites técnicos existentes del carrito (50 referencias, 999 unidades por referencia) y la validación de existencia conocida. Las reseñas mantienen su validación de compra entregada registrada: abrir WhatsApp no acredita una entrega.

## Persistencia y límites técnicos

- Se reutiliza `site_content`, clave `contact`, **borrador privado**, payload tipado versión 1. No hubo migración ni tabla nueva. La fila inexistente representa una configuración vacía. Un contenido previo incompatible se rechaza y no se sobrescribe.
- Acciones exclusivas de administrador activo, actor obtenido del servidor, validación de número/correo, duplicados y concurrencia mediante `updated_at`. Solo se serializa la proyección pública de GreenBel, nunca el payload de cooperativa.
- `/api/cart/whatsapp/pdf`: JSON limitado, origen permitido, catálogo publicado y precios de servidor; respuestas sin caché, errores controlados cuando cambia la selección o no hay destino configurado.
- `/checkout` redirige al carrito. Las cuatro entradas GET/POST de las APIs de checkout responden 410 antes de procesar compras. La interfaz administrativa impide reactivar el simulador mientras dure esta fase.
- En DEV se pausó la política existente: `online_reservation_minutes=NULL`, `offline_review_hours=NULL`, `simulated_gateway_enabled=false`. Las RPC existentes ya cierran ambos caminos sin esos plazos. Respaldo anterior privado en `~/.codex/private/greenbel-whatsapp/checkout-policy-before-whatsapp.json`; evidencia pública sin secretos en `2026-10-25-whatsapp-checkout-policy.json`. No se modificaron pedidos, pagos ni existencias con este cambio.
- Footer se compone desde el layout del servidor y pasa su vista al contenedor cliente. Así el lector privado de contactos no entra en el código cliente.

## Comprobaciones realizadas

| Verificación | Resultado y evidencia |
| --- | --- |
| DEV/HTTP y permisos | **PASS 24/24**, `2026-10-25-whatsapp-http-verification.json`. Alta/edición/eliminación de contactos, número normalizado, control de revisión, rechazo de anónimo/cliente/operador, privacidad de cooperativa, PDF real, precios/cantidades, cambio de destino, falta de principal, cierre de APIs y política DB. |
| Componentes y modelo | **PASS 8/8**, `scripts/qa-whatsapp-dom.mjs` y `2026-10-25-whatsapp-dom.log`. Cancelar/abortar, Continuar y descarga única, doble clic, reintento, errores, restricciones, editor y confirmación de eliminación. |
| Chrome real | **PASS**: agregar dos referencias, cambiar cantidad, abrir modal, Continuar descargó `Seleccion-GreenBel-GB-72C3FFA6.pdf` y abrió una pestaña de WhatsApp al número temporal configurado. Carrito conservado: 2 MDK-56 + 1 KAWA, Q9,450.00. Se cerró la pestaña externa sin enviar. Archivo real comprobado en Downloads y copia de QA en `output/pdf/seleccion-greenbel-navegador-qa.pdf`. |
| Editor/teclado | **PASS**: abrir editor, guardar al final visible, abrir y cancelar eliminación; Escape cierra el editor y devuelve foco a Agregar. La página quedó abierta sin contactos ficticios. |
| Responsive | **PASS en Chrome con viewport** a **389×844, 820×1024 y 1440×900 CSS px**. Listado de contactos y modal del carrito sin desbordamiento horizontal; editor móvil ocupa la pantalla y conserva Guardar visible. JSON y PNG en este directorio. Las capturas del carrito en esos tamaños documentan también el error controlado al faltar el número. No son pruebas en dispositivos físicos. |
| PDF y paginación | **PASS**: PDF nativo de una página, referencia/códigos/cantidades/subtotal extraídos con pypdf. Estrés de 50 referencias con nombres largos y 999 unidades: siete páginas, 50 códigos presentes, subtotal Q616,666,216.50, encabezados/pies completos. Las siete páginas se renderizaron e inspeccionaron visualmente, además del PDF nativo. Evidencia `2026-10-25-whatsapp-pdf.json`; renders en `tmp/pdfs/`. |
| Compilación | **PASS** TypeScript, ESLint sin advertencias, Prettier de archivos afectados y `git diff --check`. Build Next 15.5.27 aislado **exit 0**, sin reemplazar `.next` del servidor del usuario. Logs en este directorio. |
| Limpieza y conservación | **PASS**: cuentas y contactos efímeros propios retirados. Comparación antes/después idéntica en pedidos/líneas/pagos/reservas/inventario/cotizaciones/financiamiento/consultas/reseñas/productos/marcas/categorías. No se vació el carrito del usuario de localhost:3000: QA usó un origen local separado. |

Los primeros intentos detectaron un límite servidor/cliente en Footer, corregido con composición desde el layout. Otro FAIL correspondía al verificador: Next transmitía la redirección como meta refresh con HTTP 200; se ajustó la comprobación a esa respuesta válida, además de 307/308, y se confirmó la navegación al carrito en Chrome. Las ejecuciones iniciales se conservan como evidencia. El proceso DOM retenía un temporizador de limpieza de Blob durante 60 s: el harness libera solo ese temporizador; el comportamiento del navegador no se cambió.

**NO EJECUTADO:** envío de mensajes/PDF a una persona, pago real, correos comerciales, PROD, publicación Git, Safari/iOS/Android físicos. WhatsApp no permite adjuntar este PDF automáticamente mediante el enlace; el usuario lo adjunta como indica el modal. Referencia del enlace: [documentación oficial de WhatsApp](https://faq.whatsapp.com/5913398998672934).

## Archivos principales y continuidad

- `src/app/admin/contacto/`: página, editor, estilos y acciones.
- `src/lib/contacts/model.ts`, `src/lib/server/contact-settings.ts`: contrato privado y proyección pública.
- `src/domain/cart/whatsapp-selection.ts`, `src/lib/pdf/whatsapp-selection-pdf.ts`, `src/app/api/cart/whatsapp/pdf/route.ts`: selección y documento.
- `src/presentation/components/whatsapp-purchase.*`, `cart-view.tsx`: modal y compra del carrito.
- `src/lib/commerce/policy.ts`, rutas checkout y administración de entregas: pausa del checkout anterior.
- `footer.tsx`, `footer-view.tsx`, `site-frame.tsx`, layout y página Contacto: lectura y presentación pública.

Siguiente paso operativo: cargar los teléfonos/correos oficiales en Contacto. No requiere modificar código ni variables de entorno. Para volver a habilitar pagos web se necesita una nueva decisión explícita; no basta con cambiar un ajuste desde el panel. Mantener las migraciones 001–027 y el trabajo previo. El servidor QA 3002 se detuvo y el viewport de Chrome se restableció; el servidor del usuario 3000 sigue funcionando.

# Total, sesión y preferencias de compra por WhatsApp · 25/10/2026

**Completado en DEV.** El usuario confirmó que la sesión es obligatoria solo para comprar por WhatsApp; Contacto conserva su acceso anónimo. También confirmó estas opciones: efectivo/transferencia y retiro/envío a domicilio, únicamente para adjuntarlas al mensaje.

## Comportamiento actual

- El total de productos suma precio unitario × cantidad de cada línea, calculado en centavos. Q83.25 × 2 = Q166.50; × 3 = Q249.75. Un producto sin precio deja el importe pendiente, sin inventar Q0.
- El costo de envío se muestra separado, Por coordinar. No se suma una tarifa inexistente ni se presenta como entrega gratuita.
- El visitante puede preparar su carrito, pero debe ingresar o crear una cuenta para continuar por WhatsApp. El enlace de acceso reutiliza el retorno de compra existente /checkout, que en esta fase redirige a /carrito, conservando la selección local.
- La UI comprueba la sesión mediante /api/account/session y la actualiza al recuperar foco. El endpoint PDF comprueba nuevamente la identidad y el perfil activo en servidor; 401 sin sesión, 403 para cuenta inactiva y 503 si no puede verificarla.
- Una cuenta activa debe seleccionar ambas preferencias. El mensaje de WhatsApp y el PDF incluyen sus etiquetas y el total calculado desde el catálogo del servidor. No se aceptan precios ni identidad elegidos por el navegador.
- El modal conserva la confirmación de descarga/adjunto. Preparar o cancelar no abre el chat ni envía mensajes. No se habilitaron pasarela, pedidos, reservas, entrega operativa ni los módulos administrativos pausados.

No había métodos operativos configurados en las tablas de entregas/pagos. Se incorporaron las cuatro preferencias expresamente confirmadas como una lista tipada compartida, sin crear registros comerciales ni migraciones.

## Archivos

- src/application/use-cases/cartCalculations.ts: cálculo en centavos y total de productos.
- src/presentation/components/cart-view.tsx: importes consistentes y envío separado.
- src/domain/cart/whatsapp-preferences.ts: opciones y validación compartida.
- src/domain/cart/whatsapp-selection.ts: preferencias del documento y texto de WhatsApp con importe.
- src/presentation/components/whatsapp-purchase.tsx y whatsapp-purchase.module.css: sesión, opciones obligatorias, confirmación y recuperación de sesión vencida.
- src/app/api/cart/whatsapp/pdf/route.ts: perfil activo obligatorio y validación de preferencias.
- src/lib/pdf/whatsapp-selection-pdf.ts: preferencias y total de productos en el documento.
- tests/whatsapp-purchase.test.mjs, scripts/qa-whatsapp-dom.mjs y scripts/dev-whatsapp-purchase-qa.mjs: verificaciones.

## Evidencia ejecutada

| Comprobación                                           | Resultado                                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cálculos, validación y endpoint con dobles controlados | **8/8 PASS**; [log](2026-10-25-purchase-unit.log).                                                                                                                                             |
| Componentes reales en jsdom                            | **11/11 PASS**, incluidos invitado, opciones obligatorias, pérdida de sesión, cancelar, doble clic y recuperación; [log](2026-10-25-purchase-dom.log).                                         |
| Supabase/HTTP DEV reales                               | **10/10 PASS**, incluyendo rechazo anónimo/inactivo, PDF autenticado, dos combinaciones y datos de negocio sin cambios; [resultados](2026-10-25-purchase-http.json).                           |
| Chrome con la sesión real ya existente                 | **PASS**, cantidad 2→3→2 e importes correspondientes; opciones obligatorias, foco de error, modal preparado y enlace con total/pago/entrega inspeccionado. No se cambió la sesión del usuario. |
| Carrito y modal a 389/820/1440 CSS px                  | **PASS**, sin desbordamiento horizontal; [medidas](2026-10-25-purchase-responsive.json).                                                                                                       |
| PDF real del endpoint                                  | **PASS**, texto extraído y página renderizada/inspeccionada: Transferencia, Envío a domicilio, 2 × Q83.25 = Q166.50; [captura](2026-10-25-purchase-pdf.png).                                   |
| Tipos, ESLint, Prettier, diff y build aislado          | **PASS**, compilación exit 0.                                                                                                                                                                  |
| Limpieza DEV                                           | **PASS**, cuenta QA propia retirada y huella de catálogo, pedidos, pagos, inventario, consultas, financiamiento y configuración intacta; [resultado](2026-10-25-purchase-cleanup.json).        |
| Envío real de mensaje WhatsApp, cobro o entrega        | **NO EJECUTADO**. No se pulsó Continuar en el chat real; el destino y el texto se inspeccionaron sin enviar.                                                                                   |
| Dispositivo físico, Vercel y PROD                      | **NO EJECUTADO**.                                                                                                                                                                              |

El PDF de comprobación está en output/pdf/seleccion-greenbel-verificacion.pdf. Es un documento de selección, no una compra confirmada. La cuenta temporal solo se usó para HTTP, con datos ficticios; Chrome conservó la sesión que ya tenía el usuario.

Capturas: [carrito final](2026-10-25-purchase-cart-1440.png), [carrito móvil](2026-10-25-purchase-cart-389.png), [confirmación](2026-10-25-purchase-dialog.png).

## Continuidad y límite operativo

Carrito conservado en dos unidades, modal cerrado, viewport restablecido y servidor principal preservado. Sin commit, push, despliegue, migración ni modificaciones de datos comerciales.

El número de WhatsApp guardado por el administrador se conserva tal como estaba: 43426033. Para un destino de Guatemala debe incluir su código de país en Administración → Contacto. No se sustituyó ese dato comercial por inferencia ni se abrió el chat durante QA.

# Plantillas, imágenes y Sileo · DEV · 26/10/2026

## Encargo y fuente visual

Añadir fotos de productos y el logo de GreenBel al PDF; usar en el correo el logo de Cooperativa a color que el usuario adjuntó; integrar Sileo para notificaciones; respetar el manual en nuevas plantillas y en los ajustes actuales. No se cambiaron importes, disponibilidad, consentimiento, identidad, reglas de pago/entrega ni el acceso privado a documentos.

Se examinó el manual completo (texto y las 36 páginas renderizadas): `/Users/diederichsolis/Downloads/manual_de_marca_greenbel (1) (6).pdf`, SHA-256 `93b056d491aa260a2affeadd9b75b4020bf3195270c365b9e2df57fa05a23135`. Aplicaciones gráficas como referencia visual; no son órdenes operativas. Páginas 7–19: variantes, proporciones y protección; 21: usos incorrectos; 24: paleta exacta; 26: Mont Heavy DEMO; 28–36: aplicaciones.

- Paleta: `#1E3A1F`, `#3A4813`, `#80BA01`, `#E7E7CF`, más blancos/neutros y el rojo funcional de error existente.
- Logo GreenBel original en proporción, sin recrear el nombre con una fuente. Lockup horizontal a 12 cm en cabecera impresa y espacio de protección de un isotipo. Se conserva la marca en todas las páginas.
- Mont completa no está disponible; la demo imprime marcas en glifos acentuados. Se mantiene la alternativa limpia ya usada por el sitio: Manrope en títulos y Poppins en lectura. Se convirtieron los WOFF2 locales a TTF estáticos para incrustarlos en los PDFs; licencias OFL incluidas. El correo usa fuentes compatibles con el cliente de correo, con logo original como imagen.

## PDFs nuevos

`quote-pdf.ts` y `whatsapp-selection-pdf.ts` comparten utilidades visuales y la carga del logo/fuentes/miniaturas. Mantienen sus cálculos y naturaleza distinta: cotización privada persistida frente a selección WhatsApp. Las imágenes se incrustan; no dependen de descargar fotos al abrir el PDF.

La carga solo admite IDs elegidos por el servidor; consulta los metadatos con RLS pública y luego lee el objeto correspondiente del bucket privado. No acepta URLs ni rutas arbitrarias del visitante. Miniaturas JPEG de hasta 220 px, sin recortar/deformar, lecturas concurrentes acotadas y presupuesto de espera. Foto ausente, corrupta, demasiado grande o no disponible usa el recurso de marca y «Sin imagen» sin bloquear el documento ni alterar sus importes. El logo esencial y las fuentes deben estar disponibles; no se anuncia un PDF generado si fallan.

Las nuevas cotizaciones guardan el PDF completo con las fotos y el mismo control SHA/bytes/acceso. No se regeneran documentos históricos. En cada fila figuran foto, producto/código, cantidad, precio e importe; se repiten cabecera y referencia al paginar. PDF de selección conserva las opciones de pago/entrega y el total de productos aprobado. Se guardan solo las fuentes utilizadas para evitar recursos vacíos.

Archivos: `src/lib/pdf/{quote-pdf,whatsapp-selection-pdf,document-visuals,load-document-visuals}.ts`, `src/lib/pdf/fonts/*`, rutas `src/app/api/cotizaciones/route.ts` y `src/app/api/cart/whatsapp/pdf/route.ts`.

## Correo

Logo a color cotejado visualmente con el adjunto y obtenido del sitio oficial: [PNG original](https://www.concepcionrl.com/wp-content/uploads/2025/02/logo_2026_01.png), 1500×537. Archivo `public/images/cooperativa-concepcion-color.png`, proporción íntegra sobre placa blanca. La página de financiamiento mantiene el blanco que el usuario había solicitado antes.

Se publicó la imagen pública por hash en el bucket DEV `email-assets` existente; ninguna política/permisos se amplió. Los objetos anteriores se conservan para correos ya enviados. La plantilla usa HTTPS, no adjunta imágenes y mantiene el PDF como único adjunto. Se conservan From, Reply-To, destinatario administrativo y protección contra duplicados.

Archivos: `src/lib/gmail/{financing-assets,financing-message}.ts`, `scripts/dev-publish-mail-assets.mjs`. [Verificación de los dos recursos públicos](../../gmail/2026-10-26-financing-public-brand-assets.json).

## Sileo y confirmaciones

Se instaló Sileo **0.1.6**, siguiendo su [documentación oficial](https://sileo.aaryan.design/docs), y se retiró Sonner. Proveedor único en el layout, API `notify` y hook `useNotificationFeedback` en `src/presentation/notifications/`. Las variantes usan la paleta, Poppins/Manrope, descripción legible, tamaño acotado al viewport y semántica de error conservada. Sileo incluye región `aria-live` y reduce movimiento según preferencias del sistema.

Conectados: agregar/vaciar carrito, formularios administrativos compartidos, marcas/categorías/productos, eliminación de catálogo/capacitaciones, editor de capacitaciones, contacto administrativo y público, acceso/perfil de cuenta, calificación de capacitación, preparación/envío de financiamiento y selección WhatsApp. Las validaciones por campo y los mensajes persistentes permanecen en contexto; las notificaciones anuncian resultados confirmados, no reemplazan controles de negocio ni muestran éxito anticipado.

Los cinco `window.confirm` anteriores se sustituyeron por `useConfirm`: modal corporativo, Cancelar/Continuar, Escape, foco devuelto y bloqueo del fondo. Si se cancela, no se ejecuta la acción. Los modales específicos de eliminación/WhatsApp se conservan. El viewport único de Sileo se monta dentro del diálogo abierto para ser visible en la capa superior de los editores.

## Verificaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| Unitarias | **50 PASS**: contenido/seguridad de PDFs, imágenes con RLS, corruptas/grandes/ausentes, importes, Gmail, WhatsApp, navegación y cotizaciones. [Log](unit.log) |
| HTTP DEV | **22 PASS**, sesión/propiedad/consentimiento, PDF privado, OTP retirado, envío real y repetición sin duplicado. [Resultados](http.json), [envío](http-send.log) |
| Tipos / lint | Exit 0, [tipos](types.log), [lint](lint.log), [últimos componentes](final-lint.log) |
| Build | Exit 0 en copia temporal; no se reemplazó `.next` ni se detuvo el servidor del usuario. [Log](build.log) |
| Empaquetado | Logo, placeholder y tres TTF incluidos en los dos endpoints PDF; logo de Cooperativa a color incluido en envío Gmail. [Tracing](tracing.json) |
| PDF real | Logo y foto de BIORADICANTE incrustados, 2 × Q83.25 = Q166.50; PDF recibido y descargado desde Gmail. Sin imágenes extra como adjuntos. |
| Paginación | PDF de 40 líneas/ocho páginas, primera/última revisadas; fallback y selección WhatsApp renderizados. [Prueba de composición](pdf-layout.log), [sin advertencias de render](pdf-render-warnings.log) |
| Chrome | Sileo real al agregar producto, escritorio y 390 CSS px; sin desbordamiento. Cantidad 2→3→4→2 restaurada y mismo total Q166.50. |
| Confirmación | Modal centrado, Cancelar y Escape regresan al editor/foco; checkbox restaurado y Guardar deshabilitado. No se confirmó ningún cambio de marca. |

Recibido en Gmail **Recibidos**: solicitud QA para `GB-COT-be2a575883b84d72934305f4c1f3dda0`, ambos logos cargados (GreenBel 552×104 y Cooperativa color 1500×537), un adjunto PDF. Descarga idéntica: SHA-256 `455d668c0f53bf8085f3bf73f42c3fd93aab0c7f25a3ef8424bad3fc7f26663d`. Se usó exclusivamente el correo de prueba propio configurado por el usuario; nunca una cooperativa real. No se envió un mensaje de WhatsApp.

Capturas: [Sileo escritorio](sileo-desktop.png), [Sileo móvil](sileo-mobile.png), [modal de confirmación](confirmacion.png), [correo a color](correo-color.png). Muestra PDF: `output/pdf/cotizacion-greenbel-con-imagenes.pdf` (datos de prueba, no solicitud comercial).

## Limpieza, límites y continuidad

Se retiraron únicamente una solicitud, una cotización/PDF y dos cuentas temporales propias con prefijo `QA Document visuals 875dfa99`. Respaldo privado fuera del repo, simulación con rollback, transacción, cuatro guards restaurados antes del commit y hash de todos los demás datos públicos/privados intacto. Las cuentas/sesión reales del navegador y el carrito se conservaron. [Simulación](cleanup-simulation.json), [aplicación](cleanup-applied.json).

No hubo migraciones nuevas, commit/push, despliegue ni cambios PROD. No se probaron Vercel, dispositivos físicos, Gmail móvil nativo, otros clientes de correo ni cada operación administrativa de negocio; se comprobó cancelación y no se hicieron ventas, pagos ni cambios de marcas para probar avisos. El endpoint WhatsApp se verificó con pruebas de contrato y render de su plantilla; esta ronda no descargó un PDF WhatsApp real desde Chrome.

Antes de PROD: autorización/aplicación de sus migraciones/configuración existentes, Gmail estable fuera de las limitaciones de Testing, los PNG públicos por hash y las fuentes/arte incluidos en el bundle. El principal de Cooperativa sigue siendo el correo de prueba que configuró el usuario. Mont completa permanece pendiente. El servidor local presentó carga lenta/transitoria de catálogo durante la recompilación; luego cargó y permitió ejecutar la revisión visual; no se afirma haber optimizado ese rendimiento en este trabajo.

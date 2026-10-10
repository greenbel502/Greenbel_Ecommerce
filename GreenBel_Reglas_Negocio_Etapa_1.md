# GreenBel — Reglas de negocio · Etapa 1

> **Decisión vigente · 29/09/2026:** solo el envío real de correos está temporalmente pausado en DEV y PROD. Se integrará después con Resend al configurar el dominio. Continúan formularios, PDF, validaciones y persistencia. No simular correo verificado ni envío exitoso. Contacto se registra sin notificación y financiamiento queda en borrador. No enviar automáticamente registros acumulados al reactivar. Ver GreenBel_Correos_Verificacion_Financiamiento.md.

- **Versión:** 1.1.
- **Fecha:** 29 de septiembre de 2026, Guatemala.
- **Estado:** alcance funcional de etapa 1 aprobado por el usuario; pendientes expresamente identificados.
- **Propósito:** referencia compartida para agentes que diseñen o implementen el ecommerce.
- **Fuente de decisiones:** conversación de definición funcional con el usuario. No constituye una auditoría del código ni de las integraciones existentes.
- **Referencia visual:** https://green-bel.vercel.app/ (mockup; no constituye por sí solo una regla comercial).

## 1. Instrucciones para los agentes

1. Usar las reglas aprobadas de este documento como base funcional. Los pendientes no autorizan inventar políticas, proveedores, credenciales o valores.
2. Conservar la identidad visual del mockup y justificar los ajustes necesarios.
3. Mantener el alcance de un ecommerce pequeño de graduación; no convertirlo en un ERP.
4. La etapa 2 organizará las secciones de la web y del panel. Este documento describe capacidades y flujos, no un mapa de navegación definitivo.
5. Antes de la etapa 3, confirmar stack, motor de base de datos y autenticación. No asumir que tecnologías de otros proyectos del usuario corresponden a GreenBel.
6. Diseñar el modelo de datos a partir de estas reglas. No generar migraciones ni implementar la base de datos hasta que el usuario valide ese modelo.
7. Ante cambios posteriores, conservar los identificadores de las reglas, actualizar la versión y registrar qué decisión sustituye a cuál.
8. Una propuesta o condición de un proveedor no pasa a ser regla aprobada por aparecer en un ejemplo. Los importes ilustrativos no son tarifas reales.

## 2. Alcance y actores

**Incluido:** información institucional; catálogo completo; marcas y categorías; disponibilidad compartida con ventas físicas; carrito; cotizaciones PDF; compra autenticada; pagos inicialmente en pruebas; retiro y envíos; ofertas; reseñas; videos de capacitación; solicitudes de financiamiento; administración y atención manual de excepciones.

| Actor | Capacidades acordadas |
| --- | --- |
| Visitante | Consultar contenido, productos, videos y reseñas; seleccionar productos; cotizar sin cuenta; solicitar financiamiento verificando su correo |
| Cliente autenticado | Comprar y consultar sus pedidos; publicar reseñas de productos con compra entregada; cancelar o solicitar cancelación según avance |
| Operador | Atender pedidos, registrar movimientos de inventario y cobros presenciales; gestionar manualmente envíos externos |
| Administrador | Operación y control de catálogo, precios, marcas, contenido, ofertas, tarifas, métodos de pago y usuarios; moderación de reseñas |

El acceso de cada cliente se limita a sus operaciones. Los formularios públicos no deben exponer cotizaciones o solicitudes de otras personas. La matriz detallada de permisos, especialmente reembolsos y acceso a datos de financiamiento, requiere precisión posterior.

## 3. Catálogo y contenido administrable

- **CAT-01.** Incluir todo el catálogo con una existencia global compartida con ventas físicas; no manejar inventario independiente por sucursal en esta versión.
- **CAT-02.** Permitir al personal autorizado mantener productos, categorías, marcas, imágenes, descripciones, características, precios e información comercial. Los campos finales y variantes quedan por definir.
- **CAT-03.** Mostrar disponibilidad y ofertas en el catálogo y fichas. No confirmar compras de cantidades no disponibles.
- **CAT-04.** El panel debe alimentar la página sin exigir cambios de código para actualizar su contenido habitual. No se ha aprobado un constructor libre de páginas.
- **CAT-05.** Distinguir accesorios incluidos de artículos vendidos por separado. No inferir que un accesorio incluido constituye otra unidad vendible del inventario.

## 4. Carrito y cotizaciones

- **COT-01.** Cotizar no exige registro. Para descargar el PDF se solicita nombre o razón social; el correo es opcional.
- **COT-02.** El carrito reúne productos y cantidades, pero no reserva inventario ni garantiza precios.
- **COT-03.** La cotización conserva los precios vigentes al emitirla. Al comprar se recalculan precios y se revisa disponibilidad; cualquier diferencia debe mostrarse antes de confirmar.
- **COT-04.** No existe compromiso aprobado de mantener un precio por siete días ni por otro plazo. No agregar esa condición.
- **COT-05.** Conservar el PDF y los datos originales de la cotización; una actualización posterior no debe reescribir silenciosamente el documento emitido.
- **COT-06.** Generar una cotización no crea una compra ni reserva unidades.
- **COT-07.** Permitir continuar a compra desde carrito o cotización, exigiendo autenticación y conservando la selección.
- **COT-08.** Identificar si el transporte está incluido, excluido o pendiente de cotización. Un costo desconocido no equivale a envío gratuito.

## 5. Compra, pagos y facturación

- **PAG-01.** Comprar requiere iniciar sesión. El mecanismo de registro, acceso y recuperación se definirá con el stack.
- **PAG-02.** Iniciar pagos en modo de pruebas. Recurrente es la opción prevista, no un proveedor definitivamente confirmado ni una integración ya implementada.
- **PAG-03.** Confirmar los pagos de pasarela desde el servidor. No considerar como prueba suficiente el retorno del navegador o la afirmación del cliente.
- **PAG-04.** Las notificaciones repetidas o reintentos no deben duplicar pedidos, registros de cobro ni descuentos de inventario. No almacenar datos sensibles de tarjetas.
- **PAG-05.** Un pago pendiente no se convierte en fallido por cerrar la pestaña. Un pago confirmado después de vencer la reserva requiere revisión de disponibilidad antes de prometer entrega.
- **PAG-06.** Separar avance del pedido, entrega y pago. Un pedido contra entrega puede despacharse sin estar pagado.
- **PAG-07.** Administrador y operador pueden registrar cobros presenciales con fecha, responsable y referencia cuando corresponda. Una operación rechazada en terminal no se marca pagada.
- **PAG-08.** El ecommerce recoge datos de facturación, pero GreenBel emite la factura mediante su procedimiento interno. No incluir emisión electrónica en esta versión; el PDF de cotización no es una factura.
- **PAG-09.** Moneda de venta: quetzales (GTQ/Q). Los precios de producto ya incluyen IVA; el sistema no lo agrega otra vez al total. El método de desglose informativo del IVA no se ha definido y no se inventa.
- **PAG-10.** Para facturación CF se solicitan nombre, apellido y teléfono. Para factura con NIT se solicitan NIT, nombre del titular del NIT, nombre completo y teléfono; el correo es opcional. El sistema conserva estos datos para el procedimiento interno de facturación de GreenBel, sin afirmar que valida el NIT o emite la factura.

| Entrega | Métodos acordados |
| --- | --- |
| Retiro | Pago en línea; efectivo o terminal al retirar |
| Mensajería propia | Pago en línea; efectivo o terminal contra entrega |
| Transportadora externa | Pago en línea; contra entrega únicamente si el servicio habilitado lo admite y el pedido cumple sus condiciones |

No asumir que una transportadora acepta terminal por el hecho de que GreenBel sí la acepta con sus mensajeros. Los medios admitidos dependen de la empresa y del servicio.

## 6. Inventario: términos y momentos de afectación

**Términos funcionales, no un diseño de tablas:**

- **Reservar:** apartar unidades para un pedido, reduciendo lo disponible para otras compras.
- **Consolidar el descuento:** convertir las unidades reservadas en unidades vendidas o comprometidas definitivamente por el evento acordado.
- **Liberar una reserva:** devolver las unidades reservadas a la disponibilidad.
- **Reincorporar:** devolver al inventario unidades previamente descontadas, cuando corresponda.

La expresión inicial del usuario «liberar inventario» se aclaró y aprobó como **descontar**, no como volver a ofrecer unidades ya vendidas.

- **INV-01.** El panel será el registro operativo de existencias compartidas. El personal registra entradas, ventas físicas y ajustes con motivo; los movimientos deben permitir identificar fecha, cantidad y responsable.
- **INV-02.** Carrito, cotización y solicitud de financiamiento no reservan unidades.
- **INV-03.** Comprobar disponibilidad al confirmar y reservar; evitar que ventas web y físicas comprometan simultáneamente las mismas unidades.
- **INV-04.** Una misma operación no descuenta dos veces. La conversión de reserva a descuento no vuelve a reducir lo ya apartado.

| Evento | Regla aprobada |
| --- | --- |
| Confirmar pedido e iniciar pago en línea | Crear reserva temporal |
| Confirmar pago en línea | Consolidar descuento; despachar después no descuenta otra vez |
| Confirmar el cliente un pedido contra entrega | Reservar unidades, quedando pendiente la atención del personal |
| Despachar pedido contra entrega | Consolidar descuento, sin esperar cobro o transferencia a GreenBel |
| Cobrar y entregar pedido con pago al retirar | Consolidar descuento de las unidades reservadas |
| Vencer pago en línea sin confirmación | Verificar el estado del pago y liberar reserva cuando corresponda |
| Cancelar antes de consolidar descuento | Liberar reserva |
| Cancelar pedido pagado que aún no salió | Restituir inventario al confirmar la cancelación; gestionar reembolso por separado |
| Retornar un producto ya despachado | Reincorporar solo después de recibirlo y revisarlo |

- **INV-05.** No liberar unidades de pedidos pagados o despachados por el simple vencimiento de un plazo.
- **INV-06.** Para contra entrega pendiente de confirmación o retiro, los plazos serán configurables; avisar al personal y exigir revisión antes de cancelar. Duraciones pendientes.
- **INV-07.** El descuento comercial al pagar no implica afirmar que el producto salió físicamente. El avance de entrega debe conservar esa diferencia.

**Ejemplo:** hay 10 unidades, se reservan 2 y quedan 8 disponibles. Al despachar el pedido contra entrega, se consolida el descuento y siguen quedando 8 disponibles, no 6.

## 7. Entregas, tarifas y retiro

- **ENT-01.** Ofrecer retiro gratuito en un único punto, con dirección, horario e instrucciones visibles. Ubicación definitiva pendiente.
- **ENT-02.** Ofrecer mensajería propia y transportadoras externas, como Forza o Cargo Expreso, según servicios efectivamente habilitados.
- **ENT-03.** Configurar cobertura y tarifas por zona o municipio desde el administrador. Un destino sin cobertura no puede completar compra con envío; puede elegir retiro.
- **ENT-04.** Separar configuración de entrega y configuración de pago. Un nombre de método no sustituye su lógica operativa.
- **ENT-05.** Para externos, admitir cobro del transporte junto con la compra o directamente por la transportadora al recibir, según la configuración de cada servicio.
- **ENT-06.** Mostrar productos, transporte, total y momento de cobro. No cobrar el envío dos veces ni mostrar como gratuito lo que se pagará al recibir.
- **ENT-07.** Si falta el costo exacto, el personal cotiza y el cliente acepta antes de pagar o autorizar el despacho.
- **ENT-08.** En ese recorrido, la solicitud inicial pendiente de cotizar envío no reserva unidades. Tras aceptar el total, revisar precios y disponibilidad y aplicar la reserva al confirmar el pedido.
- **ENT-09.** Conservar los importes acordados del pedido confirmado aunque cambien después las tarifas configuradas.
- **ENT-10.** La mensajería propia debe poder realizar realmente el medio de cobro ofrecido en cada destino.

## 8. Transportadoras externas y cobro contra entrega

- **EXT-01.** Gestión manual inicial: el personal coordina el envío y registra empresa, guía, avance de entrega, cobro reportado y transferencia recibida. No incluir una integración API automática como requisito aprobado.
- **EXT-02.** Habilitar contra entrega por empresa y servicio, considerando cobertura, límite de cobro y medios admitidos. No extrapolar condiciones de Forza a Cargo Expreso.
- **EXT-03.** GreenBel asume la comisión de recaudación contra entrega. Esta comisión no es lo mismo que el costo de transporte y no se añade como recargo al cliente.
- **EXT-04.** Separar: entrega al cliente, cobro de la transportadora al cliente y depósito a GreenBel. El cliente puede haber pagado mientras el depósito aún está pendiente.
- **EXT-05.** Registrar importe recaudado, cargos documentados y depósito recibido. Una diferencia explicada por comisión no es deuda del cliente.
- **EXT-06.** No prometer plazos de transferencia, porcentajes, límites o descuentos automáticos sin validar las condiciones comerciales de GreenBel con el proveedor.

### Referencias externas pendientes de validación comercial

En la conversación se consultó la página oficial de [Forza COD](https://www.forzadelivery.com/gt/nuestros-servicios/servicio-cod/), que publicaba 4 % con mínimo Q4 y límite de cobro Q5,000; otra [página de servicios](https://www.forzadelivery.com/gt/nuestros-servicios/) mostraba 3.8 %. Son antecedentes consultados el 29/09/2026, **no valores aprobados para cargar como configuración de GreenBel**. Confirmar contrato, peso, dimensiones, cargos y límites aplicables antes de activar el servicio. No se aprobó COD Anticipado para esta versión.

## 9. Financiamiento con Cooperativa Concepción R.L.

- **FIN-01.** Enviar la solicitud directamente al correo acordado con la cooperativa. La alianza fue confirmada por el usuario; el correo y los requisitos exactos siguen pendientes.
- **FIN-02.** No exigir cuenta. Exigir verificación de correo y autorización para compartir los datos.
- **FIN-03.** El apartado Financiamiento contiene la información y el formulario; debe ofrecer «Generar cotización para financiamiento», «Usar mi carrito» y acceso protegido a una cotización existente.
- **FIN-04.** Al generar una nueva cotización, el visitante selecciona productos y cantidades y elige finalizar. Esto genera una cotización, no un pedido de compra.
- **FIN-05.** Generar y adjuntar automáticamente el PDF al formulario. Mostrar referencia, total y opción para consultarlo; no exigir descargar y volver a cargar.
- **FIN-06.** Si cambian los productos antes del envío, actualizar la cotización y sustituir el adjunto para que coincidan. Conservar las versiones históricas que ya se hayan emitido o enviado.
- **FIN-07.** Completar el formulario, autorizar compartir datos, verificar correo y confirmar envío. Enviar datos y PDF y registrar el resultado y una referencia.
- **FIN-08.** Evitar envíos duplicados por reintentos. Un fallo de envío no debe presentarse como éxito.
- **FIN-09.** Solicitar financiamiento no reserva, no cobra, no aprueba crédito ni marca una compra pagada. Verificar correo no verifica identidad financiera.
- **FIN-10.** No inventar campos financieros, DPI o documentos obligatorios. Se definirán con la cooperativa.
- **FIN-11.** Si cambian precios durante la evaluación, no cobrar un total nuevo sin informar y obtener aceptación. El procedimiento de actualización con la cooperativa está pendiente.

Queda pendiente cómo se notifica aprobación o rechazo, quién paga a GreenBel y cómo se registra la compra financiada. La carga de PDFs externos no está aprobada como requisito inicial.

## 10. Talleres: videos de capacitación

- **TAL-01.** «Talleres» significa capacitaciones en video para el uso de los equipos; no un módulo de reparaciones ni eventos con cupos.
- **TAL-02.** Consulta pública sin iniciar sesión.
- **TAL-03.** El administrador puede mantener y publicar el contenido, con título, descripción, portada y video, y asociarlo con productos o categorías.
- **TAL-04.** Permitir consultar capacitaciones desde su apartado y desde los productos relacionados. El nombre final y la presentación se concretarán en etapa 2.
- **TAL-05.** No incluir inscripciones, reservas, cobros, listas de espera ni gestión de participantes.

## 11. Ofertas

- **OFE-01.** El administrador selecciona un producto y configura precio final exacto o porcentaje de descuento.
- **OFE-02.** Precio exacto significa precio final de venta, no monto a restar. Ejemplo: regular Q8,000, oferta Q7,500; mostrar etiqueta roja «Oferta», precio anterior tachado y nuevo precio destacado.
- **OFE-03.** Porcentaje se aplica al precio regular. Ejemplo: Q8,000 con 10 % resulta Q7,200; mostrar «−10 %», precio anterior tachado y nuevo precio.
- **OFE-04.** Una oferta activa por producto, con inicio y fin y desactivación administrativa; sin cupones ni descuentos acumulables.
- **OFE-05.** Precio final mayor que cero y menor al regular; porcentaje mayor que 0 y menor que 100. Redondear importes a dos decimales.
- **OFE-06.** Si se cambia el precio regular con una oferta vigente, pedir revisión y confirmación de la promoción antes de guardar.
- **OFE-07.** Reflejar la oferta en catálogo, ficha, carrito y nuevas cotizaciones. Revisar vigencia al comprar y avisar diferencias.
- **OFE-08.** Cambiar una promoción no altera pedidos confirmados ni cotizaciones históricas.

## 12. Reseñas

- **RES-01.** Cualquiera puede consultarlas; solo clientes con compra entregada del producto pueden publicar.
- **RES-02.** Calificación de 1 a 5 y comentario.
- **RES-03.** Moderación del administrador por spam, datos personales o contenido ofensivo. Una opinión negativa por sí sola no justifica ocultarla.
- **RES-04.** Una reseña por cliente y producto, editable por el autor, se propuso pero no recibió confirmación específica. Mantener pendiente la multiplicidad y edición; no presentarlas como reglas cerradas.

## 13. Cancelaciones, reembolsos, devoluciones y garantías

- **CAN-01.** El cliente puede cancelar directamente antes de comenzar la preparación.
- **CAN-02.** Una cancelación de un pedido pagado abre una solicitud de reembolso. No significa que el dinero ya se devolvió.
- **CAN-03.** Después de comenzar la preparación, el cliente solicita la cancelación y el personal resuelve.
- **CAN-04.** Devoluciones y garantías se atienden mediante contacto con GreenBel y registro manual en el panel; no se incluye portal especializado.
- **CAN-05.** Condiciones, plazos, costos, excepciones y atribuciones para autorizar reembolsos quedan pendientes. Distinguir garantía de devolución comercial.
- **CAN-06.** Aplicar las reglas de inventario de la sección 6; no reincorporar automáticamente productos aún en tránsito ni productos devueltos sin revisión.

## 14. Estados funcionales y límites de diseño

Estos conceptos deben poder distinguirse, pero **no son un catálogo final de estados ni nombres de tablas**:

| Dimensión | Situaciones que deben diferenciarse |
| --- | --- |
| Cotización | Emitida históricamente frente a selección actualizada para comprar |
| Costo de envío | Pendiente de cotizar; propuesto al cliente; aceptado |
| Pedido | Pendiente de atención; en preparación; cancelado |
| Entrega | Listo para retirar; enviado; entregado; retorno pendiente de revisión |
| Pago | Pendiente; confirmado en línea; cobrado presencialmente o por tercero; fallido |
| Depósito externo | Pendiente; recibido; diferencia por revisar |
| Reembolso | Solicitado; en gestión; confirmado |
| Financiamiento | Solicitud por completar/verificar; envío exitoso o fallido; evaluación externa no inferida |

La etapa de modelo de datos definirá transiciones, validaciones e identificadores definitivos sin mezclar estas dimensiones.

## 15. Pendientes que los agentes no deben resolver por su cuenta

| ID | Pendiente | Impacto |
| --- | --- | --- |
| PEN-01 | Stack, base de datos y autenticación | Bloquea el diseño técnico definitivo |
| PEN-02 | Confirmación de Recurrente y condiciones del modo de pruebas | Bloquea integración específica; no autoriza cobros reales |
| PEN-03 | Requisitos, correo y tratamiento posterior de la cooperativa | Bloquea formulario definitivo y envío real |
| PEN-04 | Dirección, horarios e instrucciones del punto de retiro | Bloquea publicación de datos reales de retiro |
| PEN-05 | Cobertura, tarifas, peso/dimensiones y condiciones por transportadora | Bloquea activar opciones reales no verificadas |
| PEN-06 | Duraciones de reservas y revisión de pedidos sin recoger/confirmar | Requiere valores configurados y compatibilidad con pagos |
| PEN-07 | Políticas de devolución, garantía, reembolso y facultades del personal | Bloquea automatismos comerciales no acordados |
| PEN-08 | Campos exactos de entrega, tratamiento de tarifas y eventual desglose informativo del IVA | Moneda GTQ, IVA incluido en precios de producto y datos mínimos de facturación quedaron resueltos en PAG-09/PAG-10; falta el resto de la configuración de entrega |
| PEN-09 | Variantes de productos, datos oficiales, imágenes y stock inicial | Requiere preparación del catálogo real |
| PEN-10 | Regla final de cantidad/edición de reseñas | Evitar asumir unicidad o edición aprobadas |
| PEN-11 | Recuperación protegida de cotizaciones y detalles de correos transaccionales | Concretar experiencia y seguridad con el stack |
| PEN-12 | Posibilidad de cotizar agotados; validez documental sin garantía de precio | No impedir ni habilitar esta excepción sin definirla |
| PEN-13 | Alojamiento de videos y archivos, retención y acceso | Decisión técnica posterior; no proveedor asumido |

## 16. Fuera del alcance inicial

- Emisión de factura electrónica dentro del ecommerce.
- Gestión interna de créditos o aprobación automática de financiamiento.
- ERP, caja completa, inventario por sucursal o traslados entre bodegas.
- Integración automática con transportadoras o terminales físicas.
- Cupones, descuentos acumulables, fidelización y múltiples pasarelas.
- Inscripciones o pagos de capacitaciones y módulo de reparaciones.
- Portal especializado de devoluciones y garantías.
- COD Anticipado y carga de cotizaciones externas, salvo aprobación posterior.

## 17. Escenarios para orientar validación futura

Estos escenarios describen resultados esperados, no pruebas ejecutadas ni una orden de implementar todavía.

1. Un visitante genera PDF sin correo obligatorio y sin que cambie la disponibilidad.
2. Una cotización antigua mantiene su PDF; al comprar muestra y requiere aceptar el total actualizado.
3. Financiamiento desde carrito produce un PDF coincidente con los productos y solo se envía tras verificar correo y confirmar.
4. Dos compras que compiten por la última unidad no pueden confirmarla ambas.
5. Una notificación de pago repetida no descuenta inventario dos veces.
6. Un pedido pagado mantiene sus unidades comprometidas aunque se demore el retiro.
7. Un COD despachado descuenta sin esperar depósito; el cliente puede figurar como pagado mientras GreenBel espera liquidación.
8. Un transporte pendiente de cotizar impide pagar o despachar hasta que el cliente acepte su costo.
9. Un destino sin cobertura ofrece retiro, no envío gratuito.
10. Cancelar antes de preparar libera o restituye unidades según su situación; si hubo pago, el reembolso permanece pendiente hasta confirmarse.
11. Un retorno en tránsito no aumenta disponibilidad; requiere recepción y revisión.
12. Q8,000 con oferta exacta Q7,500 y con descuento 10 % produce, respectivamente, Q7,500 y Q7,200, sin acumulación.
13. Una reseña negativa de una compra entregada no se oculta únicamente por su calificación.

## 18. Control de cambios

| Versión | Fecha | Cambio |
| --- | --- | --- |
| 1.0 | 2026-09-29 | Consolidación de etapa 1 aprobada, aclaración de descuento/reserva, inclusión de COD externo y financiamiento desde su formulario; identificación de pendientes |
| 1.1 | 2026-09-29 | Decisión posterior del usuario: GTQ, precios de producto con IVA incluido y campos mínimos de facturación CF/NIT; PEN-08 se acota. |

**Próximo paso autorizado:** etapa 2, mapa de secciones públicas, cuenta de cliente y panel administrativo. Mantener este documento actualizado cuando se aprueben cambios de reglas; no sustituirlo por supuestos técnicos.

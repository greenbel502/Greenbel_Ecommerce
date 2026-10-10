# GreenBel — Secciones y flujos de interfaz · Etapa 2

> **Decisión vigente · 29/09/2026:** solo el envío real de correos está temporalmente pausado en DEV y PROD. Se integrará después con Resend al configurar el dominio. Continúan formularios, PDF, validaciones y persistencia. No simular correo verificado ni envío exitoso. Contacto se registra sin notificación y financiamiento queda en borrador. No enviar automáticamente registros acumulados al reactivar. Ver GreenBel_Correos_Verificacion_Financiamiento.md.

- Versión: 0.4, en desarrollo.
- Fecha: 29/09/2026, Guatemala.
- Base: GreenBel_Reglas_Negocio_Etapa_1.md, versión 1.0.
- Estado: estructura general aprobada; detalle de campos y pantallas pendiente de validación.
- Alcance: organización funcional de interfaces; no es un diseño de base de datos ni autorización de migraciones.

## 1. Decisiones aprobadas

| ID | Decisión |
| --- | --- |
| UI-01 | El nombre visible será **Capacitaciones**, en lugar de Talleres |
| UI-02 | Un mismo carrito permite comprar, cotizar o solicitar financiamiento reutilizando productos y cantidades |
| UI-03 | Se aprueba la organización general del panel propuesta en esta etapa |
| UI-04 | Los datos de envío se gestionan dentro del pedido; una vista adicional permite revisar envíos y cobros pendientes sin duplicar registros |

| UI-05 | Los repuestos se venderán en la web como productos con precio y existencia propios; los precios están pendientes de completar |

| UI-06 | Categorías y subcategorías administrables aprobadas; clasificación final pendiente |
| UI-07 | Especificaciones editables mediante característica, valor y unidad opcional, siguiendo la información del PDF |
| UI-08 | La ficha incluye un bloque separado «Incluye», con descripción y cantidad de accesorios; no mezclar con especificaciones ni repuestos vendidos aparte |
| UI-09 | Todo producto sin precio, incluidos los repuestos, se muestra públicamente con la etiqueta exacta «Precio próximamente»; no se oculta únicamente por faltar precio |

La aprobación de la organización no cierra los pendientes comerciales o técnicos de etapa 1. No asumir campos, permisos sensibles ni condiciones de proveedores.

## 2. Web pública

Menú propuesto: **Inicio · Productos · Capacitaciones · Financiamiento · Nosotros · Contacto**. Carrito y acceso a cuenta visibles en el encabezado.

| Sección | Contenido y acciones previstos |
| --- | --- |
| Inicio | Presentación, productos destacados, ofertas vigentes, marcas y accesos a capacitación y financiamiento |
| Productos | Búsqueda, filtros por categoría y marca, ordenamiento, precios y disponibilidad |
| Detalle del producto | Imágenes, descripción, especificaciones, incluidos, garantía, precio, oferta, reseñas y videos relacionados |
| Capacitaciones | Biblioteca pública de videos; búsqueda y filtros por equipo o categoría |
| Detalle de capacitación | Video, descripción y productos relacionados |
| Financiamiento | Información de cooperativa, selección/cotización, formulario, verificación y envío |
| Nosotros | Información institucional y marcas |
| Contacto | Canales, ubicaciones, horarios y orientación de posventa |

Propuestas aún sujetas al detalle de pantalla: mostrar ofertas como filtro del catálogo y bloque de Inicio; incluir «Agregar al carrito» y «Solicitar financiamiento» en la ficha. Esta última acción inicia el recorrido, no envía una solicitud automáticamente.

## 3. Carrito compartido y compra

| Acción aprobada | Recorrido |
| --- | --- |
| Generar cotización | Nombre o razón social, correo opcional, PDF sin registro |
| Comprar | Autenticación, entrega, datos de facturación, pago compatible y revisión del total |
| Solicitar financiamiento | Reutilizar la selección, generar/seleccionar cotización y adjuntarla al formulario |

Secuencia propuesta de compra: identificación → entrega → facturación → pago y revisión → resultado real del pedido. El orden visual definitivo puede ajustarse sin cambiar las reglas.

Cuando falte costo de transporte: solicitar cotización del envío, esperar costo del operador y aceptación del cliente; después revisar precio/disponibilidad y continuar. No cobrar, despachar ni reservar antes de lo permitido por etapa 1.

## 4. Financiamiento

1. Información de la cooperativa y aclaración de evaluación externa.
2. Generar cotización, usar carrito o recuperar cotización mediante acceso protegido.
3. Revisar productos, cantidades, total y PDF adjunto automáticamente.
4. Completar datos acordados y autorizar compartirlos.
5. Verificar correo y confirmar envío.
6. Mostrar referencia y resultado; no inferir aprobación del crédito.

Propuesta: reutilizar el catálogo con aviso «Estás preparando una cotización para financiamiento» y acción «Continuar al formulario». No crear otro catálogo ni enviar datos al añadir un producto.

## 5. Cuenta del cliente

| Sección propuesta | Función |
| --- | --- |
| Mis pedidos | Referencia, fecha, total y estados |
| Detalle del pedido | Productos, importes, entrega, pago, guía y acciones según avance |
| Mis datos | Actualizar información de cuenta sin modificar pedidos históricos |
| Seguridad | Gestión de acceso según autenticación pendiente de elección |

Acciones del pedido según etapa 1: cancelar antes de preparar; solicitar cancelación después; aceptar costo de envío; consultar retiro/guía; escribir reseña tras entrega; contactar por devolución o garantía.

«Mis financiamientos» no es una sección obligatoria aprobada. Las solicitudes no requieren cuenta y el seguimiento con la cooperativa está pendiente.

## 6. Panel administrativo: organización aprobada

| Grupo | Apartados y capacidades |
| --- | --- |
| Resumen | Pendientes de confirmación, cotización de envío, retiro y depósitos externos |
| Catálogo | Productos, categorías y marcas; fichas, imágenes y precios |
| Inventario | Existencias y movimientos; entradas, ventas físicas y ajustes |
| Ventas | Pedidos y cotizaciones; documentos y cancelaciones |
| Envíos externos | Vista de pedidos con guías, entregas, cobros y depósitos pendientes |
| Financiamiento | Solicitudes, cotización adjunta y resultado del envío |
| Contenido | Capacitaciones e información institucional |
| Ofertas | Precio exacto o porcentaje, fechas y activación |
| Reseñas | Moderación según criterios aprobados |
| Atención posventa | Registro manual de devoluciones, garantías y reembolsos |
| Configuración | Entrega, pagos, plazos y usuarios |

El pedido es el punto de gestión de su envío y cobros; Envíos externos es una vista de los mismos datos. Resumen muestra pendientes operativos, sin añadir analítica avanzada al alcance.

## 7. Configuración y acceso

| Apartado | Alcance |
| --- | --- |
| Retiro | Dirección, horario e instrucciones |
| Mensajería propia | Cobertura, tarifas y cobros permitidos |
| Transportadoras | Servicios, cobertura, límites, tarifas o cotización manual |
| Cobro del transporte | Junto con compra o por tercero al recibir |
| Pagos | Pasarela en pruebas, efectivo y terminal según compatibilidad |
| Plazos | Reservas y avisos de pendientes, conforme a etapa 1 |

Administrador: operación, catálogo, contenido, precios, ofertas, configuración y usuarios. Operador: pedidos, inventario, envíos y cobros operativos. Pendientes: facultades de reembolso y acceso del operador a datos de financiamiento. Ocultar menús no sustituye validar permisos.

## 8. Siguiente bloque: ficha de producto (propuesta, no aprobado)

La revisión textual de las páginas iniciales del catálogo adjunto muestra, para AK26-GX, marca/modelo, especificaciones con unidades, incluidos con cantidades, garantía y listas de repuestos. Fuente: «GREENBEL - CATA╠üLOGO DE PRODUCTOS.pdf (1).pdf», páginas 3–5. No se ha realizado inventario exhaustivo de todos los productos ni validado datos comerciales actuales.

| Bloque propuesto del formulario | Campos |
| --- | --- |
| Identificación | Nombre comercial, código/SKU, modelo, marca, categoría y subcategoría opcional |
| Presentación | Descripción breve, descripción completa, imagen principal y galería |
| Venta | Precio regular, publicación y acceso a ofertas; stock consultable, ajustes desde movimientos |
| Ficha técnica | Filas de característica, valor y unidad cuando aplique, adaptables por tipo de equipo |
| Incluidos | Descripción y cantidad por accesorio incluido |
| Garantía | Duración y condiciones específicas, sin aplicar una garantía universal |
| Relaciones | Capacitaciones; repuestos compatibles únicamente con correspondencias verificadas |

Estado del bloque:

1. Aprobado: categorías y subcategorías administrables. La clasificación final y el máximo de niveles quedan por precisar.
2. Aprobado: ficha técnica flexible mediante característica/valor/unidad opcional, con información como la del PDF.
3. Aprobado: bloque separado «Incluye», con descripción y cantidad de cada elemento suministrado con el equipo. Su presentación no implica vender ni descontar esos elementos individualmente.
4. Aprobado: repuestos como productos con precio y stock propios, relacionados con los equipos compatibles sin duplicar su inventario.
5. Corrección expresa del usuario: mostrar también los repuestos cuyo precio todavía no esté registrado. Se descarta la propuesta de ocultarlos en borrador únicamente por faltar precio.

**Presentación aprobada para todo producto sin precio:** mostrar únicamente la etiqueta «Precio próximamente» en lugar del importe. La regla aplica a equipos, repuestos y cualquier otro producto. Sustituye la propuesta «Consultar precio» y no añade un botón de consulta por esta condición. No mostrar Q0 ni inventar un importe.

**Pendiente funcional:** precisar cómo se restringen las acciones de compra, cotización monetaria y financiamiento cuando falta el precio. La aprobación actual define la presentación pública; no autoriza tratar un importe ausente como cero ni emitir totales incompletos.

No interpretar abreviaturas de compatibilidad sin confirmación. Los accesorios incluidos no generan descuentos separados de inventario automáticamente. No cargar precios o existencias a partir de ejemplos.

## 9. Seguimiento

Pendiente detallar y validar formularios de producto/categoría/marca, pantalla de pedido, inventario, capacitaciones, ofertas, configuración y estados vacíos/de error; también matriz final de permisos.

Mantener este documento actualizado con cada bloque aprobado. Las propuestas siguen siendo propuestas hasta que se validen. Conservar las reglas de etapa 1; si se cambia alguna, actualizar también su documento y control de cambios.

| Versión | Cambio |
| --- | --- |
| 0.1 | Registro de nombre Capacitaciones, carrito compartido y panel aprobado; mapa inicial y propuesta de ficha de producto |

| 0.2 | Se confirma venta de repuestos; precios pendientes. Se mantienen pendientes subcategorías y especificaciones flexibles |
| 0.3 | Se aprueban categorías/subcategorías, ficha técnica editable y bloque Incluye; se corrige borrador: repuestos sin precio visibles. Acción comercial pendiente de validar |
| 0.4 | Etiqueta aprobada para todos los productos sin precio: «Precio próximamente»; sustituye «Consultar precio» y su botón propuesto |

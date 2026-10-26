# Compra por WhatsApp y contactos administrables · 25/10/2026

## Decisión actual del usuario

La compra del e-commerce se atiende por WhatsApp: carrito → modal que indica descargar PDF y adjuntarlo → Continuar descarga y abre el chat. Pasarela y pagos web pendientes. Al solicitar el número oficial, el usuario indicó agregar **Administración → Contacto**, con alta/edición/eliminación de teléfonos y correos para GreenBel y cooperativa. La compra debe tomar de ahí el número principal de GreenBel.

## Implementación acotada

- Reutilizar `site_content`, clave `contact`, como borrador privado tipado versión 1. Hasta 40 contactos, organizados por GreenBel/cooperativa y teléfono/correo. Teléfono internacional, email validado, un principal por grupo, sin valores ficticios por defecto. Control de concurrencia por updated_at. Sin migraciones nuevas.
- Solo el principal de GreenBel de cada tipo se proyecta al cliente (WhatsApp/correo). Cooperativa no aparece en páginas, props o respuestas públicas. Eliminar principal deja canal sin configurar hasta designar otro; no se elige automáticamente un destinatario distinto.
- Carrito con única opción Comprar por WhatsApp. Selección para asesoría de productos publicados con precio; admite existencia por confirmar para consultar al asesor. Agotados y productos sin precio conservan su restricción. No se prometen ni reservan existencias.
- PDF generado con datos actuales del catálogo público, códigos, cantidades, precios y subtotal; entrega/pago por confirmar. Es una solicitud, no factura, cotización persistida ni compra confirmada. Sin datos personales añadidos, pedidos, cobros, reservas o correos.
- El modal prepara el PDF sin descargar ni abrir WhatsApp. Continuar inicia descarga y abre enlace normal de WhatsApp en la misma interacción; permite cancelar, reintentar y recuperar descarga/chat si el navegador limita alguna acción. No se adjunta ni envía automáticamente el PDF o el mensaje.
- Retirar acceso al checkout del carrito, redirigir /checkout al carrito y devolver cierre explícito en APIs de checkout. Pausar además la política existente `checkout_settings` (dos plazos NULL, simulador false), con respaldo privado: sus funciones SQL ya cierran los caminos cuando no hay política de reserva. Impedir reactivar esos ajustes desde administración mientras dure esta fase.
- Conservar cotizaciones/financiamiento y operaciones administrativas históricas. Las reseñas no se convierten en compra verificada por abrir WhatsApp; mantienen su validación de entrega registrada.

## Verificaciones previstas

Permisos de contactos y proyección privada, CRUD y concurrencia, cambio/eliminación del destino principal, PDF real y layout de varias páginas, precios/importe y cantidades de servidor, modal Cancelar/Continuar/errores/doble clic, descarga y enlace a WhatsApp, carrito sin otros métodos, checkout web/API/política cerrados, responsive móvil/tablet/escritorio y limpieza de fixtures manteniendo datos previos. No enviar mensajes reales ni correos. DEV exclusivamente, sin PROD ni publicación Git.

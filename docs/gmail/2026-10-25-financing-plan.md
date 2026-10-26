# Financiamiento por Gmail · modelo aprobado · 25/10/2026

La petición actual autoriza remitir solicitudes de información a la cooperativa mediante la conexión Gmail existente. Se mantiene el flujo aprobado de consentimiento, verificación del correo y confirmación explícita; no se aprueba crédito ni se reserva inventario. Contacto y compra por WhatsApp conservan sus reglas.

## Recorrido propuesto

1. Usar los productos/cantidades del carrito en Financiamiento y emitir desde esa pantalla la cotización PDF privada mediante el endpoint existente. Evitar el enlace actual a una emisión que ya no existe en el carrito.
2. Guardar el borrador existente y el consentimiento; no enviar datos a la cooperativa en este paso.
3. Enviar por Gmail un código de seis dígitos al correo que el solicitante desea verificar. Vigencia diez minutos, cinco fallos máximos, reenvío después de sesenta segundos e invalidación del código anterior. No obliga a crear cuenta.
4. Con el correo verificado, mostrar Enviar solicitud. El servidor revalida acceso, consentimiento, PDF y destinatario principal de Cooperativa configurado en Administración → Contacto.
5. Enviar desde GreenBel un mensaje que presente al cliente como interesado en información sobre posible financiamiento. Adjuntar el PDF congelado e íntegro de su selección; Reply-To será su correo verificado. No enviar una confirmación adicional al cliente ni registros históricos.

## Migración 030 propuesta, exclusivamente DEV

- Tabla privada greenbel_private.financing_email_challenges: ID del desafío y solicitud; HMAC del código con contexto de solicitud/correo; vencimiento, fallos, verificación/revocación, fecha de emisión y huella HMAC del origen. Nunca almacenar el código en claro. Las filas permiten aplicar límites durables por origen/correo y conservar el historial de reenvíos. Propuesta de cuota: cinco emisiones por correo/hora y veinte por origen/hora, además de la espera de sesenta segundos.
- Tabla privada greenbel_private.gmail_financing_notifications: una notificación por solicitud, destinatario obtenido exclusivamente de la configuración administrativa, estado pending/sending/sent/failed/unknown, identificador de intento, número de intentos, tiempos/código de error e ID Gmail. Reclamación atómica; no reenviar sent/sending/unknown. Reintento explícito únicamente tras rechazo inequívoco y espera, máximo cinco intentos. Si cambia el destinatario administrativo, exigir nueva confirmación en vez de enviar silenciosamente a otro buzón.
- Ampliar la restricción actual draft-only de financing_requests para reflejar verificación y aceptación de Gmail sin atribuir aprobación financiera. Las transiciones se harán mediante funciones controladas y solo con desafío verificado/consentimiento/PDF válido; no habilitar ediciones públicas.
- Funciones de servicio únicamente para preparar/validar el desafío, consultar el estado autorizado, confirmar envío, reclamar/confirmar la notificación y lectura administrativa. RLS y revocaciones para que ninguna tabla sensible sea accesible al navegador.
- Mantener el acceso protegido existente a cotización y solicitud; ningún UUID por sí solo autoriza consultar, verificar o enviar. Destinatario, remitente, precios y adjunto se construyen en servidor.
- No modificar cotizaciones emitidas ni activar borradores anteriores automáticamente. No crear nuevos permisos Google, pasarela ni servicios financieros.

## Código que puede prepararse sin aplicar el modelo

Logotipo blanco en el bloque de contacto, plantilla HTML/texto, MIME con PDF privado, formularios/estados y contratos de servidor. Reutilizar la cuenta Gmail ya autorizada, solo gmail.send, y la verificación criptográfica existente del PDF.

Nueva variable privada propuesta: FINANCING_OTP_HMAC_KEY, 32 bytes aleatorios Base64, distinta por entorno. No mostrar códigos/tokens en logs o respuestas; el código solo existe en memoria durante su envío.

## Validación y aplicación

El usuario aprobó expresamente el modelo y la migración 030 solo en DEV. Se verificó el enlace, se simuló con rollback y se aplicó 030. Evidencia y resultados: `2026-10-25-financing-implementation.md`. No se enviaron pruebas a la cooperativa real.

El usuario configuró un correo propio de prueba como principal de Cooperativa. También autorizó emitir el PDF exclusivamente para información de financiamiento con disponibilidad pendiente explícita, sin inventar existencias ni alterar las cotizaciones normales. PROD y despliegue no autorizados.

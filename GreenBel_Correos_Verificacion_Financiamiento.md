# GreenBel — Correos y verificación de financiamiento

Versión 3.0 · 29/09/2026 · Decisión vigente del usuario.

## Estado actual y prioridad

Solo el envío real de correo queda pausado. Resend será el proveedor al comprar/configurar el dominio de GreenBel. EmailJS y Microsoft Graph quedan descartados. Esta decisión sustituye las instrucciones anteriores de activar EmailJS y cualquier bloqueo basado en su plan de adjuntos.

## Qué continúa

- Formularios de contacto y financiamiento, validaciones, protección contra abuso y datos privados.
- Carrito reutilizable, cotización histórica y generación/consulta protegida del PDF.
- Persistencia de contacto como registrado sin notificación; financiamiento como borrador pendiente de verificación/envío.
- Diseño de las tres plantillas y preparación de contratos de servidor en TypeScript.
- El resto del ecommerce, Auth, inventario, pedidos, capacitaciones y pagos en pruebas según sus reglas.

## Qué permanece deshabilitado

Los tres envíos: solicitud a cooperativa, consulta a GreenBel y código OTP al solicitante. No llamar a proveedores, emitir códigos reales, consumir cuota ni programar envíos durante la pausa. No exigir credenciales de correo para arrancar el catálogo o los formularios. No crear mensajes pendientes que se despachen automáticamente al reactivar.

El backend debe imponer la pausa, aunque se invoque directamente el endpoint. El frontend mostrará “Consulta registrada; notificación por correo pendiente” solo si se guardó correctamente, y “Borrador guardado; envío a cooperativa no disponible temporalmente” para financiamiento. No decir “enviado”, “correo verificado” ni “cooperativa notificada”. Un fallo de persistencia muestra error y conserva entradas.

## Flujo definitivo conservado para la integración posterior

1. Solicitud sin cuenta con acceso protegido; cotización y PDF congelados.
2. Consentimiento para compartir datos y cotización.
3. OTP de seis dígitos: 10 minutos de vigencia, máximo cinco intentos fallidos, reenvío tras 60 segundos. Revocar anterior y al cambiar correo; consumo atómico de un uso.
4. Tras verificación, acción explícita “Enviar solicitud”. Revalidar acceso, consentimiento, cotización, PDF y destinatario.
5. From GreenBel; To cooperativa configurada; Reply-To solicitante verificado. PDF adjunto automático obligatorio. No exigir descargar/subir nuevamente.
6. Contacto: From GreenBel; To buzón GreenBel; Reply-To visitante validado. No OTP obligatorio para contacto.
7. OTP: destinatario correo por verificar. No crea cuenta ni demuestra identidad financiera.

No enviar confirmación extra de financiamiento al cliente ni correos de pedidos/entregas en esta fase. La aceptación del proveedor no acredita entrega, lectura o crédito aprobado. Financiamiento no reserva ni cobra.

## Contrato técnico propuesto

Crear interfaz de correo y adaptador deshabilitado que devuelva un resultado inequívoco `disabled` sin efecto externo. El adaptador Resend se integrará posteriormente. Pruebas automatizadas pueden usar dobles claramente identificados; no simular éxito en el sitio ni persistir verificaciones ficticias.

Reutilizar `financing_requests`, `contact_messages`, `guest_access_grants` y `email_messages` de etapa 3, que sigue propuesta. No crear migraciones hasta validar modelo. No persistir OTP en claro, PDF Base64 ni secretos en snapshots. Usar HMAC privado para desafíos; controles atómicos y límites por solicitud/correo/origen.

Remitente, destinatario, monto, plantilla y PDF se construyen en servidor; no aceptar esos valores del navegador. Correo exclusivamente en servidor; deduplicación persistente, autorización, reintentos acotados e incertidumbre explícita. `sent`/`sent_at` en el modelo significa aceptación del proveedor, no entrega. En pausa no asignar ese estado ni fecha.

## Reactivación futura

Configurar dominio y remitente de Resend, credencial solo servidor, buzón GreenBel y destinatario confirmado de cooperativa; verificar campos y consentimiento. Probar los tres correos y PDF con destinatarios controlados. Mantener DEV aislado. Solo entonces habilitar el modo de envío acordado. No enviar históricos automáticamente: nueva confirmación del usuario y revisión de vigencia/consentimiento antes de remitir un borrador.

Supabase Auth tiene su propia configuración de correo y no se modifica automáticamente por estos controles. No omitir confirmaciones o recuperación de cuentas; informar dependencias pendientes.

## Criterios de aceptación durante la pausa

- Sin claves de correo, la aplicación funciona para tareas independientes.
- Ninguna acción, reintento, cron o worker provoca correos externos.
- Contacto guarda una sola consulta ante doble clic; no afirma notificación.
- Financiamiento conserva borrador/PDF privado sin marcarlo verificado o enviado.
- No se omiten controles de acceso ni consentimiento.
- Las pruebas del proveedor real quedan “NO EJECUTADO — integración pausada”.

## Referencias para consultar al integrar

https://resend.com/docs/examples
https://resend.com/docs/send-with-nextjs

Consultar las versiones vigentes cuando se reactive. No se ha integrado ni probado Resend en esta entrega documental.

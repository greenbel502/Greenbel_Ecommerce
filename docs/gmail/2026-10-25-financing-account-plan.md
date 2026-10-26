# Financiamiento con sesión, sin OTP · cambio solicitado · modelo 031 DEV

La instrucción actual sustituye el OTP específico de financiamiento por la sesión Supabase existente. Contacto continúa siendo público. Para solicitar información de financiamiento se exige cuenta con sesión, perfil activo y el correo de esa cuenta. No se permite sustituirlo por un correo arbitrario escrito en el formulario. Se conserva consentimiento y revisión/confirmación del PDF.

**Modelo y migración 031 aprobados expresamente por el usuario y aplicados exclusivamente en DEV.** Se comprobó la referencia enlazada, la simulación con rollback, el dry-run y la paridad local/remota. Evidencia final y límites: [implementación](2026-10-25-financing-account-implementation.md).

Cambio aprobado, conforme a AGENTS.md:

- Añadir a `public.financing_requests` dos columnas privadas (tabla ya restringida): `account_user_id`, FK a profiles, y `account_authenticated_at`, fecha de asociación validada por servidor. Datos antiguos se conservan sin completar ni enviar.
- Nuevo consentimiento `finance-account-v3` para solicitudes nuevas. El backend obtiene el usuario desde Supabase Auth y la base comprueba que la cuenta/perfil están activos y el correo coincide. Las funciones vinculan cada solicitud a ese usuario; una sesión de otra cuenta no puede leer, descargar ni enviar por conocer un UUID o un token antiguo.
- Sustituir las funciones de borrador/estado/reclamación por funciones de cuenta. Mantener una notificación por solicitud, confirmación final, destinatario administrativo congelado, PDF privado, protección ante duplicados y reintentos seguros. El panel administrativo conserva acceso autorizado a las solicitudes.
- Retirar los permisos de ejecución del runtime para el flujo antiguo de OTP/anónimo. Conservar sus tablas e historial; no fingir códigos verificados ni despachar solicitudes antiguas. El endpoint de códigos deja de emitirlos.
- No modificar Auth, RLS públicas de otras áreas, cotizaciones normales, pagos, inventario ni producción. Migración 031 únicamente en DEV.

Trabajo independiente que se prepara en paralelo: resumen compacto y desplegable con miniaturas/cantidades/precios, CSS modular para evitar reglas globales perdidas; aviso en el ingreso y retorno seguro a Financiamiento. Plantilla de financiamiento con los dos logotipos mediante imágenes HTTPS públicas estables, sin partes MIME de imagen; solo el PDF será adjunto. Se comprobará recepción real en el mismo buzón controlado configurado por el usuario, sin contactar una cooperativa real.

Resultado: implementado y comprobado en Chrome/Gmail. Bucket DEV `email-assets` público exclusivamente para las dos imágenes de marca ya públicas, objetos por hash y escritura anónima rechazada. No se hicieron públicos PDF, solicitudes ni credenciales. La prueba final fue recibida con un único PDF; Gmail bloqueó inicialmente las imágenes por Spam y las cargó tras marcar ese mensaje de prueba como «No es spam». No se enviaron históricos.

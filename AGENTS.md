# GreenBel — Instrucciones de entrada para agentes

Paquete consolidado · 29/09/2026. Leer este archivo al iniciar. Es documentación, no prueba de implementación ni autorización de producción.

## Orden de lectura

1. `GreenBel_Reglas_Negocio_Etapa_1.md`: reglas aprobadas y pendientes.
2. `GreenBel_Secciones_Flujos_Etapa_2.md`: navegación, catálogo y recorridos.
3. `GreenBel_Correos_Verificacion_Financiamiento.md`: decisión vigente de pausa y flujo futuro.
4. `GreenBel_Modelo_Datos_Etapa_3.md`: propuesta de tablas, relaciones y seguridad; requiere validación antes de migrar.
5. `GREENBEL_VARIABLES_DE_ENTORNO.md` y `.env.example`: configuración DEV/PROD y CLI.
6. `GreenBel_Agentes/00_Guia_Uso_Investigacion.md` y el perfil correspondiente a la tarea.

## Decisiones vigentes

Next.js con TypeScript; Supabase PostgreSQL y Auth correo/contraseña; Vercel; proyectos DEV y PROD separados. Recurrente previsto, no confirmado; pagos inicialmente en pruebas. Nombre público Capacitaciones. Productos sin precio publicados con “Precio próximamente”. Seguir reglas de carrito, inventario y cotización de etapas 1/2.

Solo el envío real de los tres correos está pausado. Integración futura con Resend tras dominio/configuración. No implementar EmailJS ni Graph. Mantener formularios/PDF/persistencia; contacto registrado sin correo y financiamiento en borrador. No omitir OTP ni simular verificación o envío. No despachar registros acumulados al activar después. Auth se trata por separado.

## Precedencia y pendientes

**Actualización autorizada · 25/10/2026:** la notificación de consultas de `/contacto` usa Gmail API mediante OAuth administrativo y scope exclusivo `gmail.send`. Esta decisión sustituye para contacto la pausa y la futura elección de Resend descritas arriba. Financiamiento y OTP se habilitaron por petición explícita posterior, modelo y migración 030 aprobados solo en DEV: consentimiento, PDF privado, código de correo y confirmación final; destinatario principal de Cooperativa en Contacto. No enviar borradores históricos. Ver `docs/gmail/2026-10-25-financing-implementation.md`. No enviar registros históricos al conectar/reconectar. Modelo Gmail aprobado por el usuario; migración 028 y corrección 029 del mismo modelo solo en DEV. Ver `docs/gmail/2026-10-25-implementation.md`. Producción, commit/push y despliegue continúan requiriendo autorización explícita.

**Compra por WhatsApp · 25/10/2026:** exige cuenta con sesión y perfil activo, también en servidor. Contacto sigue siendo anónimo. El usuario elige efectivo/transferencia y retiro/envío a domicilio como preferencias que se adjuntan al mensaje y PDF; no son cobros ni servicios operativos activados. Mostrar total de productos por precio × cantidad; envío separado por coordinar. Ver `docs/commerce/2026-10-25-purchase-total-auth.md`.

**Financiamiento con cuenta · modelo 031 aprobado y aplicado solo DEV:** la petición posterior del usuario retira el OTP específico de financiamiento y exige sesión Supabase, perfil activo y correo de esa cuenta. Conserva consentimiento, PDF privado y confirmación final. El endpoint de códigos no emite correos; no reactivar el flujo anónimo ni enviar solicitudes históricas. Los dos logos del correo son recursos públicos HTTPS; solo el PDF se adjunta. Contacto continúa público. Ver `docs/gmail/2026-10-25-financing-account-implementation.md`. Esta decisión sustituye el OTP de 030, sin cambiar la confirmación de cuentas de Supabase Auth.

**Identidad y notificaciones · 26/10/2026:** aplicar el manual oficial completo a nuevas plantillas y a las existentes dentro del trabajo solicitado; paleta #1E3A1F/#3A4813/#80BA01/#E7E7CF, logos originales proporcionados, proporciones y área de protección. PDFs nuevos con logo GreenBel y fotos del catálogo incrustadas; correos de financiamiento con el logo de Cooperativa a color, conservando el blanco para el formulario. Las notificaciones transitorias usan Sileo mediante `presentation/notifications/notify.ts` y el proveedor global. Las confirmaciones requieren un modal y una decisión explícita (`useConfirm`); conservar validación y feedback persistente junto al campo/formulario. Ver `docs/qa/2026-10-26-documentos/implementation.md`. Mont completa sigue pendiente; no volver a usar los glifos con marca DEMO.

**Reseñas WhatsApp · modelo 032 aprobado y aplicado solo DEV, 26/10/2026:** al continuar con PDF/WhatsApp se ofrece una reseña de la experiencia de solicitud, con cuenta activa, 1–5 estrellas y comentario. Una por invitación emitida por servidor; reintento idéntico idempotente. Queda pendiente de moderación; tabla con panel derecho, publicación/ocultación por motivos aprobados, original inmutable y auditoría. Inicio muestra solo publicadas, con nombre de pila. No acredita mensaje enviado, compra ni entrega; no altera las reseñas de productos entregados. Ver `docs/reviews/2026-10-26-plan.md` y `docs/qa/2026-10-26-resenas/implementation.md`.

Las instrucciones explícitas actuales del usuario prevalecen. La pausa documentada prevalece sobre frases históricas de “enviar” en las etapas y perfiles. Stack y Auth ya están confirmados: pendientes históricos de esa materia quedan resueltos. La etapa 2 concreta catálogo/navegación. La etapa 3 no convierte propuestas en aprobaciones. Si queda una contradicción comercial real, completar tareas independientes y preguntar solo lo imprescindible.

## Ejecución

Inspeccionar repositorio, instrucciones existentes y versiones antes de editar; no imprimir `.env`. Si existe otro AGENTS.md, integrar estas reglas sin borrar instrucciones ajenas. Los perfiles son roles para una misma IA o sesiones separadas; no crean agentes automáticamente ni autorizan delegación.

Bucle obligatorio: observar → acción acotada → verificar → corregir → repetir hasta cumplir el objetivo autorizado o documentar bloqueo real. Mantener evidencia y una nota breve de continuidad; no inventar resultados. Usar condiciones de parada del perfil. No ampliar el alcance para “completar” pendientes comerciales.

CLI: trabajar solo con DEV autorizado, comprobar referencia enlazada y no exponer secretos. No aplicar migraciones hasta validar el modelo. No hacer commit/push/despliegue, cambios PROD, cobros reales ni envíos por inferencia. Los permisos explícitos vigentes del usuario se conservan.

## Configuración mínima vigente

**Gmail por entorno · 26/10/2026:** por petición explícita del usuario, `APP_ENV` selecciona `GOOGLE_GMAIL_DEV_CLIENT_ID/CLIENT_SECRET/REDIRECT_URI` o sus equivalentes `GOOGLE_GMAIL_PROD_*`. Remitente y destinatario usan `GMAIL_SENDER_DEV_EMAIL`/`GMAIL_NOTIFICATION_DEV_EMAIL` o sus equivalentes PROD. La clave conserva el nombre común `GMAIL_TOKEN_ENCRYPTION_KEY`, sin rotar sus valores. No recurrir al otro entorno ni a los nombres globales antiguos del cliente/correos. El inicio con Google sigue configurado en Supabase y es independiente. Ver `.env.gmail.example` y `docs/gmail/2026-10-26-environment-names.md`.

Usar el `.env.example` incluido y la guía de entorno actualizada al archivo compartido por el usuario. No exigir variables futuras para arrancar funciones independientes. PROD y Resend pueden estar vacíos en DEV con correo pausado. Modo de correo ausente significa disabled. Credenciales CLI solo para herramientas DEV; no para el runtime.

**Bell · modelo 033 aprobado y aplicado solo DEV, 26/10/2026:** chatbot integrado en Next.js/Supabase, catálogo real por SQL, FTS español/trigramas y respuestas revisadas; conversaciones privadas con sesión, idempotencia y cuotas. Admin `/admin/chatbot`, tablas y paneles derechos. pgvector/cola/adaptador preparados, sin motor de embeddings configurado ni inferencia semántica activa. No añadir APIs comerciales ni asumir hosting/servidores. No modificar checkout o Auth para Bell. Ver `docs/chatbot/2026-10-26-implementation.md`; producción/despliegue no autorizados. Esta aclaración específica del usuario prevalece sobre referencias históricas al hosting en otros documentos.

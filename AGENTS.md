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

Las instrucciones explícitas actuales del usuario prevalecen. La pausa documentada prevalece sobre frases históricas de “enviar” en las etapas y perfiles. Stack y Auth ya están confirmados: pendientes históricos de esa materia quedan resueltos. La etapa 2 concreta catálogo/navegación. La etapa 3 no convierte propuestas en aprobaciones. Si queda una contradicción comercial real, completar tareas independientes y preguntar solo lo imprescindible.

## Ejecución

Inspeccionar repositorio, instrucciones existentes y versiones antes de editar; no imprimir `.env`. Si existe otro AGENTS.md, integrar estas reglas sin borrar instrucciones ajenas. Los perfiles son roles para una misma IA o sesiones separadas; no crean agentes automáticamente ni autorizan delegación.

Bucle obligatorio: observar → acción acotada → verificar → corregir → repetir hasta cumplir el objetivo autorizado o documentar bloqueo real. Mantener evidencia y una nota breve de continuidad; no inventar resultados. Usar condiciones de parada del perfil. No ampliar el alcance para “completar” pendientes comerciales.

CLI: trabajar solo con DEV autorizado, comprobar referencia enlazada y no exponer secretos. No aplicar migraciones hasta validar el modelo. No hacer commit/push/despliegue, cambios PROD, cobros reales ni envíos por inferencia. Los permisos explícitos vigentes del usuario se conservan.

## Configuración mínima vigente

Usar el `.env.example` incluido y la guía de entorno actualizada al archivo compartido por el usuario. No exigir variables futuras para arrancar funciones independientes. PROD y Resend pueden estar vacíos en DEV con correo pausado. Modo de correo ausente significa disabled. Credenciales CLI solo para herramientas DEV; no para el runtime.

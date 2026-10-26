# Notificaciones en la parte superior central — 26/10/2026

Petición del usuario: todas las notificaciones transitorias arriba, en medio.

Se establece `NOTIFICATION_POSITION = "top-center"` tanto en el proveedor global como en cada llamada de la API central `notify`. Se retira el desplazamiento derecho; se conserva la separación superior de 20 px. La posición por llamada evita que una alerta temprana o un remontaje de Sileo conserve su valor predeterminado a la derecha. Se mantienen los modales de confirmación y el comportamiento de las operaciones.

Verificado en Chrome mediante un error de validación del formulario de acceso (`qa@local`, rechazado antes de consultar Supabase Auth), sin registrar consultas, enviar correos ni alterar el carrito:

- Escritorio 1440 px: centro de la alerta = 720 px; `data-position=top-center`.
- Móvil 390 px: centro de la alerta = 195 px; `data-position=top-center`.
- Sin desbordamiento horizontal. Los tamaños temporales del navegador se restauraron.
- ESLint de los dos módulos y TypeScript: PASS. Suite completa: 155 pruebas PASS.

Capturas y trazas de QA se conservan localmente. El repositorio es público: no se versionan credenciales, exportaciones de prueba ni capturas que puedan mostrar datos de cuentas.

Archivos: `src/presentation/notifications/notify.ts` y `notification-provider.tsx`.

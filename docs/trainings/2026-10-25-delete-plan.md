# Eliminación de capacitaciones desde modal · propuesta DEV

## Petición actual

Agregar Eliminar junto a Editar, con modal de confirmación. El modal identifica por título la capacitación e indica expresamente que se retirarán el video, la portada, las calificaciones y las asociaciones. Cancelar no envía ninguna solicitud; el doble clic queda bloqueado durante el borrado. La petición implementa una acción del panel; no autoriza eliminar desde herramientas la capacitación real del usuario para probar.

## Extensión concreta para validar

El modelo 025 utiliza claves RESTRICT para calificaciones y asociaciones. No se deben quitar esos registros mediante llamadas independientes: una falla intermedia dejaría una capacitación existente con votos o vínculos perdidos. Se propone **migración 026 solo DEV**, que agrega únicamente la función transaccional `public.admin_delete_training(uuid,text,uuid)`; no altera tablas, columnas, claves foráneas ni políticas RLS.

La función tendrá ejecución exclusiva de `service_role`, nunca de anónimo/autenticado. La Server Action comprueba Auth y administrador activo, y obtiene el actor de esa sesión; no acepta un actor enviado por el navegador. La función vuelve a comprobar cuenta activa y rol, bloquea la capacitación, comprueba título esperado y elimina únicamente sus calificaciones, enlaces a productos/categorías y capacitación en una sola transacción. Una falla revierte todas esas operaciones. Los productos y categorías maestros no se borran. Devuelve las rutas privadas del registro eliminado para su limpieza.

Después de confirmar la transacción, el servidor elimina solamente el video y portada cuyas rutas pertenezcan al mismo UUID. No se borra Storage si falla la transacción. Como Storage y PostgreSQL no comparten transacción, un fallo posterior de archivos se comunica como limpieza pendiente; nunca se informa que todos los archivos se borraron si no fue confirmado. El contenido ya eliminado deja de servirse por sus rutas controladas.

## Preparado y revisión prevista

Botón y modal reutilizan la confirmación existente de marcas/categorías/productos. Acción de servidor preparada para esta función; validación local de cancelar, error, doble clic y éxito. Antes de aplicar la migración se solicita validar esta extensión, conforme a AGENTS.md. No se crea/aplica SQL de migración hasta recibir esa validación.

Después de la aprobación: comprobar DEV enlazado e historial, aplicar únicamente 026, ejecutar fixture efímera con portada/video/voto y asociaciones; confirmar borrado total y actualización de promedios, rechazo a anónimo/cliente/operador/inactivo, comprobación de título obsoleto sin pérdidas y limpieza. Conservar exactamente los datos previos y la capacitación real del usuario. Sin PROD, correo, cobros o publicación Git.

## Estado

El usuario indicó **«termina donde te quedaste por favor»** después de informarle que el único paso pendiente era completar la operación mediante la migración 026 solo DEV. Se continúa con ese alcance concreto ya presentado. La migración se prepara sobre el modelo 025 existente, sin alterar tablas/FK/RLS. La acción se declarará operativa únicamente después de aplicar y verificar el borrado real con fixtures propias.


## Cierre verificado

Operación completada en DEV: 026 aplicada y 027 aplicada para corregir la respuesta de conflicto de esa misma función. **27 comprobaciones DEV/HTTP, 12 DOM y 5 unitarias PASS**; Chrome real revisado a 389/820/1440 CSS px y teclado. Datos anteriores preservados. El estado final y los fallos previos documentados están en `2026-10-25-delete-implementation.md`.

# 022 · Directorio administrativo de usuarios

- Aprobación explícita del usuario: **18/10/2026**, función de lectura y migración exclusivamente DEV.
- Archivo: `supabase/migrations/20261018002200_admin_user_directory.sql`.
- SHA-256: `afdb7260ae5cf3d4e0468c339ea14ad8b37aa29d57db84664e3204ddefc64279`.
- Aplicada en DEV con CLI, después de comprobar APP_ENV/URL/referencia enlazada e historial remoto 001–021. Dry-run enumeró solamente 022; el aplicador volvió a verificarlo antes del push de base.
- Lectura posterior independiente mediante herramientas de proyecto: historial **22**, función presente, columnas revisadas y `set_user_access` conservadas. La primera comprobación automática de esa lectura esperaba HTTP 200, pero la API devuelve 201; se corrigió el aserto y se releyó, sin repetir la migración.

## Alcance

`admin_list_users` devuelve únicamente id, nombre, correo, teléfono, rol, estado, fecha y total de resultados. Une tablas existentes; no copia correos ni crea tablas. Búsqueda literal, filtros rol/estado, orden permitido, páginas 10/25/50 y corrección de página fuera de rango. Sin SQL dinámico, credenciales, metadata privada ni privilegios de escritura nuevos.

La función exige una sesión con perfil activo y rol admin comprobados en base. El permiso EXECUTE se concede solo a authenticated, con guard interno; clientes y operadores no acceden. `search_path` fijo y referencias cualificadas. Las protecciones de cambio de acceso propio/último admin y auditoría permanecen en la función 017 existente.

## Promoción futura

No aplicada ni autorizada en PROD. Antes de promover: reconciliar historial PROD, revisar este SQL y su checksum, respaldar según el proceso aprobado y aplicar 022 una sola vez después de sus dependencias. El merge de código no aplica migraciones. La nueva página de usuarios necesita esta función; si falta, muestra error seguro y no descarga todas las cuentas como alternativa.

Ver las verificaciones funcionales y límites de evidencia en `docs/admin-redesign-progress.md`.

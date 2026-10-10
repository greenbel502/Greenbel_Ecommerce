# GreenBel: revisión de la primera migración

> **Archivo histórico (revisión local previa).** Las frases «no aplicada» y «NO EJECUTADO» siguientes describen el estado al redactar esta revisión, no el estado actual. Las migraciones 001–020 constan en el historial de Supabase DEV; los permisos y recorridos comprobados, con sus límites, están en [GREENBEL_AVANCE.md](../GREENBEL_AVANCE.md). No modifica PROD.

**Estado:** preparada localmente, **NO APLICADA**. Alcance: identidad mínima, catálogo, contenido institucional y Capacitaciones del modelo aprobado. No incluye pedidos, cotizaciones, inventario, pagos, correo, financiamiento ni Storage.

## Punto de partida y conservación

- El coordinador comprobó mediante el panel Supabase de DEV, con referencia de proyecto cotejada contra la configuración DEV, que public no tenía tablas ni vistas y que el historial de migraciones indicaba «Run your first migration». Esta evidencia fue comunicada al preparar este archivo; quien aplique debe repetir la verificación de destino y estado inmediatamente antes.
- La migración heredada 001_initial_schema.sql era incompatible con el modelo aprobado y **no estaba aplicada en ese DEV**. Su contenido se conservó íntegro en supabase/legacy/001_initial_schema.sql (SHA-256 1f7ebe60004b1a6f2248bbb0e1a7ff03838e2b80be761e0f4a376fd65fb3a1e8). No modificar ni ejecutar el legado.
- supabase/migrations/20260929000100_catalog_foundation.sql es la primera migración activa. No siembra usuarios, productos, precios, existencias, marcas, contenido ni proveedores.

## Contenido y límites del bloque

La migración crea perfiles y rol customer por defecto ligados a Supabase Auth, sin tomar roles de metadatos editables. Los usuarios Auth que ya existan reciben únicamente ese rol. Un administrador deberá establecerse después mediante un procedimiento controlado y auditado; esta migración no promueve a nadie.

También crea contenido institucional acotado, marcas, jerarquía de categorías sin ciclos, productos con precio regular nulo permitido, imágenes, especificaciones, bloque «Incluye», compatibilidad equipo–repuesto, ofertas y Capacitaciones con vínculos a productos/categorías. La ficha publicada sin precio aparece en la vista catalog_products con precio regular y efectivo nulos; la aplicación presenta «Precio próximamente» y mantiene bloqueadas sus acciones monetarias.

Una oferta habilitada exige precio base, precio final positivo inferior al regular y ausencia de otro intervalo habilitado superpuesto. El cambio del precio base obliga a deshabilitar y revisar ofertas presentes o futuras. La publicación de video requiere por ahora una URL HTTPS, porque la entrega desde Storage todavía no está configurada. La ruta de video en Storage puede prepararse en borrador, pero no publicarse como única fuente en este bloque.

RLS está habilitado en cada tabla nueva. anon y authenticated solo reciben lectura de datos públicos aprobados, y un usuario autenticado lee/edita sus columnas de perfil permitidas y lee su propio rol. No reciben escritura directa de catálogo ni facultad de asignarse roles. Las vistas catalog_products y catalog_trainings usan seguridad del invocador y dependen de políticas y permisos de columna en las tablas base. service_role tiene privilegios para futuros comandos de servidor, que deberán comprobar identidad, rol, entradas y auditoría antes de usar la clave privilegiada. El servidor debe validar el esquema JSON de site_content antes de publicar; la base comprueba clave permitida, versión y tipo objeto, sin inventar aún la estructura de cada página.

No se crea saldo de inventario ni se copia stock del legado. Antes de ese bloque se debe auditar la estructura y los datos realmente presentes en DEV, definir stock inicial verificado y probar la concurrencia web/física. No existe disponibilidad comercial en la vista de este bloque.

## Preflight obligatorio antes de aplicar

Ejecutar solo consultas de lectura contra el **proyecto DEV verificado**. No imprimir URL completa, claves, contraseña ni datos personales:

    select current_setting('server_version_num')::integer as postgres_version_num;
    select to_regclass('auth.users') as auth_users_table;
    select rolname from pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
    order by rolname;
    select n.nspname, c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    order by c.relname;
    select to_regnamespace('greenbel_private') as greenbel_private_schema;
    select count(*) as existing_auth_accounts from auth.users;

**Detener la aplicación** si la referencia enlazada no coincide con SUPABASE_DEV_PROJECT_REF, PostgreSQL es anterior a 15, falta Auth o alguno de los roles API, hay cualquier tabla, vista o secuencia en public, existe greenbel_private, el historial de migraciones ya contiene una entrada o el estado difiere de la evidencia anterior. La migración tiene además una guarda transaccional para varias de estas condiciones, pero no sustituye este preflight.

Revisar la lista exacta de archivos en supabase/migrations antes de aplicar: debe figurar la primera migración nueva y el legado debe estar solo en supabase/legacy. El movimiento local por sí solo no cambia la base. Aplicar con el runner de migraciones de Supabase y su historial, no pegando el SQL en el editor. Verificar la versión y el comportamiento transaccional del runner antes de aplicar; el archivo no incluye BEGIN/COMMIT propios.

## Verificación local ejecutada

**PASS — PostgreSQL 15.14 local aislado:** se inició en un socket Unix bajo /private/tmp, con TCP deshabilitado y tablas Auth ficticias. La migración final se ejecutó completa en una base limpia mediante psql --single-transaction. Las 14 tablas creadas tenían RLS habilitado y las dos vistas declararon security_invoker. El trigger de alta Auth creó dos perfiles y dos roles customer con cuentas ficticias.

**PASS — lectura y aislamiento:** 12 aserciones comprobaron que anon ve solo dos productos publicados, una imagen y un contenido publicados, una capacitación publicada; no ve borradores ni el producto de categoría inactiva. El producto sin precio conservó precios regular y efectivo nulos; una oferta ficticia del 10 % sobre 100 dio 90. Una cuenta autenticada leyó solo su perfil y rol customer. La lectura anónima de perfiles y de una columna interna de producto, la escritura anónima de contenido y la autoasignación del rol admin fueron rechazadas por privilegios. Un cliente no pudo modificar el perfil ajeno (0 filas), pero sí el suyo (1 fila).

**PASS — integridad:** se rechazaron oferta habilitada sin precio, oferta superpuesta, precio final sin descuento, cambio de precio base con oferta habilitada, ciclo de categoría, compatibilidad con tipos invertidos y publicación de capacitación sin video. En otra base local con una tabla public.products preexistente, el preflight detuvo la migración y se confirmó que no se creó greenbel_private ni otra tabla nueva.

La primera ejecución local encontró un identificador reservado en la función de ofertas; se corrigió y se repitió la migración desde una base limpia con las aserciones anteriores. Esta prueba local verifica sintaxis y comportamiento en PostgreSQL 15.14; no acredita el estado, permisos ni configuración de Supabase DEV.

## Verificación pendiente en DEV

1. **NO EJECUTADO:** aplicar en DEV identificado y comprobar tablas, índices, funciones, triggers, RLS, grants y vistas.
2. **NO EJECUTADO:** registrar dos cuentas Auth y comprobar perfil/rol customer; impedir que cliente A lea o cambie perfil/rol de B y que cualquiera se autoasigne admin.
3. **NO EJECUTADO:** con datos ficticios marcados como DEV, comprobar que borradores no aparecen al público; un producto publicado con precio nulo conserva ambos precios nulos en la vista; una oferta válida calcula el precio y dos ofertas superpuestas se rechazan.
4. **NO EJECUTADO:** impedir ciclos de categoría, compatibilidades de tipos erróneos y cambio de precio base con oferta habilitada; comprobar acceso a imágenes, especificaciones y videos solo de entidades publicadas.
5. **NO EJECUTADO:** comprobar el flujo real de Auth correo/contraseña, incluida confirmación y recuperación según su configuración independiente de la pausa de correos comerciales.

**Archivo heredado:** el hash original se conservó. No se ejecutó ningún SQL en DEV ni PROD. Las políticas y el flujo Auth real aún requieren prueba en el Supabase DEV enlazado antes de declarar PASS para ese ambiente.

## Reanudación

Siguiente paso: cuando vuelva a estar disponible una vía de migración con historial, repetir el preflight y comprobar el proyecto DEV enlazado. La aprobación del modelo y de crear/aplicar migraciones en DEV ya fue otorgada; ejecutar esta migración una sola vez allí, verificar con roles anon, authenticated y dos cuentas, y corregir cualquier fallo mediante una nueva migración pequeña. El bloque de pedidos/inventario se prepara localmente por separado y tampoco se aplica antes de validar sus dependencias.

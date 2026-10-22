# Acceso administrativo en Supabase DEV

Este procedimiento crea el **primer** administrador operativo de DEV. Es una provisión manual de Auth; **no** comprueba el registro público ni la confirmación por correo. No cambia la configuración de confirmación de Supabase Auth.

## 1. Comprobar el destino

Desde la raíz del proyecto, con el `.env` DEV local e ignorado por Git:

```bash
node --env-file=.env scripts/dev-target-preflight.mjs
node --env-file=.env scripts/dev-supabase-cli.mjs list
```

Comprueba en el Dashboard que el proyecto seleccionado sea el mismo DEV indicado por `SUPABASE_DEV_PROJECT_REF` y `DEV_SUPABASE_URL`. No uses el proyecto PROD. La primera orden comprueba la configuración local; la segunda consulta el historial remoto enlazado.

## 2. Crear una cuenta Auth de administración DEV

En **Authentication → Users** del proyecto DEV, crea manualmente un usuario con un correo que controles y una contraseña fuerte introducida allí. Como aún no hay SMTP de Auth para el registro público, esta cuenta inicial puede confirmarse **administrativamente** desde Supabase. Esta acción es solo para habilitar el panel DEV: no demuestra que un comprador pueda registrarse o recibir un correo de confirmación.

Guarda la contraseña en tu gestor de contraseñas. No la pongas en `.env`, SQL, comandos, capturas, tickets ni archivos del repositorio. Copia el UUID del usuario desde Auth; el UUID no es una credencial.

## 3. Asignar el primer rol admin

En el **SQL Editor del mismo proyecto DEV**, sustituye únicamente el UUID de ejemplo y ejecuta esta transacción. Debe existir el perfil y rol `customer` creados por el trigger de Auth. El bloque se detiene si ya hay un administrador activo; en ese caso usa `/admin/usuarios` con una cuenta admin existente.

```sql
begin;
do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000000';
begin
  if exists (
    select 1 from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id
    where ur.role = 'admin' and pr.active
  ) then
    raise exception 'Ya hay un administrador activo; usa el panel de usuarios';
  end if;
  if not exists (
    select 1 from auth.users au
    join public.profiles pr on pr.id = au.id
    join public.user_roles ur on ur.user_id = au.id
    where au.id = v_user_id and au.email_confirmed_at is not null
      and pr.active and ur.role = 'customer'
  ) then
    raise exception 'El usuario Auth DEV no está confirmado, activo o en rol customer';
  end if;

  update public.user_roles set role = 'admin' where user_id = v_user_id;
  insert into public.audit_events(actor_id, entity_type, entity_id, action, changes)
  values (null, 'user', v_user_id, 'dev_admin_bootstrap',
    jsonb_build_object('source', 'manual DEV bootstrap', 'newRole', 'admin'));
end
$$;
commit;
```

Verifica en el mismo DEV que `user_roles.role = 'admin'` y `profiles.active = true` para ese UUID. No copies el resultado con correo o datos personales a un registro público.

## 4. Entrar y probar permisos

Ejecuta `npm run dev`, abre `/cuenta/ingresar` y entra con la cuenta creada. El catálogo se conecta a Supabase DEV por defecto si están configuradas `DEV_SUPABASE_URL` y `DEV_SUPABASE_PUBLISHABLE_KEY`. Abre `/admin/catalogo`, `/admin/ventas`, `/admin/entregas` y `/admin/usuarios`. Desde `/admin/usuarios`, un administrador activo puede asignar roles posteriores o suspender operaciones; no puede quitarse su propio acceso.

Abre una ventana privada sin sesión para comprobar que las páginas administrativas no revelen datos. Una cuenta `customer` no debe acceder al panel. Las operaciones monetarias usan exclusivamente datos **PRUEBA DEV** hasta que se aprueben valores reales.

## Asignación puntual autorizada · 18/10/2026

Por solicitud explícita del usuario se habilitó como `admin` su cuenta existente en DEV, después de explicar los roles. Ya existía otro administrador: no se ejecutó ni se relajó el bootstrap anterior. Se realizó una asignación administrativa puntual y atómica, con el bloqueo de administración y un evento `dev_admin_grant` que identifica la autorización y su origen externo a una sesión de la aplicación. La lectura posterior confirmó el rol, el perfil activo, la confirmación de correo y la identidad Google conservados, sin cambios en los roles o estados de otras cuentas.

No requiere migración ni nuevas credenciales. Con la sesión habitual, recarga la página y abre perfil → **Panel administrativo**, o entra en `/admin/catalogo`. Para las siguientes asignaciones usa `/admin/usuarios`. La comprobación de persistencia y auditoría se ejecutó en Supabase DEV; la navegación con la sesión personal del usuario queda a su prueba. Los correos de negocio siguen pausados y PROD no se modificó. No se registran aquí identificadores personales ni credenciales.


## Entrada actual del panel · 18/10/2026

Con el servidor de `Greenbel_Ecommerce` en el puerto 3000, abre **http://localhost:3000/admin**. El menú del perfil y Mi cuenta enlazan al inicio del panel. Administradores y operadores reciben únicamente los módulos de su rol; cada página/acción valida los permisos en servidor. La tabla de usuarios requiere 022, ya aplicada en DEV. La búsqueda incluye correo sin descargar todas las cuentas. Las asignaciones posteriores se gestionan con confirmación desde Usuarios, conservando el bootstrap anterior exclusivamente para un primer administrador.

# Registro de migración 021 — perfil del cliente

## Identificación y autorización

- Archivo: [`supabase/migrations/20260929002100_customer_profile_preferences.sql`](../../supabase/migrations/20260929002100_customer_profile_preferences.sql).
- Versión Supabase: `20260929002100`, siguiente de la secuencia histórica 001–020. El identificador conserva esa secuencia; la aprobación/aplicación efectiva de esta ampliación ocurrió el **13/10/2026**.
- SHA-256 del archivo aplicado: `c69dafdeb953eeeed5673caf61c8ef0499be8e2477e9ea558d4157a7eaa34b7e`.
- Modelo: [extensión aprobada](../modelo-perfil-cliente-dev.md). Respuesta expresa del usuario: «Apruebo la ampliación en DEV». Solicitó también conservar el registro para la futura actualización de PROD.
- Copia activa: `/Users/diederichsolis/Desktop/Greenbel_Ecommerce`, rama `dev`, base `710c1ae`. El SQL y este registro están en el árbol de trabajo, **sin commit/push/merge**.

## Cambios incluidos

1. `profiles.address_line` opcional, 5–500 caracteres cuando se guarda.
2. `profiles.avatar_path` opcional, ruta del propio UUID y archivo `.webp` con UUID válido.
3. Restricciones y comentarios; permisos SELECT/UPDATE solo para esas columnas, con las políticas existentes de fila propia. No se concede modificar `active`, IDs o roles.
4. Bucket `profile-avatars` **privado**, WebP, límite de 2 MB.
5. Cuatro políticas de Storage (SELECT, INSERT, UPDATE y DELETE), restringidas a ese bucket, carpeta propia y perfil activo. UPDATE comprueba ruta anterior y nueva.

No se elimina/recrea ninguna tabla ni se modifica catálogo, inventario, totales, pedidos, snapshots, usuarios existentes o configuración de correo. Las filas existentes reciben NULL en los campos nuevos. La aplicación procesa la foto y sirve la actual bajo sesión y `private, no-store`; las credenciales administrativas no intervienen en la edición del perfil.

## Evidencia DEV

| Comprobación | Resultado del 13/10/2026 |
| --- | --- |
| APP_ENV, URL/ref y enlace real de CLI | **PASS DEV**, sin imprimir valores |
| Esquema/historial previo | **PASS DEV**, 20 migraciones; dos columnas y bucket nuevos ausentes, perfiles con RLS |
| Dry-run de aplicación | **PASS DEV**, únicamente 021 pendiente |
| CLI de aplicación | **PASS DEV**, informó aplicación de 021 |
| Relectura de historial SQL y CLI | **PASS DEV**, local/remoto 001–021 alineados; 021 aparece una vez |
| Esquema/seguridad resultante | **PASS DEV**, dos CHECK, cuatro políticas, bucket privado 2 MB, columnas permitidas; `active` y roles sin UPDATE para cliente |
| Perfil, avatar, RLS, HTTP y checkout afectado | **PASS**, 28 comprobaciones DEV y 4 visuales locales; continuación dirigida completó los casos que no se habían alcanzado |
| Revisión recuperada | **PASS LOCAL**, respuesta ficticia en navegador conserva sus datos y no ofrece copiar perfil; no valida persistencia de una revisión remota |
| PROD | **NO EJECUTADO**, no consultado ni modificado |

Se crearon cuentas ficticias efímeras mediante Auth Admin API sin correo para QA. Solo esas cuentas y sus fotos se retiraron; fixtures anteriores del ecommerce y cuenta personal conservados. Un FAIL inicial al comprobar el avatar sustituido se cerró con caché de subida 0, lectura no-store/nonce y comprobación del listado persistido. Los errores de preparación del arnés de checkout (carrito vacío y selector del servicio) se corrigieron antes de las verificaciones pendientes.

La suite completa pasó nuevamente **32/32** después de los parches de dependencias; build aislado y callback local 15/15. Esto no volvió a ejecutar ni editar el SQL 021 ni representa una prueba de PROD.

## Para la futura promoción a PROD

**Un merge de código no ejecuta automáticamente estas migraciones en Supabase.** El despliegue y la base se gestionan como pasos separados. Esta nota no autoriza ejecutarlos hoy.

Cuando exista autorización explícita:

1. Incluir en el cambio revisado el SQL 021, este registro, el modelo aprobado, código de perfil/avatar/checkout, dependencias `package.json`/lock y el recurso gráfico con su [registro](../assets/login-agricola.md). Excluir `.env`, cookies, credenciales, archivos generados de Next y cuentas/archivos de QA.
2. Comprobar de forma independiente la referencia, URL y proyecto **PROD**, sus respaldos y el historial real. No reutilizar el enlace DEV ni el script `dev-apply-one-migration.mjs` para PROD. No asumir que 001–020 ya están aplicadas en PROD; reconciliar lo pendiente antes de 021.
3. Revisar que no existan columnas/bucket/políticas con el mismo nombre y una definición diferente, y auditar políticas Storage permisivas. Conservar RLS y snapshots existentes. Si difiere el esquema, preparar un ajuste revisado; no resetear la base.
4. Revisar un dry-run del conjunto exacto aprobado, aplicar en orden con la herramienta de migración autorizada y releer `supabase_migrations.schema_migrations` y las definiciones efectivas. No editar retrospectivamente 021 después de aplicada; una corrección debe ser otra migración.
5. Aplicar el esquema antes de habilitar el código que selecciona las columnas nuevas. Revisar también los [avisos de herramientas de desarrollo pendientes](../dev-dependency-security-20261013.md) y usar un Node LTS admitido. Desplegar únicamente con autorización posterior y probar perfiles, aislamiento A/B, avatar privado, permisos administrativos y checkout en ese ambiente con datos de prueba autorizados.
6. La pausa de correos, las credenciales/configuración de Google y sus retornos son configuraciones separadas: este SQL no las activa ni las transfiere. No copiar fixtures o contraseñas DEV a PROD.

La reversión de código puede conservar las columnas nullable y bucket privado. No se propone un `down` que borre direcciones o fotos de clientes. Cualquier reversión del esquema requiere revisar los datos existentes y una autorización específica.

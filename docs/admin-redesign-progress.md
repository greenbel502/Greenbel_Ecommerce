# Rediseño del panel administrativo · 18/10/2026

Repositorio activo: `Greenbel_Ecommerce`, rama `dev`, base `9594d93`. Se conservan las ediciones previas de cuenta/login. Solo DEV; sin publicación, correos ni cobros reales.

## Inspección y plan verificable

1. **Inspección completada:** catálogo (marcas/categorías/productos/ofertas y editores de ficha), inventario (existencias/movimientos), ventas/posventa y detalle de pedido, envíos externos, cotizaciones/PDF privado, capacitaciones/relaciones/portadas, reseñas, consultas, financiamiento y configuración de entregas/pagos/plazos, usuarios. Guards de página/acción y RPC existentes se conservan. No hay eliminación administrativa de cuentas soportada.
2. **Entorno independiente implementado y recorrido en DEV:** layout `/admin`, menú por permisos, barra superior/cuenta, colapso de escritorio y navegación móvil accesible. Aceptación: ninguna ruta admin muestra header/footer/asistente públicos; acceso directo y recarga conservan autorización.
3. **Listados implementados:** patrón compartido con búsqueda/filtros/orden/tamaño/rango/paginación en servidor, URL persistente y página válida; corregir recortes de 30/100/1000 registros. Aceptación: límites de consulta reales y estados vacío/sin coincidencias/error diferenciados.
4. **Formularios/usuarios implementados y comprobados con datos ficticios:** tabla de cuentas, detalles y cambio de acceso confirmado, sin quitar protecciones propias/último admin; estados pendientes, mensajes seguros y conservar borradores recuperables. Aceptación: operaciones reales sobre cuentas ficticias, privilegios comprobados en servidor.
5. **Verificación cerrada con el alcance indicado abajo:** recorrido completo de rutas, desktop/tablet/390 px, teclado, consultas/páginas y usuarios sintéticos DEV, TypeScript/lint/build, capturas y ausencia de proveedor visible. Se distinguirá evidencia local de DEV.

## Estado inicial encontrado (corregido en esta iteración)

- Layout raíz integra header/main/footer públicos en todas las rutas; admin carece de layout propio e inicio.
- Menús repetidos e incompletos; títulos de escala pública y formularios extensos en listados.
- Usuarios usa tarjetas, UUID expuesto y páginas Auth de tamaño fijo; no permite buscar/filtrar/ordenar por correo en servidor.
- Catálogo, inventario, capacitaciones, reseñas y configuración recortan listados sin paginación completa; algunos pagers no corrigen páginas vacías ni conservan filtros.
- El SDK de Auth usado solo pagina usuarios; `profiles` no guarda correo. Buscar correos correctamente requiere una consulta privada acotada a Auth y perfiles en base, descrita en el documento de revisión.
- Algunos errores atribuyen fallos a migraciones no aplicadas aunque ya existen; referencias técnicas visibles y formularios con redirect pierden entradas ante errores.

## Revisión de consulta de usuarios · aprobada y aplicada en DEV

Propuesta: una función de lectura `admin_list_users` que une las tablas existentes `auth.users`, `profiles`, `user_roles`; devuelve solo id, nombre, correo, teléfono, rol, activo, fecha y total. Búsqueda por nombre/correo/teléfono, filtros rol/estado, orden validado (fecha/nombre/correo/rol), límite 10/25/50 y offset validado. Correo no se duplica en nuevas tablas. Sin cambios en tablas, RLS o permisos de escritura.

La función exige `auth.uid()` con perfil activo y rol admin desde base, independientemente del navegador; acceso anónimo denegado, `search_path` fijo, SQL sin concatenación de entradas, no devuelve tokens/identidades privadas. Una función `security definer` se justifica exclusivamente por la lectura limitada de `auth.users`, que no se expone a REST. Migración 022 solo tras aprobación; aplicación únicamente DEV después de comprobar enlace, esquema e historial. No altera el bootstrap ni `set_user_access`.

El usuario aprobó expresamente la propuesta el 18/10/2026. Se creó y aplicó solo 022 mediante CLI tras preflight de destino/historial y dry-run exclusivo. Lectura independiente posterior: 22 migraciones y función presente. Registro y checksum en `docs/migrations/022-admin-user-directory.md`. Implementación y verificaciones del panel cerradas; siguiente acción: revisión personal del usuario en `/admin`.


## Evidencia del rediseño

- **PASS DEV:** consulta 022 rechaza anónimo/cliente/operador; administrador busca por correo/nombre, filtra y ordena en base; tamaño/orden inválidos rechazados, comodines literales y página fuera de rango comprobados. El guard 017 rechaza quitar el acceso propio. No se modificaron administradores personales para provocar un escenario de cero administradores.
- **PASS DEV:** doce rutas principales cargadas con cuenta sintética; detalle de pedido cargado. Cambio de rol y suspensión desde la tabla persistieron, con revisión antes de enviar. Un POST de esa operación reproducido con sesión de cliente no cambió el rol. Acceso directo de cliente/operador/suspendido y endpoint de selección respetan los permisos. Visitante dirigido al ingreso.
- **PASS LOCAL:** menú colapsable; 820/390 px en Usuarios, apertura de menú móvil, sección activa, Escape y foco restaurado; sin header/footer/asistente públicos ni texto del proveedor en las doce rutas. Ningún error JS en ese recorrido.
- **PASS DEV:** dos páginas de doce marcas ficticias (10 + 2) y búsqueda/orden preservados; ofertas por SKU de producto relacionado; ficha sin precio; alta/edición de especificación, rechazo de producto inválido conservando entradas; imagen subida mediante interfaz/HTTP, capacitación en borrador, zona inactiva y rechazo de duplicado conservando campos.
- **FAIL corregido y reverificado:** el backend devuelve HTTP 416/PGRST103 sin count al superar el rango. La consulta compartida ahora obtiene únicamente el count con HEAD y pide una página válida acotada; se comprobó la URL corregida. No descarga todos los registros.
- **Correcciones de QA separadas:** espera explícita al detalle tras navegación; etiquetas de selectores asociadas con htmlFor/id; búsqueda de feedback en la notificación visible y no en el diálogo cerrado; moneda GTQ añadida al fixture monetario; campos rellenados de nuevo para probar un duplicado después de guardar. Una interrupción del servidor local generó conexión rechazada; se verificó la misma copia activa al reanudar. Se corrigió el logger del arnés para omitir cabeceras de sesión en errores de conexión; la sesión afectada era de una cuenta ficticia, suspendida en Auth y en operaciones. Las credenciales del proyecto y de cuentas personales no se publicaron.
- **PASS LOCAL de código:** tres casos de límites/allowlists/URL y búsqueda de listas; TypeScript y ESLint. Build optimizado aislado PASS también tras el rediseño final, sin modificar `.next` del servidor local ni desplegar. El último ajuste del ciclo de foco recibió TypeScript, ESLint dirigido y prueba real de Tab/Shift+Tab/Escape, sin repetir las suites remotas cerradas.

La regla de último administrador se conserva en la función 017, revisada por definición. La prueba nueva de acceso propio y los cambios de roles se ejecutaron en DEV; no se afirma haber retirado todos los administradores para probar el último. Los restantes flujos monetarios/SMTP/Google conservan su evidencia histórica; no se repitieron ni se convierten en PASS por este ajuste visual.


## Cierre y punto de reanudación

**Estado: implementado y verificado en DEV dentro del alcance del rediseño.** No constituye cierre de las integraciones o decisiones comerciales históricas.

- **PASS LOCAL:** diez módulos comprobados a 1440/820/390 px (30 combinaciones), además de Usuarios a 1440/820/390, editor de producto a 390 y acciones de tabla accesibles tras desplazamiento horizontal. Retorno al sitio restaura encabezado/footer públicos; login conserva su footer compacto. Sin errores JS en los recorridos. Cinco capturas actuales revisadas en `docs/qa/admin-redesign/`.
- **PASS LOCAL:** selección activa, colapso en escritorio, menú móvil con foco atrapado entre elementos realmente visibles y Escape. El primer enlace es el logo; un aserto de captura que suponía que era Cerrar se corrigió y se verificó el ciclo natural completo. Las reglas de tamaño administrativas prevalecen sobre estilos de módulos cargados posteriormente.
- **PASS DEV de formularios:** creación y edición de especificaciones; validación de producto inválido sin escritura y con datos conservados; imagen mediante UI/HTTP; capacitación en borrador; zona inactiva creada, duplicado rechazado con datos conservados. El intento de duplicado se rellena explícitamente: conservar campos después de un error es distinto de exigir que sigan llenos después de un éxito.
- **PASS DEV de usuarios:** consulta exclusiva admin, búsqueda/rol/estado/orden/páginas desde base, detalles en tabla, cambio de rol/suspensión con confirmación, control propio, rechazo de cliente/anónimo/operador, POST reproducido sin privilegios sin cambio de datos. Se mantuvo la función 017 y su bloqueo/auditoría.
- **PASS DEV de cierre:** historial 22/22 y confirmación de correo habilitada. Comprobación final de fixtures: ninguna cuenta sintética de este trabajo queda activa o habilitada en Auth; administradores operativos existentes conservados. Solo se modificaron las identidades sintéticas creadas por los arneses, identificadas por correo de prueba y marcador. Productos, imágenes, marcas, categorías, ofertas, videos y zonas de prueba quedan identificados y en borrador/inactivos para revisión personal.
- **PASS LOCAL de calidad:** TypeScript, ESLint completo, diff sin errores y build optimizado aislado. Pruebas nuevas de listas **3/3**. No hubo cambios de dependencias o infraestructura.

### Límites y decisiones conservadas

- **NO EJECUTADO en esta iteración:** recorrido personal de Google, registro público/confirmación y recuperación real por correo; SMTP sigue aplazado. No se sustituyen con las cuentas confirmadas administrativamente de QA. Tampoco se repitió la suite completa histórica de checkout/pagos/inventario/PDF; las consultas y comandos comerciales existentes se conservaron y las operaciones nuevas comprobadas se detallan arriba.
- No se eliminan usuarios ni se editan perfiles ajenos: no existen comandos administrativos aprobados para esas operaciones. Detalle, rol y acceso sí funcionan. No hay botón simulado para funciones ausentes.
- La condición de último administrador se revisó en SQL y se conserva; la prueba de esta iteración rechazó el retiro del acceso propio, sin intervenir cuentas reales para fabricar un escenario global sin administradores.
- Los selectores de referencias consultan hasta veinte coincidencias en servidor e indican cuándo afinar la búsqueda. Los listados principales usan páginas 10/25/50; no son paginación visual de datos descargados íntegramente. Relaciones técnicas dentro de un solo producto y líneas de un pedido se conservan como detalles de ese registro.
- Los tres correos de negocio continúan pausados. No hay cola de envío retroactivo, cobros reales, cambios PROD, commit, push, merge o despliegue. Recurrente y las decisiones comerciales anteriores conservan sus pendientes.
- Las suites HTTP históricas con selectores/envelopes anteriores al nuevo panel no se declararon ejecutadas. Los arneses de esta iteración y la evidencia histórica tienen alcances separados.

### Cómo revisar

Desde `Greenbel_Ecommerce`: `npm run dev` → `http://localhost:3000/admin` con la cuenta administradora personal ya habilitada. El servidor existente se conservó en el puerto 3000. Revisar menú, Usuarios (sin suspender cuentas reales), catálogo en pestañas y un producto `PRUEBA DEV panel …`, filtros y páginas. Usar borradores/inactivos para experimentar; no activar tarifas/precios ficticios para una operación real. Antes de cualquier promoción futura se necesita autorización y reconciliar/aplicar las migraciones en destino; un merge no migra la base.

Próximo paso: revisión del usuario y correcciones concretas que reporte; no hay una migración pendiente del rediseño en DEV.

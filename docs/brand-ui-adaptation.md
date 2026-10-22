# Adaptación visual corporativa GreenBel

Fecha: 21/10/2026. Entorno: local, con consultas a DEV. Alcance: **solo presentación**.

## Fuente y diagnóstico inicial

Se extrajeron el texto y se renderizaron/revisaron las **36 páginas** de `manual_de_marca_greenbel (1) (3).pdf`, antes de modificar código. Las composiciones de impresión orientan la interfaz, no definen rutas, operaciones ni contenido comercial.

- Páginas 1–4: identidad, actividad agrícola, misión y visión.
- 5–9: construcción, logotipo horizontal y variación vertical.
- 10–15: variantes cromáticas y monocromáticas.
- 16–19: legibilidad y área de protección equivalente al isotipo; las medidas impresas no se trasladan literalmente a CSS.
- 20–21: prohibiciones de distorsionar, reconstruir, cambiar proporciones, orientación y capitalización.
- 22–24: paleta exacta `#1E3A1F`, `#3A4813`, `#80BA01`, `#E7E7CF`.
- 25–26: Mont Heavy DEMO.
- 27–36: aplicaciones corporativas, fotografía agrícola, superficies beige y composición sobria.

La implementación previa usaba otros verdes (`#0c2f1c`, `#88d600`), muchos tonos locales, Archivo Black en títulos y tamaños heterogéneos. El SVG del logo claro y el favicon eran reconstrucciones; el menú administrativo colapsado recortaba el logo horizontal. Se preservaron los activos antiguos sin usarlos en esas posiciones.

## Bloques y aceptación

| Bloque | Criterio comprobable | Estado |
| --- | --- | --- |
| Manual y diagnóstico | 36 páginas examinadas; inventario de rutas, estilos y recursos | PASS |
| Sistema visual | Colores centralizados, tipografía local, superficies y controles comunes | PASS en paleta y componentes; Mont exacta pendiente, sustitución temporal documentada |
| Identidad gráfica | Trazados originales, proporción y espacio libre; sin logo recortado | PASS; revisión visual abajo |
| Ecommerce y cuenta | Vistas y estados existentes conservan acciones y contenido | PASS en las vistas comprobadas; límites abajo |
| Administración | Todos los módulos conservan navegación, listados y formularios | PASS en las vistas comprobadas; límites abajo |
| Responsive y regresión | Medidas reales, teclado, contraste, tipos, lint y build; alcance acotado | PASS en las vistas comprobadas; límites abajo |

## Implementación

- `src/app/brand-tokens.css`: cuatro colores oficiales, neutrales, mezclas para superficies/bordes/transparencias, escala tipográfica y espacios. Alias de variables existentes conservan las APIs de los componentes.
- `src/app/globals.css`: navegación y espacio de protección del logo, jerarquía de títulos, catálogo/filtros/lista, tarjetas, ficha, carrito, checkout, formularios, secciones institucionales, drawers, notificaciones, footer y estados vacíos. Se conserva el footer compacto de acceso.
- `src/app/admin/admin.css` y módulos CSS administrativos: sidebar, variante vertical oficial al colapsar, topbar, tablas, filtros, paginadores, formularios, estados y diálogos.
- CSS Modules de cuenta, pedidos, capacitaciones, menú de cuenta y avatar: presentación coherente con la tienda.
- `BrandLogo`: solo se cambian recursos y dimensiones de presentación. SVG oficiales extraídos de páginas 9 y 11, sin redibujar los trazados ni reescribir el nombre con una fuente.
- Favicon: variación vertical oficial, con fondo corporativo para contraste.
- `src/app/layout.tsx`: únicamente carga de fuente de títulos; proveedores, metadatos, jerarquía y comportamiento se conservan.
- `src/app/admin/usuarios/page.tsx`: únicamente el color de una ayuda pasa a un token.

Los colores del símbolo de Google permanecen intactos. El rojo semántico de errores se mantiene como señal funcional existente, separado de los cuatro colores corporativos; los mensajes y sus validaciones no cambian. Las fotos de productos y marcas de terceros se conservan sin recolorearlas.

## Tipografía y licencia

### Corrección posterior: glifo con marca DEMO

La revisión inicial verificó el permiso de incrustación del paquete gratuito, pero no detectó que algunos glifos incluyen la palabra **DEMO** en su dibujo. La captura del usuario lo mostró en la «é» de «Cuéntanos». La fuente no resulta adecuada para los títulos de esta interfaz en español. Esa omisión de revisión visual queda registrada; los controles geométricos anteriores no comprobaban la calidad de cada glifo.

**Estado actual:** se retiró `mont-heavy-demo.otf` del proyecto y de la carga global. Se utiliza temporalmente **Manrope ExtraBold 800**, ya disponible localmente, para títulos. Es una alternativa de presentación, **no la fuente corporativa oficial**. Poppins conserva los textos de lectura, tablas y formularios. No se alteró ni eliminó una marca dentro del archivo de Mont.

- Fuente actual: `src/app/fonts/manrope-latin-800.woff2`.
- Licencia Manrope: SIL Open Font License 1.1, copia íntegra en `docs/licenses/manrope-ofl.txt`, procedente de la dependencia existente `@fontsource/manrope`.
- **Pendiente para coincidencia tipográfica exacta:** archivo completo de Mont Heavy sin glifos DEMO, autorizado para uso web.

Se conserva la licencia del paquete Mont revisado como evidencia histórica en `docs/licenses/fontfabric-mont-free-eula-v2.pdf`. Aquella licencia permitía incrustación web, pero prohibía modificar el archivo de fuente. La existencia de permiso de uso no garantiza que todos los glifos sean apropiados para la interfaz.

- Distribución del paquete revisado: https://www.dafont.com/mont.font
- Fundición: https://www.fontfabric.com/fonts/mont/
- SHA256 del archivo Mont retirado: `e64bfcaf7d5071a48d3114cccc6ec7338038aaf59d52b76cd513fcd03702b153`.

### Corrección posterior: marcas de Nosotros

**Histórico del 21/10:** las tarjetas de nombres descritas a continuación fueron sustituidas el 22/10 por el mismo carrusel de Inicio, a petición del usuario. Ver [renovación de Nosotros](about-ui-refresh.md).

El bloque de Nosotros compartía la clase exterior del carrusel de inicio, pero sus nombres eran `span` consecutivos sin contenedor con separación. Se conserva la lista de siete nombres y se presenta como lista semántica de tarjetas: siete columnas en escritorio amplio, cuatro en tablet y dos en móvil. Se mantienen los colores corporativos. No se incorporan logotipos inexistentes ni se cambia el carrusel de inicio, sus avisos DEV o su comportamiento.

## Protección del alcance

Existe una instantánea local anterior a la tarea para comparar archivos, incluso los cambios previos sin commit. Se verificó contra ella; `git diff` incluye trabajo anterior y por sí solo no delimita esta adaptación. No se crean usuarios, pedidos, cotizaciones, migraciones ni datos remotos para estas pruebas. No se activan correos ni pagos. El carrito local puede contener temporalmente un producto ficticio para comprobar distribución; debe restaurarse al terminar.

## Evidencia y limitaciones

El zoom del navegador estaba al 80%; los tamaños de viewport se ajustaron y se **verificaron mediante `innerWidth`**, sin asumir que el valor de la herramienta coincide con píxeles CSS. Las capturas recortan únicamente el margen añadido por la herramienta de emulación, sin modificar los elementos de la aplicación.

Las pruebas de viewport se realizaron en Chrome de escritorio, no en dispositivos físicos. El servidor habitual del proyecto quedó activo en `http://localhost:3000`; los servidores aislados de QA fueron detenidos.

### PASS: local y consultas DEV

- **36 páginas del manual** examinadas antes de implementar.
- **143 lecturas de layout** registradas: 30 páginas principales a 390/820/1440 px; 10 pantallas clave a 320/640/767/1024 px; detalle de venta y pestañas de marcas/categorías/ofertas. Una lectura detectó un fallo de título largo, corregido y reverificado; no quedan fallos de layout sin corregir en ese registro.
- El detalle de venta se revisó a 320/820/1440 px. El editor completo de producto, incluidas especificaciones, incluidos, imágenes y compatibilidades, se abrió por enlace directo y se midieron todos sus controles, incluso fuera de la primera pantalla, a 320 px. No se guardaron modificaciones.
- La apertura del editor desde «Editar ficha» se confirmó con su solicitud de navegación, respuesta HTTP 200 y URL con el producto seleccionado. Una comprobación inmediata anterior terminó antes de la respuesta; no se trató esa espera como éxito ni se cambió el handler.
- Usuarios: búsqueda DEV; página siguiente conservando búsqueda (11–20 de 98); filtros de cliente/suspendido, orden por correo ascendente y 25 por página (1–25 de 67). Solo consultas GET.
- Detalles de usuario en diálogo de 358 px dentro de viewport de 390 px; menú móvil abre/cierra con Escape y devuelve foco a «Abrir menú». La tabla conserva desplazamiento horizontal para sus acciones.
- Sidebar colapsada de 112 px, área de trabajo ajustada sin invadir el viewport y logo vertical de 52 × 27.68 px, con proporción original. Sin recortar el nombre.
- Login: mostrar/ocultar contraseña, validación de correo inválido sin enviar credenciales y foco visible. Footer compacto aproximado de 70 px en escritorio y 111 px en móvil; footer completo conservado en el resto de páginas.
- Catálogo: drawer móvil abre/cierra; botón de cierre con nombre accesible. Cuenta conserva su presentación, sin cambios en perfil ni contraseña.
- Contacto: tres errores de validación con formulario vacío a 320 px, sin persistencia ni envío. No se modifican reglas ni mensajes.
- Carrito local: agregar/quitar el producto ficticio TERMS y cargar checkout a 390 px; presentación de facturación/entrega a 720 px. Se retiró el producto temporal: el carrito de 3000 volvió a vacío. El de 3001 conservó su selección anterior no publicada; no se vació.
- Movimiento reducido comprobado por emulación de la preferencia y lectura de estilos (transiciones/animaciones reducidas a 0.01 ms); emulación retirada al terminar.
- Pares principales de texto/fondo: 5.32–9.96:1. Borde de controles reforzado a 60 % de verde oscuro sobre blanco: 3.72:1, frente a 2.86:1 en la primera propuesta. Esto es una comprobación de pares de color, **no una certificación WCAG completa**.
- Sin sesión: `/admin` no expone la tabla y contiene el retorno a ingresar (redirección en la respuesta HTML transmitida); búsqueda administrativa válida responde 401. No se alteran permisos ni roles.
- Comparación con el inicio: **181 archivos protegidos sin cambios**, así como los clientes críticos de carrito, checkout, Auth, navbar, seguridad de cuenta, shell administrativo y acciones de usuarios. Los cambios TSX de esta tarea se limitan a fuente, recursos/dimensiones de logo, token de color y un nombre accesible.
- ESLint completo, tipos y compilaciones optimizadas aisladas con `APP_ENV=DEV`; `git diff --check`. Sin dependencias nuevas ni cambios en package/lock.

### Correcciones visuales verificadas

1. Paleta dispersa → tokens corporativos y superficies compartidas.
2. Logo reconstruido y recorte al colapsar → trazados oficiales y variante vertical con proporción correcta.
3. Ancho de contenido calculado para la sidebar antigua → ancho correspondiente a 112 px.
4. Marcadores obligatorios duplicados en catálogo → un único marcador existente, sin tocar `required` ni validaciones.
5. Referencia larga de venta fuera del viewport de 320 px → `overflow-wrap: anywhere`, reverificado.
6. Borde de formulario con contraste menor a 3:1 → borde de 3.72:1 respecto a blanco.

### NO EJECUTADO / límites concretos

- **Zoom nativo de Chrome al 200 %**: el acceso a la aplicación nativa devolvió `timeoutReached` (-10005). No se declara probado por ajustar un viewport. Se comprobó además el reflow de checkout a 720 px, que tampoco sustituye esa prueba nativa.
- Detalle público de capacitación con video publicado: no había contenido publicado disponible en DEV. Se revisaron su código y estilos; no se publica una capacitación para completar una prueba visual.
- Detalle de pedido del cliente: la cuenta de consulta no proporcionaba un pedido propio para ese recorrido. El detalle administrativo sí se comprobó. CSS de pedidos del cliente adaptado y revisado en código.
- No se repiten creación de pedidos, persistencia de formularios válidos/PDF, pagos, reembolsos, cambios de rol ni pruebas concurrentes de inventario: no son cambios de esta adaptación y producirían escrituras de negocio. Su código permanece intacto; las comprobaciones históricas no se presentan como recién ejecutadas.
- Confirmación/recuperación real por correo sigue pendiente de SMTP según decisión anterior. Los tres correos de negocio permanecen deshabilitados.

Se observaron advertencias React #418 en la sesión que alternó el servidor de desarrollo y las compilaciones en el mismo origen. No se reprodujeron en las consultas de la compilación final desde un origen local separado ni en las pantallas consultadas de la instantánea previa. No se atribuyen a una causa confirmada ni se modifica lógica para ocultarlas. No se afirma una comprobación completa de consola de todos los flujos.

### Comprobación manual pendiente mínima

En Chrome, abrir login, catálogo y `/admin/usuarios`; elegir Zoom **200 %** desde el menú del navegador. Comprobar navegación, campos, acciones y desplazamiento interno de tabla. Volver al zoom habitual después. Para los dos detalles sin datos, usar contenido y un pedido propios ya autorizados; no publicar ni crear registros automáticamente.

## Evidencias y ejecución

- `docs/qa/brand-ui/responsive-results.json`: medidas reales y fallo histórico ya corregido.
- `docs/qa/brand-ui/scope-check.json`: archivos protegidos/clientes críticos intactos y cambios de presentación delimitados.
- `docs/qa/brand-ui/token-contrast.json`: contraste de pares de texto.
- Capturas: `inicio-1440.png`, `login-1440.png`, `login-390.png`, `admin-usuarios-1440.png`, `admin-usuarios-390.png`, `admin-colapsado-1440.png`, `admin-menu-390.png`, `admin-dialogo-390.png`, `catalogo-editor-320.png`, `catalogo-filtros-390.png`, `checkout-390.png`, `contacto-errores-320.png`.

Repositorio efectivo: `/Users/diederichsolis/Desktop/Greenbel_Ecommerce`, distinto de la carpeta histórica GreenBel. Ejecutar allí `npm run dev` y abrir `http://localhost:3000`; panel `/admin`, con la sesión y permisos existentes. No se publican credenciales.

No se hizo commit, push, merge, despliegue, migración, modificación de PROD, envío de correo ni cobro. La compilación optimizada local no cambia el ambiente del backend: se ejecutó con `APP_ENV=DEV`.

## Verificación del seguimiento: DEMO y marcas · 21/10/2026

- **FAIL detectado por el usuario y corregido:** marca DEMO dibujada sobre la «é» del título. Manrope 800 sustituye globalmente a la fuente DEMO; capturas de «Cuéntanos sobre tu trabajo» a 390 y 1440 px confirman la tilde limpia.
- **FAIL detectado por el usuario y corregido:** siete nombres consecutivos en Nosotros. Las siete tarjetas se comprobaron a 320, 390, 820 y 1440 px; ninguna tiene contenido horizontal fuera de su tarjeta ni la página desborda el viewport. Columnas reales: 2, 2, 4 y 7, respectivamente.
- **PASS:** títulos de login, catálogo y contacto a 320/1440 px, con contenido cargado y sin desbordamientos. Seis lecturas anteriores a la llegada del contenido transmitido quedan registradas como NO EJECUTADO; las seis verificaciones posteriores esperaron al título visible y pasaron. No se oculta ese estado inicial como si fuese una prueba completa.
- **PASS:** ESLint de los dos TSX modificados, TypeScript sin emisión, compilación optimizada aislada en DEV y `git diff --check`. No se alteró la carpeta de compilación del servidor de desarrollo del usuario.
- **PASS de alcance:** de 319 archivos de código/configuración y pruebas comparados con el inicio de esta corrección, 315 permanecen idénticos. Los cuatro cambios son la carga de fuente en layout, CSS global, presentación de la lista en Nosotros y retirada del archivo Mont DEMO. Sin modificaciones en backend, operaciones, permisos, migraciones o datos.
- **Pendiente:** Mont Heavy completa autorizada para web; no se declara alineación tipográfica exacta con el manual mientras se utilice la sustitución temporal. Los pendientes de zoom nativo y recorridos sin datos de la revisión anterior conservan su estado.

Evidencias adicionales: `docs/qa/brand-ui/font-brands-responsive.json`, `font-brands-scope-check.json`; capturas `titulo-sin-demo-1440.jpg`, `titulo-sin-demo-390.jpg`, `marcas-corregidas-1440.jpg` y `marcas-corregidas-390.jpg`. Las capturas muestran los bloques completos y su contexto inmediato; no retocan letras ni nombres.

## Reanudación

La implementación visual está aplicada. Antes de declarar cobertura visual absoluta, completar el zoom nativo y los dos detalles sin datos disponibles. Mantener la pausa de correos y no ampliar a operaciones de negocio para cubrir esas pruebas. Para cerrar la tipografía exacta falta el archivo completo y autorizado de Mont Heavy, sin glifos DEMO. Mientras tanto Manrope 800 evita la marca visible; no se declara equivalencia con la fuente oficial.


## Actualización de Nosotros · 22/10/2026

Fotografía ilustrativa nueva, valores con iconos y microinteracciones, misión/visión compactas y carrusel idéntico al de Inicio. Estilos de esta página aislados en CSS Module, con correcciones de visibilidad en movimiento reducido y entrega de imágenes editoriales. [Cambios, verificaciones y límites](about-ui-refresh.md). No se alteran lógica, datos ni backend.

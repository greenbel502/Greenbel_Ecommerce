# Ubicaciones dinámicas de GreenBel y Cooperativa

Fecha: 29/10/2026. Implementación local en Greenbel_Ecommerce; no publicación ni escrituras PROD.

## Resultado

Administración → Contacto → Ubicaciones contiene dos grupos: GreenBel y Cooperativa Concepción R.L. Tabla con búsqueda, visibilidad, edición en panel derecho y eliminación con confirmación. Departamento con búsqueda integrada, dirección y horario opcionales, enlace seguro de Maps, coordenadas opcionales y orden. El botón de guardar está al final. Confirmaciones y avisos reutilizan NotificationProvider/Sileo.

La página /contacto muestra únicamente ubicaciones activas de GreenBel. /financiamiento muestra únicamente las de Cooperativa. La revisión pública vigente muestra solo el mapa: el nombre aparece al pasar el cursor, enfocar con teclado o tocar un marcador. Se retiraron el filtro, el listado, la tarjeta de detalle y el enlace de Maps de ambas vistas públicas. Los marcadores sin coordenadas son aproximados; nunca representan una dirección exacta. Son mapas locales SVG con 22 departamentos, sin API de mapas ni clave adicional.

## Departamentos iniciales autorizados

El usuario confirmó que no dispone de direcciones exactas y pidió seguir la imagen proporcionada. Referencias departamentales:

- GreenBel: Guatemala, Quetzaltenango, Escuintla, Jutiapa.
- Cooperativa: Huehuetenango, Quiché, Totonicapán, Quetzaltenango, Sololá, Chimaltenango, Guatemala.

No se copiaron afirmaciones de desembolso, tasas, cobertura de entregas ni el número de agencias del material gráfico. No se inventaron direcciones, coordenadas ni horarios. Los contadores iniciales son departamentos, no sedes/agencias confirmadas.

## Persistencia y autorización

Se reutiliza el JSON privado `site_content`, key=contact, publication_status=draft. Añade `locations` al payload versión 1, conservando `entries` de teléfonos/correos. No requiere tablas, migraciones, permisos ni variables nuevas. El esquema existente permite objetos JSON.

Los datos anteriores sin `locations` reciben las referencias iniciales al leerse; las lecturas no escriben en la base. El primer guardado administrativo conserva esa lista junto a los contactos. Una lista guardada explícitamente como [] permanece vacía: eliminar u ocultar todos los puntos no los vuelve a crear. Los valores iniciales están en src/lib/contacts/locations.ts y se clonan por lectura.

Cada escritura exige requireStaffActor(["admin"]) con perfil activo y una revisión updated_at vigente; update condicional evita sobrescribir otra sesión. La edición de teléfonos/correos conserva ubicaciones y viceversa. La proyección pública filtra organización y active, sin exponer los contactos privados de la cooperativa. Se invalidan /admin/contacto, /contacto, /financiamiento y los consumidores existentes de contacto.

## Archivos

- src/lib/contacts/locations.ts: departamentos, validación, referencias iniciales, proyección y enlaces Maps.
- src/lib/contacts/model.ts y src/lib/server/contact-settings.ts: compatibilidad del JSON y lectura pública.
- src/app/admin/contacto/actions.ts: guardar/eliminar ubicaciones, permisos y concurrencia.
- src/app/admin/contacto/contacts-admin.tsx + CSS: pestañas de administración.
- src/app/admin/contacto/locations-admin.tsx + CSS: tabla y panel derecho.
- src/presentation/components/locations-map.tsx + CSS: mapa compartido.
- src/app/contacto/page.tsx y src/app/financiamiento/page.tsx: mapas públicos por organización.
- public/maps/: geometría departamental y procedencia/licencia ODbL de geoBoundaries/OpenStreetMap. El GeoJSON fuente se distribuye con la geometría derivada; no incluye datos de sedes.
- tests/locations.test.mjs: 15 casos de validación, compatibilidad y mutaciones.

## Verificación ejecutada

PASS: 15 pruebas de ubicaciones y 37 regresiones de Gmail, mensaje de financiamiento y compra WhatsApp (52 en total). Las mutaciones se comprueban con dependencias de servidor simuladas; no se enviaron correos ni solicitudes ni se escribieron fixtures en Supabase.

PASS: ESLint de archivos modificados, TypeScript --noEmit y git diff --check. APP_ENV=DEV npm run build terminó correctamente (compilación de producción local contra configuración DEV; no despliegue).

PASS: navegador con componentes reales en una pantalla temporal local, luego retirada: tabla por organización, apertura del editor derecho, búsqueda de departamento con teclado, descarte de cambios, modal Eliminar/Cancelar, selección de marcador y filtro. Layout revisado a 1800×1042, 820×1180 y 390×844, sin desbordamiento horizontal. Capturas con sufijo fixtures corresponden a datos ficticios exclusivos de esa revisión, no guardados en la base.

PASS: páginas locales /contacto y /financiamiento con lectura de la configuración DEV existente, 4 y 7 departamentos respectivamente. Selección de Quetzaltenango y Chimaltenango cambia el detalle correcto. Nueva pestaña sin errores de hidratación tras corregir los title SVG a un único texto. Financiamiento emite un aviso ya existente de Next.js sobre scroll-behavior; no es un fallo del mapa.

Pendiente/no ejecutado: guardar/recargar/eliminar mediante una sesión administrativa real y comprobar persistencia en Supabase. Los contratos y controles de dichas acciones están cubiertos por pruebas con mocks. No se cambiaron filas reales, esquema ni políticas. Tampoco se ha hecho commit, push o despliegue de este bloque.

## Uso después de publicar

Abrir Administración → Contacto → Ubicaciones, elegir GreenBel o Cooperativa, editar el nombre/departamento, marcar u ocultar la ubicación y guardar. Dirección, horario, Maps y coordenadas son opcionales. Guardar un nuevo punto visible lo incorpora al mapa de la página correspondiente al volver a consultarla; ocultarlo lo retira. La página pública ya abierta necesita recarga/navegación para obtener cambios posteriores.

## Revisión solicitada: mapas sin listas

Se simplificó LocationsMap para Contacto y Financiamiento. Solo quedan el mapa centrado, los marcadores administrados, conteo, leyenda y atribución. El nombre usa un tooltip de 12 px con ajuste para extremos del mapa. Hover/foco/toque lo muestran y Escape lo cierra; no hay selección inicial ni información lateral. La administración y persistencia no cambian.

Verificado en navegador local: Contacto sin filtro ni tarjetas; tooltip Quetzaltenango por mouse real mediante CDP y teclado; Escape deja cero tooltips; Financiamiento sin filtro/detalles y toque real touchStart/touchEnd muestra Sololá. Revisión estrecha: el navegador reportó 520 px de layout, sin desbordamiento horizontal (no se presenta como una nueva prueba de 390 px). Restauradas las métricas del navegador. ESLint y TypeScript --noEmit aprobaron. No se añadieron pruebas que reproduzcan este cambio visual ni se repitieron pruebas de negocio. No publicado.

## Separación del encabezado de Contacto

Por solicitud posterior se retiró la superposición decorativa: .contact-layout-new pasa de margen superior -35px a 32px, y el breakpoint hasta 640px pasa de -24px a 24px. align-items: start mantiene la altura natural de formulario y columna lateral. Cambio exclusivamente CSS en globals.css.

Verificación del navegador: ancho CSS de 2400px: separación de 32px, tarjetas y formulario debajo del borde inferior del hero; ancho de 800px: separación de 32px; ancho de 520px: separación de 24px, sin desbordamiento horizontal. No son pruebas de un viewport de 390px: el navegador reporta 520px con el ajuste solicitado de 390px. Sin cambios de lógica, persistencia o publicación.

## Separación exterior del mapa de Financiamiento

La nueva clase financing-locations limita el padding de su contenedor a 8px arriba y 16px abajo, y el inicio de financing-options a 16px. Evita acumular el padding general de las dos secciones; conserva el contenido y funcionamiento existentes.

Verificado en navegador local a 2400px y 520px de ancho CSS: 32px entre el bloque anterior y la tarjeta, y 32px entre la tarjeta y el siguiente encabezado, sin desbordamiento horizontal. ESLint de financiamiento/page.tsx y git diff --check aprobaron. Captura: financiamiento-espaciado-ajustado.png. No se repitieron pruebas de negocio por este ajuste de CSS ni se publicó.

# Paginación pública y carrusel de Inicio

29/10/2026. Cambios locales en Greenbel_Ecommerce, rama main sobre d159af8 con trabajo previo sin publicar preservado. No commit, push, despliegue ni escrituras en Supabase.

## Resultado

- Catálogo: 12 productos renderizados por página después de aplicar los filtros y el orden existentes. Se conserva el conjunto público completo recibido por el componente; no es paginación de consultas SQL.
- Controles de anterior/siguiente, páginas numeradas en escritorio, indicador de página en móvil y rango de productos visible. La búsqueda, categoría, marca, funcionamiento, disponibilidad, orden y limpieza reinician la página. Navegar desplaza y enfoca el encabezado de resultados; las acciones de cada tarjeta se reutilizan.
- Inicio: máximo cinco productos en el orden de selección ya existente. Prioriza destacados configurados; conserva el respaldo de equipos públicos cuando no los hay. No modifica flags de la base.
- Carrusel: tres tarjetas visibles en escritorio, dos en tablet y una al 88% del ancho con parte de la siguiente en móvil. Flechas, scroll horizontal/táctil, scroll-snap, contador, teclado ArrowLeft/ArrowRight/Home/End y sin autoplay. Respeta movimiento reducido en código. Reutiliza ProductCard; los ajustes de altura son exclusivos del carrusel.

## Archivos

- src/lib/products/catalog-pagination.ts
- src/presentation/components/product-catalog.tsx y product-catalog.module.css
- src/lib/products/home-selection.ts
- src/app/page.tsx
- src/presentation/components/home-products-carousel.tsx y home-products-carousel.module.css
- tests/catalog-pagination.test.mjs y tests/home-selection.test.mjs

## Verificación

- PASS: siete pruebas automatizadas: recorrido de 115 resultados sin duplicados/omisiones, rangos finales/vacíos, respeto de filtro/orden y límites/prioridad de selección de Inicio.
- PASS: ESLint de los archivos TypeScript intervenidos, TypeScript --noEmit, formato y git diff --check.
- PASS navegador DEV: catálogo a 1800px y 390px, 12 tarjetas por página; página2 muestra13–24, página10 muestra109–115 (7 tarjetas) y deshabilita siguiente. Búsqueda ASPERSOR reinicia a1–6 y oculta paginador; categoría ASPERSIÓN reinicia a1–7; limpiar devuelve115. En móvil, avanzar enfoca el encabezado y devuelve al comienzo del resultado. A320px no hay desbordamiento horizontal y el paginador mide288px.
- PASS navegador: Inicio tiene cinco tarjetas, tres visibles a1440px, dos a800px y una de315px en pista de358px a390px. Flecha derecha cambia1–3 a2–4; End llega3–5 y deshabilita siguiente; Home vuelve al principio. Un gesto touchStart/touchMove/touchEnd emulado desplaza la pista horizontal de0 a241px; no produce desbordamiento del documento.
- Capturas locales: paginacion-movil.png, carrusel-escritorio.png y carrusel-movil.png.

No se enviaron compras, solicitudes ni correos. No se ejecutó un nuevo build completo ni pruebas de publicación/PROD. La reducción de movimiento se implementó y revisó en código, sin prueba de preferencia de sistema en navegador.

## Revisión para publicación en main

El usuario autorizó el commit/push a main después de aprobar el resultado. La revisión final incluyó el conjunto de mapas administrables y mejoras responsive de esta sesión. Se corrigió la ayuda antigua de Maps y la primera eliminación de una referencia cuando todavía no existe la fila de configuración; conserva autorización y comparación de revisiones.

PASS: 36 pruebas de ubicaciones, selección de Inicio, paginación, selección de carrito y compra WhatsApp; ESLint y TypeScript. PASS: `APP_ENV=DEV npm run build`, ejecutado sobre una copia aislada del índice candidato para no interrumpir el servidor local, sin errores de compilación o tipos. PASS: `git diff --cached --check` y búsqueda de patrones de credenciales en los archivos preparados. No se incluyen archivos privados de entorno ni capturas con datos de sesión. Las capturas se conservan localmente. Esta validación no acredita por sí sola el despliegue remoto.

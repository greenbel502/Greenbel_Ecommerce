# Catálogo móvil, Financiamiento e Inicio

Trabajo local sobre el e-commerce existente, 29/10/2026. No publicado.

## Cambios

- Catálogo: cuadrícula de dos columnas hasta 640px, imágenes cuadradas sin recorte, tarjetas compactas con marca/código, nombre, disponibilidad, precio y acciones existentes. Descripciones y especificaciones completas permanecen en la ficha; no cambian importes, disponibilidad ni reglas para agregar al carrito. Se conserva el diseño de escritorio.
- Búsqueda y ordenamiento compactos; accesos horizontales a las categorías existentes mediante el mismo estado del filtro. El panel de filtros reutiliza CatalogDrawer con diálogo nativo, cierre Escape, foco contenido y retorno al botón. Se conserva categoría, marca, funcionamiento y disponibilidad. Se corrige el texto antiguo de correos pausados en la ayuda del catálogo.
- Financiamiento: módulo CSS limitado a móvil (hasta 640px), con párrafos secundarios ocultos, títulos y bloques más compactos. Los textos permanecen en JSX y son visibles en tablet/escritorio. El formulario conserva campos, consentimiento, validaciones, selección/PDF, estados, avisos de disponibilidad y evaluación de la cooperativa. No se cambian sus handlers ni llamadas.
- Bell conserva el botón flotante; su invitación textual se oculta solo en móvil dentro de catálogo/financiamiento para no cubrir tanto contenido.
- Inicio: DEV tiene 115 productos públicos, 24 equipos y ningún destacado según lectura anónima. La selección prioriza los destacados configurados; si no hay, muestra hasta seis equipos reales con el título «Equipos para tu trabajo». Si faltan equipos, usa productos públicos bajo un título de catálogo. Si no hay productos públicos, omite el bloque. No escribe marcas de destacado en la base.

## Archivos de este bloque

- src/presentation/components/product-catalog.tsx y product-catalog.module.css
- src/app/productos/page.tsx
- src/app/financiamiento/page.tsx y financing-page.module.css
- src/app/page.tsx
- src/lib/products/home-selection.ts
- tests/home-selection.test.mjs

Los cambios anteriores de mapas/administración siguen presentes y no se descartan.

## Verificación ejecutada

- PASS: ESLint de los cinco archivos TypeScript modificados; TypeScript `--noEmit`; Prettier de JSX/CSS nuevos; `git diff --check`.
- PASS: `node --test tests/home-selection.test.mjs tests/cart-selection.test.mjs tests/whatsapp-purchase.test.mjs`: 15 pruebas, incluidas tres de selección de Inicio; las comprobaciones de endpoints de WhatsApp usan dependencias simuladas.
- PASS navegador local/DEV: catálogo sin desbordamiento horizontal a anchos CSS reales de 320, 391, 800 y 1440px. Dos columnas móviles, dos en tablet y tres con filtros laterales en escritorio.
- PASS navegador: búsqueda ASPERSOR (6 resultados), categoría ASPERSIÓN + marca KAWASHIMA PRO (2), orden ascendente (Q5,350.00 y Q5,707.00); búsqueda sin coincidencias y recuperación a 115 resultados. Filtros abren diálogo, Escape cierra y devuelve foco.
- PASS navegador: agregar un ASPERSOR KAWASHIMA MOTOR MITSUBISHI desde la tarjeta incrementó el carrito a una unidad; en /carrito se comprobó nombre y Q5,350.00. Después se retiró solo esa unidad de prueba, restaurando el carrito vacío. No se pulsó compra ni se generaron solicitudes/documentos/correos.
- PASS navegador: Financiamiento sin desbordamiento a 320, 391, 800 y 1440px. Párrafos secundarios ocultos en móvil y visibles en 800/1440px; campos y consentimiento siguen visibles a 320px. Se conservaron 189 caracteres del párrafo de la alianza en el DOM.
- PASS navegador: Inicio renderiza seis equipos públicos, título adecuado, imágenes y precios reales. Evidencia inicio-equipos.png.

Capturas: catalogo-391.png y financiamiento-391.png. La extensión mantiene un zoom previo: se reportan los anchos CSS medidos con innerWidth, no los tamaños nominales solicitados al viewport. Las métricas temporales se restauran al terminar.

No ejecutado: envío real de financiamiento/WhatsApp, autenticación nueva, publicación ni comprobación de PROD. No se repitió el build completo en este bloque; las rutas se compilaron y revisaron con el servidor Next DEV y el chequeo de tipos aprobó. No se escribieron filas en Supabase ni se añadieron migraciones o variables.

# Renovación visual de Nosotros · 22/10/2026

Alcance: UI y responsividad de `/nosotros`, en el proyecto Greenbel_Ecommerce. Se conserva el trabajo previo sin commit. No se cambian reglas, permisos, Auth, carrito, modelos, API de negocio ni base de datos.

## Cambios implementados

1. **Imagen principal:** escena agrícola ilustrativa nueva, sin textos ni marcas dentro de la imagen. WebP de 1122 × 1402 px y 350 KB, generado con la herramienta integrada `image_gen`. [Archivo, procedencia y prompt exacto](qa/about-ui/image-source.md). El alt informa que es ilustrativa; no representa un equipo comercial, instalación o personal real de GreenBel.
2. **Valores:** se conserva el contenido de las seis tarjetas. Nuevos iconos de experiencia y cercanía, iconos de 30 px en superficies de 60/52 px, tarjetas claras, jerarquía legible, entrada escalonada con `Reveal` existente y respuesta sutil al hover. No se convierten las tarjetas en botones.
3. **Misión y visión:** números y títulos en una misma fila, a 12–16 px de separación, sin `margin-top: auto`. Dos tarjetas agrupadas junto a la fotografía original. Solo se cambia el encuadre CSS de la foto para no mostrar fragmentos del texto del cartel original; el JPEG se conserva intacto.
4. **Marcas:** se importa y reutiliza `BrandsCarousel`, exactamente el componente de Inicio. La anterior lista de siete nombres se sustituye por sus cuatro logotipos, textos DEV, repetición y movimiento existentes, conforme a lo pedido. No se crean logotipos ni se afirma aprobación comercial.
5. **Estilos:** nuevo `src/app/nosotros/about.module.css`; se retiran exclusivamente los selectores globales de la antigua página. La comparación programática confirma que los estilos compartidos conservan sus reglas. Paleta y fuentes vigentes se mantienen.

## Ciclo de correcciones

- **FAIL corregido:** bajo movimiento reducido algunos estilos iniciales de Motion podían conservar opacidad cero. CSS local garantiza texto, tarjetas y marcas visibles sin transformación ni filtro. No se modifican los hooks ni las primitivas compartidas.
- **FAIL corregido:** algunas variantes del optimizador de imagen no completaron la carga al cambiar de ancho. El WebP ya optimizado y el JPEG editorial existente (290 KB) se sirven directamente con la opción `unoptimized` de Next Image. Se mantienen el componente, los tamaños, `alt`, prioridad y carga diferida donde existían. El archivo estático y el optimizado respondieron HTTP 200 en una lectura local; no se atribuye una causa interna no confirmada al fallo de las variantes en el navegador. No se modifica el optimizador ni un endpoint.
- El registro conserva las lecturas históricas fallidas y el selector inicial que no incluía `page-transition`; no se suman como aprobaciones. Los resultados `FINAL` son la revisión vigente.

## Verificación ejecutada

| Comprobación | Resultado |
| --- | --- |
| Anchos CSS reales 320, 390, 640, 767, 820, 1024 y 1440 | PASS final: sin desbordamiento horizontal; seis valores y dos tarjetas de misión/visión presentes |
| Dos imágenes editoriales a los siete anchos | PASS final: cargadas, con dimensiones naturales; foto original comprobada también al entrar en pantalla en tablet |
| Separación número–título | PASS: 11.99 px en móvil y 15.99 px en tamaños superiores |
| Entrada de tarjetas | PASS: observadas opacidades iniciales y finales; las seis terminaron en 1, sin transformación |
| Hover de tarjeta e icono | PASS: elevación de 4 px y giro de icono de 7 grados; lectura real de estilos |
| Movimiento reducido | PASS tras la corrección: seis tarjetas y ocho líneas de título visibles con opacidad 1; sin transformación; transiciones de 0.00001 s |
| Navegación de contacto por teclado | PASS: Enter sobre «Conversemos» abrió `/contacto`, con su título; regreso a Nosotros confirmado |
| Marcas frente a Inicio | PASS: mismos textos, cuatro logos, tarjetas de 230 px y ciclo de 30 s; mismo componente sin editarlo |
| Alcance de código/recursos | PASS: 365 de 367 archivos existentes idénticos; modificados solo la página y los selectores exclusivos en globals.css; añadidos CSS Module e imagen |
| Calidad | PASS: ESLint, TypeScript, `git diff --check` y build aislado DEV de los archivos finales |

Evidencias: [medidas e historial](qa/about-ui/responsive-results.json), [movimiento y marcas](qa/about-ui/motion-and-brands.json), [protección de alcance](qa/about-ui/scope-check.json). Capturas: `hero-1440.jpg`, `hero-390.jpg`, `valores-1440.jpg`, `mision-marcas-1440.jpg`, en `docs/qa/about-ui`.

## Límites y continuidad

- Pruebas de viewport en Chrome de escritorio; dispositivos físicos y zoom nativo al 200 % **NO EJECUTADOS** en esta iteración.
- Se observó un aviso de hidratación al emular movimiento reducido y recargar, coherente con la advertencia previa de las primitivas compartidas. La corrección CSS local mantiene visible el contenido; no se declara una consola libre de avisos ni se modifica lógica compartida fuera del alcance visual.
- Operaciones de negocio no repetidas: el cambio no las toca. Los archivos protegidos permanecen idénticos. No se modificó ni eliminó ningún dato o selección del carrito.
- Mont Heavy completa sigue siendo un recurso pendiente de la adaptación anterior; Manrope 800 conserva la sustitución limpia documentada.
- Correos de negocio pausados. Sin PROD, migraciones, commit, push, merge o despliegue.

Abrir `http://localhost:3000/nosotros` en el servidor DEV existente. Revisar encabezado/foto, valores, misión/visión y marcas; reducir el ancho para comprobar el apilado. El servidor se conserva y la emulación temporal se restablece al finalizar.

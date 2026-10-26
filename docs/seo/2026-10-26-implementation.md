# SEO y HTTPS de GreenBel

26/10/2026. Trabajo solicitado por el usuario para `https://www.greenbel.store`.

## Cambios

- Archivo original de Search Console publicado sin modificar sus 53 bytes en `public/google74fa01bdde3ae7f2.html`. Debe conservarse después de verificar la propiedad. No contiene una contraseña.
- Dominio público unificado en `src/lib/seo.ts`. Se retiran del metadata, robots y sitemap las referencias incorrectas a `greenbel.gt`.
- Canonical, descripción y Open Graph/Twitter propios de Inicio, Productos, Nosotros, Contacto, Financiamiento, Capacitaciones y sus fichas. Las variantes de búsqueda/filtros apuntan a la página pública principal correspondiente.
- Imagen social PNG de 1200 × 630 generada con Next.js ImageResponse, logo original y paleta corporativa; Manrope ya estaba instalado como sustitución de Mont. No se añade un proveedor de imágenes ni dependencias.
- Datos estructurados de Organization/WebSite en Inicio y Product/BreadcrumbList en las fichas. El precio es el precio efectivo que usa la ficha, con moneda GTQ. Solo se declara disponibilidad cuando está verificada. No se inventan opiniones, descuentos, existencias, teléfonos, políticas de devolución ni condiciones de financiamiento. Los placeholders no se presentan como fotografías del producto.
- Sitemap con lectura anónima de las mismas vistas/tablas públicas del catálogo, sujeto a RLS y paginado; sin fixtures, borradores ni rutas privadas. Revalidación cada 15 minutos. No se inventan fechas de modificación. Un fallo de consulta produce error y permite reintento del buscador, en lugar de sustituir silenciosamente el catálogo por datos de demostración.
- PROD indexable; DEV y Vercel Preview llevan `noindex` y robots bloqueado. Panel, cuenta, carrito y demo quedan fuera del sitemap; se conservan sus controles de acceso. Robots permite las rutas públicas de fotografías y portadas aunque el resto de `/api/` no se rastree.

No se modifican tablas, roles, autenticación, carrito, precios ni acciones comerciales. No hay migración ni nuevas variables de entorno; se reutilizan `APP_ENV`, la configuración existente y `VERCEL_ENV` cuando la plataforma lo proporciona.

## HTTPS comprobado

Ambos dominios ya tenían certificados válidos de Let's Encrypt, con handshake autorizado TLS 1.3. Certificados observados el 26/10: vencimiento 24/01/2027; Vercel gestiona su renovación. HTTP redirige a HTTPS, el dominio sin www redirige a www y HTTPS devuelve HSTS `max-age=63072000`. Ambos aparecen como `Valid Configuration` en el proyecto `greenbel-ecommerce`. No se regeneró un certificado válido ni se cambiaron DNS o protecciones.

Chrome sustituyó el candado por el icono de controles del sitio: la ausencia del dibujo antiguo no significa que falte HTTPS.

## Comprobaciones ejecutadas antes de publicar

- PASS: 164 pruebas automatizadas, incluidas seis nuevas de SEO (aislamiento DEV/PROD/Preview, canonical, precio/disponibilidad verificables, datos ausentes, escape JSON-LD y sitemap).
- PASS: TypeScript, ESLint de archivos modificados, `git diff --check` y build completo Next.js 15.5.27 en un checkout aislado con configuración PROD. No se alteró `.env` ni el servidor de desarrollo del usuario.
- PASS: `node scripts/qa-seo-http.mjs http://localhost:3106` sobre el build optimizado: archivo exacto, robots, seis páginas públicas, ficha real con foto y precio, noindex de carrito/login/demo e imagen social PNG. Imagen social inspeccionada visualmente.
- PASS: comparación completa del sitemap contra lecturas anónimas de PROD: 115 productos publicados, cero capacitaciones publicadas y 121 URL totales. Se conserva el producto borrador fuera del sitemap.
- NO EJECUTADO en esta etapa: verificación final de propiedad en Search Console, envío del sitemap a Google, resultados de indexación o cambios de posicionamiento. La cuenta abierta es `greenbel502@gmail.com` y el archivo coincide con el solicitado. La verificación se realiza después de que el despliegue publique el archivo.
- No había capacitaciones públicas en PROD para comprobar una ficha de video real; su metadata y breadcrumbs compilaron correctamente.

## Operación

Tras el despliegue, comprobar `https://www.greenbel.store/google74fa01bdde3ae7f2.html`, completar Verificar en la propiedad HTTPS con www, y enviar `sitemap.xml` en Sitemaps. La herramienta de verificación confirma propiedad; no acredita que las páginas estén indexadas. Revisar después Indexación y Rendimiento. No se añade Analytics ni seguimiento de visitantes.

Verificación reproducible, de solo lectura: `node scripts/qa-seo-http.mjs https://www.greenbel.store`.

## Fuentes oficiales

- [Metadata en Next.js](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)
- [Sitemap en Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- [Canonical en Google Search](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Datos estructurados de productos](https://developers.google.com/search/docs/appearance/structured-data/product-snippet)
- [Verificación de propiedad de Search Console](https://support.google.com/webmasters/answer/9008080?hl=es)
- [Certificados SSL en Vercel](https://vercel.com/docs/domains/working-with-ssl)
- [Cambio de icono de Chrome](https://blog.chromium.org/2023/05/an-update-on-lock-icon.html?hl=en_GB)

# Inicio: separación y acceso a reseñas · 23/10/2026

- **Objetivo:** separar Respaldo técnico y la llamada final; responder a la ausencia del apartado de reseñas sin recuperar opiniones/puntuación ficticias.
- **Base:** `0644f86`, rama dev, árbol limpio al comenzar. Copia efectiva `Greenbel_Ecommerce`. Next.js 15.5.27; estilos CSS globales y componentes existentes.
- **Ambiente:** aplicación local DEV en `http://localhost:3001/`, proceso comprobado en este repositorio. El puerto 3000 corresponde a otro proyecto y no se modificó.
- **Cambio acotado:** margen responsive de 32–64 px si ambos bloques quedan directamente contiguos. La separación ya no depende de un bloque editorial intermedio.
- **Reseñas:** se había ocultado en inicio el muro de testimonios de demostración al cargar el catálogo comercial. Se recuperó su sección mediante una presentación de acceso a las reseñas por producto. No es un listado agregado de reseñas del inicio: el enlace lleva al catálogo, desde donde cada ficha conserva lectura y envío según sus controles existentes. No se consultan nuevas tablas ni se publican cifras/opiniones inventadas. La rama de demostración continúa exclusiva de productos mock en DEV.
- **Sin cambios:** backend, consultas, endpoints, Auth, permisos, validaciones, carrito, precios, datos y correos.

## Verificación

**PASS LOCAL:** ESLint del archivo modificado, TypeScript sin emisión y `git diff --check`. Navegador conectado al servidor DEV: sección Opiniones de clientes visible, enlace `/productos`, sin puntuación ficticia y sin desbordamiento horizontal en 390×840, 820×900 y 1440×900 CSS px. Las superficies visibles mantienen separación de 48, 49 y 86 px respectivamente a ambos lados del bloque de opiniones (padding existente de secciones).

Antes de recuperar el apartado intermedio, la regla de margen directo también se comprobó con 32 px en móvil y aproximadamente 58 px en escritorio. Con las reseñas visibles se conserva el espaciado de secciones existente. Se restableció el tamaño normal del navegador tras las pruebas.

Capturas y medidas: [opiniones en escritorio](qa/home-spacing/reviews-desktop.png), [separación directa](qa/home-spacing/desktop.png), [medidas actuales](qa/home-spacing/checks.json).

**NO EJECUTADO en este bloque:** compra/reseña entregada end-to-end, operaciones remotas de datos, build optimizado completo y pruebas de zoom 200 %. No son cambios de esos flujos y no se repiten suites que creen fixtures. Sin PROD, correos, commit, push ni despliegue.

**Continuidad:** ajuste visual terminado, sin fallos conocidos de este cambio. Si se solicita un muro de reseñas reales en el inicio, hace falta una implementación específica con lectura pública de opiniones moderadas; esta entrega no lo simula.

# Estrategia de Librerias

Esta ecommerce ya tiene una base suficiente para iterar pagina por pagina sin cargar dependencias de mas. La idea es instalar librerias cuando resuelvan una necesidad concreta del flujo de compra, no solo por estetica.

## Ya instaladas y en uso

- `motion`: animaciones discretas y microinteracciones. Cubre lo que normalmente se haria con Framer Motion.
- `sonner`: toasts para carrito, cupones y acciones del checkout.
- `lucide-react`: iconografia del sitio.
- `react-hook-form` + `zod`: formularios y validaciones.
- `tailwindcss`: base visual y responsive.
- `next/font/local`: Inter para interfaz y Manrope para titulares, ambas autoalojadas.

## Conviene aplicar en las proximas mejoras

- `fuse.js`: busqueda inteligente en catalogo por SKU, marca, categoria y especificaciones. Muy util antes de Supabase.
- `embla-carousel-react`: carruseles ligeros para productos destacados, relacionados y galerias.
- `vaul`: drawer movil mas pulido para filtros, carrito y checkout en pantallas pequenas.
- `react-photo-view`: zoom de imagenes en ficha de producto, especialmente para maquinaria y repuestos.
- `canvas-confetti`: celebracion discreta al confirmar pedido simulado.

## Utiles cuando exista backend o mas datos

- `date-fns`: fechas de ordenes, entregas, garantias y mantenimiento.
- `react-loading-skeleton`: placeholders reales cuando los productos vengan de Supabase.
- `zustand`: si el estado crece a favoritos, usuario, sucursales o configuracion. Por ahora Context + Reducer basta para carrito.
- `mapbox-gl`: solo cuando GreenBel confirme sucursales, cobertura o puntos de entrega.
- `recharts`: dashboards internos, analitica o reportes administrativos.

## Instalar solo si una pagina lo pide

- `shadcn/ui` + `radix-ui`: buenos para dialogos, tabs, selects y componentes accesibles, pero conviene agregarlos por componente. No hace falta migrar toda la UI ahora.
- `lenis`: scroll suave para una home mas editorial. Evitarlo en checkout/catalogo si afecta precision o rendimiento.
- `gsap`: animaciones avanzadas tipo showcase. No es necesario para el ecommerce operativo.
- `lottie-react`: animaciones JSON puntuales, por ejemplo estado vacio o exito de compra, si se disenan assets propios.
- `react-three-fiber`: experiencias 3D o hero inmersivo. No es prioridad para vender equipos tecnicos.

## Recomendacion de orden

1. Mejorar catalogo: `fuse.js`, `vaul`.
2. Mejorar producto: `embla-carousel-react`, `react-photo-view`.
3. Mejorar checkout: `canvas-confetti` y, cuando haya backend, `date-fns`.
4. Despues de Supabase: `react-loading-skeleton` y evaluar `zustand`.

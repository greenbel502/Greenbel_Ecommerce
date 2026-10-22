# Imagen ilustrativa de Nosotros

Fecha: 22/10/2026. Generada con la herramienta integrada `image_gen` (sin CLI ni API adicional).

- Archivo utilizado: [campo-riego-ilustrativo.webp](../../../public/images/about/campo-riego-ilustrativo.webp).
- Dimensiones: 1122 × 1402 px; 358 792 bytes.
- Optimización: conversión a WebP, calidad 86, mediante la dependencia Sharp existente. Sin redimensionar ni retocar el contenido.
- Uso: panel fotográfico principal de `/nosotros`, con recorte responsive mediante `object-fit`. Las dos imágenes editoriales se sirven desde sus archivos locales (`unoptimized` en Next Image); el WebP ya está optimizado y la fotografía JPEG existente pesa 290 KB. Así se evitan las variantes de imagen que no completaron la carga al cambiar de viewport en DEV, sin modificar el optimizador, rutas ni APIs de negocio.
- Es una escena ilustrativa generada; no acredita una ubicación, equipo comercial concreto, personal o instalación real de GreenBel. El texto alternativo la identifica como ilustrativa.
- Se conservan sin modificar las dos imágenes antiguas. La foto real del bloque de misión/visión se encuadra desde abajo mediante CSS para mostrar la fotografía, sin el texto del cartel de origen.

## Prompt utilizado

```text
Use case: photorealistic-natural. Create a polished editorial agricultural photograph for the right-hand image panel of the GreenBel ecommerce About page. New original photograph, portrait 4:5 composition, suitable for cropping to a square on mobile. Show lush rows of green crops in the Guatemalan highlands, distant soft mountains, and carefully arranged practical irrigation equipment in the foreground: a realistic compact portable water pump with a sturdy metal frame and neatly connected irrigation hose beside the crop rows. Warm natural early-morning light, authentic soil and leaf texture, restrained rich greens, calm trustworthy agricultural mood, professional documentary photography, natural depth and excellent detail. Put the important equipment around the lower-middle of the frame, keep the horizon in the upper third; no extreme closeup. This is an illustrative scene, not a real GreenBel team or product endorsement. No people, no letters, no captions, no logos, no branding, no watermark, no poster layout, no UI, no typography or text anywhere. Avoid excessive HDR, fantasy machinery, distorted hoses or overly saturated colors.
```

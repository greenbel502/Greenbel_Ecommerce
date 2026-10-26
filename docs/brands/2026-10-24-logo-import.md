# Logotipos de las ocho marcas comerciales · 24/10/2026

## Resultado

Solicitud: buscar los logotipos de las marcas importadas del Excel, prepararlos en PNG y colocarlos en el sistema.

- Ocho PNG reales en `public/images/brands/catalog/`, con proporciones y colores de los originales. Solo conversión de formato, recorte del margen exterior vacío y padding transparente; sin reconstruir o generar identidades.
- Siete logotipos asociados a los registros existentes en **DEV**. Se conservó íntegro el registro y archivo de Futureco que ya había cargado el usuario.
- Se mantienen los mismos IDs, nombres, identificadores, estados y relaciones con productos. Inicio/Nosotros siguen consultando las marcas administrables, sin añadir una lista fija en el frontend.
- Los PNG de entrega se conservan como PNG. La copia utilizada por el sistema sigue la normalización existente a **WebP sin pérdida**, en el bucket privado aprobado en 024. No se cambió el formato permitido del bucket, esquema, RLS, permisos ni backend.

## Procedencia

| Marca | Fuente de la imagen |
|---|---|
| Futureco | [Fabricante](https://www.futurecobioscience.com/), PNG del encabezado. El logo DEV previo se preservó. |
| Interie | [Intercontinental Import Export, fabricante de RADIX](https://www.interie.net/), `images/logo_iie.png`. Corresponde al nombre Interie del Excel. |
| KAWASHIMA | [Comercializadora Marvel](https://marvelsa.com/), PNG original de su apartado de marcas. |
| KAWASHIMA PRO | [Comercializadora Marvel](https://marvelsa.com/), PNG original específico PRO, distinto del estándar. |
| PARAZZINI | [Comercializadora Marvel](https://marvelsa.com/), PNG original específico estándar. |
| TAKASHI | [Comercializadora Marvel](https://marvelsa.com/), PNG original de su apartado de marcas. |
| Syngenta | [Fabricante](https://www.syngenta.com/), SVG oficial del encabezado convertido a PNG. Se utiliza la marca de productos Syngenta. |
| UPL | [Comunicado oficial del fabricante](https://www.upl-ltd.com/shareholdercenter_pdfs/DmmgqzNlLowslwJdutBQ4sA24SLTpEHN0Z213fTy/Press-Release.pdf), página 1, área original del logo UPL OpenAg extraída de su membrete y convertida a PNG. |

Los recursos conservan su titularidad original. Este registro acredita la procedencia utilizada; no afirma que la descarga conceda una licencia adicional.

El primer recurso `uplcorp.com/country_sites/logo.png` resultó ser Advanta al inspeccionarlo, por lo que **se descartó**. También se descartó el SVG de pie de UPL con letras blancas, que no se leía sobre blanco. Solo se publicó el logotipo UPL completo corroborado. Los logos de equipos provienen del mismo proveedor comercial, sin confundirlos con otras empresas homónimas de Japón/Brasil u otros sectores.

El detalle de URLs, hashes SHA256, resolución, transformación y archivo final está en [el manifiesto de fuentes](logo-sources-2026-10-24.json). [Vista conjunta de los PNG](logos-preview-2026-10-24.png) y [paquete descargable](greenbel-logos-png.zip).

## Verificación ejecutada

- **PASS:** preflight DEV comparó selector, URL, referencia configurada y enlace CLI real. Bucket privado WebP/2 MB confirmado; no se aplicaron migraciones.
- **PASS:** ocho PNG decodificados y revisados visualmente en una lámina; firmas/formato, dimensiones y hashes coinciden con el manifiesto.
- **PASS DEV:** siete cargas nuevas, lectura posterior de punteros y objetos privados. Futureco conservado sin cambiar su archivo ni su fila.
- **PASS DEV:** comparación de las filas antes/después: datos de marca ajenos al logo y timestamp conservados; productos, perfiles y roles íntegramente iguales. No se crearon cuentas ni productos de prueba.
- **PASS DEV + HTTP:** las ocho imágenes aparecen con su versión guardada en el HTML de Inicio y Nosotros; cada ruta pública devuelve HTTP 200 y los bytes persistidos esperados. Los ocho PNG también se descargan por HTTP como `image/png` con el hash correcto. Storage anónimo directo sigue denegado.
- **PASS LOCAL:** sintaxis Node, ESLint dirigido sin advertencias y `git diff --check`.
- **NO EJECUTADO:** captura/interacción/responsive en navegador. Inventario de control vacío y fallo de arranque nativo. La lámina es una revisión de los archivos, no una captura del sitio.
- No se repitió build/TypeScript: en este bloque solo se añadieron recursos, un script de importación y documentación; no cambió código de la aplicación. No se atribuyen pruebas históricas a este bloque.

[Evidencia de importación y HTTP](logo-import-2026-10-24.json). Respaldo privado de las filas previas y diario de cada asociación fuera de Git en `~/.codex/private/greenbel-brand-logo-import-20261024/`.

## Reutilización segura

```bash
node --env-file=.env scripts/dev-import-brand-logos.mjs --plan
node --env-file=.env scripts/dev-import-brand-logos.mjs --verify
```

`--apply` solo agrega logotipos a marcas sin archivo; no reemplaza imágenes guardadas ni activa marcas. La actualización exige que el puntero siga vacío, verifica la asociación y registra el avance antes de cada escritura. Un diario interrumpido requiere revisión; no se elimina un archivo cuya asociación no pueda confirmarse. El script se restringe a las ocho referencias revisadas y al destino DEV enlazado.

Solo DEV. Sin commit, push, despliegue, PROD, correos o pagos.

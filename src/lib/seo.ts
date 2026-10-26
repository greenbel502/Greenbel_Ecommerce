import type { Metadata, MetadataRoute } from "next";
import type { Product } from "../domain/entities/product";

export const SITE_URL = "https://www.greenbel.store";
export const SITE_NAME = "GreenBel";
export const SITE_DESCRIPTION =
  "Productos agrícolas, equipos de aspersión y bombeo, repuestos y asesoría técnica en Guatemala. Explora el catálogo GreenBel y solicita atención por WhatsApp.";

/** Preview and DEV must never advertise themselves as the public production site. */
export function isIndexableEnvironment(
  source: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    source.APP_ENV === "PROD" &&
    (!source.VERCEL_ENV || source.VERCEL_ENV === "production")
  );
}

export function siteUrl(path = "/") {
  const url = new URL(path, SITE_URL);
  if (url.origin !== SITE_URL)
    throw new Error("SEO URL must use the public GreenBel domain");
  url.search = "";
  url.hash = "";
  return url.href;
}

export function pageMetadata({
  title,
  description,
  path,
  image,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Metadata {
  const imageUrl = siteUrl(image ?? "/opengraph-image");
  return {
    title,
    description,
    alternates: { canonical: siteUrl(path) },
    openGraph: {
      type: "website",
      locale: "es_GT",
      siteName: SITE_NAME,
      title: `${title} | ${SITE_NAME}`,
      description,
      url: siteUrl(path),
      images: [
        {
          url: imageUrl,
          alt: image
            ? title
            : "GreenBel · Productos y equipos agrícolas en Guatemala",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [imageUrl],
    },
  };
}

export function productDescription(product: Product) {
  return (
    product.shortDescription.trim() ||
    product.description.trim().slice(0, 180) ||
    `${product.name}. Código ${product.sku}. Consulta su precio y ficha en el catálogo de GreenBel Guatemala.`
  );
}

/** Only values also shown on the real product page; never infer stock or reviews. */
export function productStructuredData(product: Product) {
  if (product.isMockPrice) return null;
  const url = siteUrl(`/productos/${encodeURIComponent(product.slug)}`);
  const images = (
    product.images?.length
      ? product.images.map((item) => item.src)
      : [product.image]
  ).filter((src) => src !== "/images/product-placeholder.svg");
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    url,
    name: product.name,
    sku: product.sku,
    category: product.category,
    description: productDescription(product),
    ...(product.brand && product.brand !== "Sin marca"
      ? { brand: { "@type": "Brand", name: product.brand } }
      : {}),
    ...(images.length
      ? { image: [...new Set(images)].map((src) => siteUrl(src)) }
      : {}),
    ...(product.price !== null &&
    Number.isFinite(product.price) &&
    product.price > 0
      ? {
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: "GTQ",
            price: product.price.toFixed(2),
            seller: { "@id": `${SITE_URL}/#organization` },
            ...(product.availability === "available"
              ? { availability: "https://schema.org/InStock" }
              : product.availability === "unavailable"
                ? { availability: "https://schema.org/OutOfStock" }
                : {}),
          },
        }
      : {}),
  };
}

export function breadcrumbStructuredData(
  items: ReadonlyArray<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: siteUrl(item.path),
    })),
  };
}

export function siteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: siteUrl("/images/brand/greenbel-horizontal.svg"),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        inLanguage: "es-GT",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

/** Escape HTML delimiters even when a product name contains script-like text. */
export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function sitemapEntries(
  productSlugs: readonly string[],
  trainingSlugs: readonly string[],
): MetadataRoute.Sitemap {
  const paths = [
    "/",
    "/productos",
    "/capacitaciones",
    "/financiamiento",
    "/nosotros",
    "/contacto",
    ...productSlugs.map((slug) => `/productos/${encodeURIComponent(slug)}`),
    ...trainingSlugs.map(
      (slug) => `/capacitaciones/${encodeURIComponent(slug)}`,
    ),
  ];
  return [...new Set(paths)].map((path) => ({ url: siteUrl(path) }));
}

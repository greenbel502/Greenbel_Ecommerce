import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isIndexableEnvironment,
  pageMetadata,
  productStructuredData,
  serializeStructuredData,
  siteUrl,
  sitemapEntries,
  SITE_URL,
} from "../src/lib/seo.ts";

const product = {
  id: "seo-fixture",
  slug: "producto-qa",
  sku: "QA-SEO",
  name: "Producto de prueba SEO",
  brand: "Marca de prueba",
  category: "Categoría de prueba",
  shortDescription: "Descripción de prueba",
  description: "",
  isMockPrice: false,
  price: 83.25,
  availability: "unknown",
  image: "/api/product-images/00000000-0000-4000-8000-000000000001",
};

test("only the production environment is indexable, including when preview inherits PROD settings", () => {
  assert.equal(
    isIndexableEnvironment({ APP_ENV: "PROD", VERCEL_ENV: "production" }),
    true,
  );
  assert.equal(isIndexableEnvironment({ APP_ENV: "PROD" }), true);
  for (const source of [
    {},
    { APP_ENV: "DEV" },
    { APP_ENV: "PROD", VERCEL_ENV: "preview" },
    { APP_ENV: "DEV", VERCEL_ENV: "production" },
  ])
    assert.equal(isIndexableEnvironment(source), false);
});

test("canonicals and social URLs use the public domain and remove duplicate query and fragment variants", () => {
  assert.equal(
    siteUrl("/productos?busqueda=qa#resultados"),
    `${SITE_URL}/productos`,
  );
  const metadata = pageMetadata({
    title: "Productos",
    description: "Catálogo",
    path: "/productos",
  });
  assert.equal(metadata.alternates.canonical, `${SITE_URL}/productos`);
  assert.equal(metadata.openGraph.url, `${SITE_URL}/productos`);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.throws(() => siteUrl("//other.example/path"));
});

test("product schema uses the effective price, public image URLs and only verified availability", () => {
  const unknown = productStructuredData(product);
  assert.equal(unknown.offers.price, "83.25");
  assert.equal(unknown.offers.priceCurrency, "GTQ");
  assert.equal(unknown.offers.availability, undefined);
  assert.equal(unknown.aggregateRating, undefined);
  assert.deepEqual(unknown.image, [SITE_URL + product.image]);
  assert.equal(
    productStructuredData({ ...product, availability: "available" }).offers
      .availability,
    "https://schema.org/InStock",
  );
  assert.equal(
    productStructuredData({ ...product, availability: "unavailable" }).offers
      .availability,
    "https://schema.org/OutOfStock",
  );
  assert.equal(
    productStructuredData({ ...product, price: 72.99 }).offers.price,
    "72.99",
  );
});

test("demonstration products, missing prices, placeholders and missing brands are not fabricated in schema", () => {
  assert.equal(productStructuredData({ ...product, isMockPrice: true }), null);
  for (const price of [null, 0, NaN, -1])
    assert.equal(
      productStructuredData({ ...product, price }).offers,
      undefined,
    );
  const missing = productStructuredData({
    ...product,
    image: "/images/product-placeholder.svg",
    brand: "Sin marca",
  });
  assert.equal(missing.image, undefined);
  assert.equal(missing.brand, undefined);
});

test("structured data preserves user content without permitting a script breakout", () => {
  const source = { name: "</script><script>alert('QA')</script>" };
  const json = serializeStructuredData(source);
  assert.ok(!json.includes("<"));
  assert.deepEqual(JSON.parse(json), source);
});

test("sitemap lists only supplied published slugs, deduplicates and excludes private routes and invented dates", () => {
  const entries = sitemapEntries(
    ["producto-publicado", "producto-publicado"],
    ["video-publicado"],
  );
  const urls = entries.map(({ url }) => url);
  assert.equal(urls.length, 8);
  assert.ok(urls.includes(`${SITE_URL}/productos/producto-publicado`));
  assert.ok(urls.includes(`${SITE_URL}/capacitaciones/video-publicado`));
  assert.ok(urls.every((url) => url.startsWith(SITE_URL + "/")));
  assert.ok(!urls.some((url) => /admin|carrito|cuenta|checkout/.test(url)));
  assert.ok(entries.every((entry) => !entry.lastModified));
});

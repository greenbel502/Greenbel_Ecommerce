/** Read-only checks: node scripts/qa-seo-http.mjs [http://localhost:3106] */
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const origin = new URL(process.argv[2] ?? "https://www.greenbel.store").origin;
const canonical = "https://www.greenbel.store";
const results = [];
async function read(path) {
  const response = await fetch(origin + path, { headers: { "User-Agent": "facebookexternalhit/1.1" }, signal: AbortSignal.timeout(45000) });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response;
}
function tagValues(html, selector, attribute) {
  return [...html.matchAll(/<(?:meta|link)\b[^>]*>/g)].filter(([tag]) => tag.includes(selector))
    .map(([tag]) => tag.match(new RegExp(`${attribute}="([^"]*)"`))?.[1]);
}
function schema(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

const expected = "google-site-verification: google74fa01bdde3ae7f2.html";
assert.equal(await (await read("/google74fa01bdde3ae7f2.html")).text(), expected);
results.push("PASS: archivo de verificación exacto y público");
const robots = await (await read("/robots.txt")).text();
assert.ok(robots.includes(`Sitemap: ${canonical}/sitemap.xml`));
assert.ok(robots.includes("Disallow: /admin"));
assert.ok(robots.includes("Allow: /api/product-images/"));
assert.ok(!robots.includes("greenbel.gt"));
results.push("PASS: robots de producción y acceso a imágenes públicas");
const xml = await (await read("/sitemap.xml")).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.ok(urls.length >= 6);
assert.equal(new Set(urls).size, urls.length);
assert.ok(urls.every((url) => url.startsWith(canonical + "/")));
assert.ok(!urls.some((url) => /\/(admin|cuenta|carrito|checkout)(\/|$)/.test(url)));
results.push(`PASS: sitemap con ${urls.length} URL canónicas únicas`);

for (const path of ["/", "/productos", "/nosotros", "/contacto", "/financiamiento", "/capacitaciones"]) {
  const html = await (await read(path)).text();
  assert.deepEqual(tagValues(html, 'rel="canonical"', "href").map((url) => new URL(url).href), [canonical + path]);
  assert.deepEqual(tagValues(html, 'property="og:url"', "content").map((url) => new URL(url).href), [canonical + path]);
  assert.ok(tagValues(html, 'name="description"', "content")[0]?.length > 20);
  assert.ok(tagValues(html, 'property="og:image"', "content")[0]?.startsWith(canonical + "/"));
  assert.ok(!tagValues(html, 'name="robots"', "content").some((v) => v?.includes("noindex")));
  if (path === "/") assert.ok(schema(html).some((entry) => entry["@graph"]?.some((node) => node["@type"] === "Organization")));
  results.push(`PASS: metadata y canonical de ${path}`);
}

const productUrl = urls.find((url) => url.endsWith("-fut1023")) ?? urls.find((url) => url.includes("/productos/"));
if (productUrl) {
  const path = new URL(productUrl).pathname;
  const html = await (await read(path)).text();
  assert.deepEqual(tagValues(html, 'rel="canonical"', "href"), [productUrl]);
  const entries = schema(html);
  const product = entries.find((entry) => entry["@type"] === "Product");
  assert.ok(product?.name && product.sku);
  assert.equal(product.url, productUrl);
  assert.ok(entries.some((entry) => entry["@type"] === "BreadcrumbList"));
  if (product.offers) {
    assert.equal(product.offers.priceCurrency, "GTQ");
    assert.ok(Number(product.offers.price) > 0);
  }
  if (product.image?.[0]) {
    const image = await read(new URL(product.image[0]).pathname);
    assert.ok(image.headers.get("content-type")?.startsWith("image/"));
  }
  results.push("PASS: ficha real, esquema de producto, precio y fotografía accesible");
}
for (const path of ["/carrito", "/cuenta/ingresar", "/loader-demo"]) {
  const html = await (await read(path)).text();
  assert.ok(tagValues(html, 'name="robots"', "content").some((v) => v?.includes("noindex")));
  results.push(`PASS: noindex de ${path}`);
}
const social = await read("/opengraph-image");
assert.ok(social.headers.get("content-type")?.startsWith("image/png"));
const png = Buffer.from(await social.arrayBuffer());
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);
await fs.writeFile("/tmp/greenbel-seo-social-preview.png", png);
results.push("PASS: imagen social PNG 1200 × 630");
console.log(results.join("\n"));

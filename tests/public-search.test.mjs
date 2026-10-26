import { test } from "node:test";
import assert from "node:assert/strict";
import { publicProductSearchResults } from "../src/lib/products/public-search.ts";

const fixture = {
  id: "public-search-fixture",
  name: "Producto QA",
  slug: "producto-qa",
  sku: "QA-SEARCH",
  brand: "Marca QA",
  image: "/images/product-placeholder.svg",
  price: 83.25,
  isMockPrice: false,
  description: "Campo no requerido por la búsqueda",
  stock: null,
};

test("public search bounds its payload and exposes only storefront summary fields", () => {
  const result = publicProductSearchResults(
    Array.from({ length: 15 }, (_, index) => ({
      ...fixture,
      id: String(index),
    })),
    "PROD",
  );
  assert.equal(result.length, 6);
  assert.deepEqual(
    Object.keys(result[0]).sort(),
    [
      "id",
      "name",
      "slug",
      "sku",
      "brand",
      "image",
      "price",
      "isMockPrice",
    ].sort(),
  );
  assert.equal(result[0].price, 83.25);
  assert.equal(result[0].stock, undefined);
});

test("production search never returns demonstration prices; explicit DEV fixtures retain their marker", () => {
  const products = [{ ...fixture, id: "qa-mock", isMockPrice: true }, fixture];
  assert.deepEqual(
    publicProductSearchResults(products, "PROD").map((product) => product.id),
    [fixture.id],
  );
  assert.equal(
    publicProductSearchResults(products, "DEV")[0].isMockPrice,
    true,
  );
  assert.equal(
    publicProductSearchResults([{ ...fixture, price: null }], "PROD")[0].price,
    null,
  );
});

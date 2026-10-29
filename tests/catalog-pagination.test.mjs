import assert from "node:assert/strict";
import test from "node:test";
import { paginateCatalog } from "../src/lib/products/catalog-pagination.ts";

test("115 resultados se recorren sin duplicados ni omisiones en diez páginas", () => {
  const products = Array.from({ length: 115 }, (_, id) => ({ id }));
  const pages = Array.from({ length: 10 }, (_, index) =>
    paginateCatalog(products, index + 1),
  );
  assert.equal(pages[0].items.length, 12);
  assert.deepEqual(
    pages.flatMap((page) => page.items),
    products,
  );
  assert.deepEqual(
    [pages[9].first, pages[9].last, pages[9].totalPages],
    [109, 115, 10],
  );
});

test("el límite se aplica a los resultados ya filtrados y ordenados sin alterarlos", () => {
  const products = Array.from({ length: 30 }, (_, price) => ({ price }));
  const selected = products
    .filter((p) => p.price >= 10)
    .sort((a, b) => b.price - a.price);
  const original = structuredClone(selected);
  const result = paginateCatalog(selected, 2);
  assert.equal(result.totalPages, 2);
  assert.deepEqual(
    result.items.map((p) => p.price),
    [17, 16, 15, 14, 13, 12, 11, 10],
  );
  assert.deepEqual(selected, original);
});

test("catálogos vacíos o páginas fuera del rango mantienen rangos y selección válidos", () => {
  assert.deepEqual(paginateCatalog([], 4), {
    items: [],
    page: 1,
    totalPages: 1,
    total: 0,
    first: 0,
    last: 0,
  });
  const products = Array.from({ length: 13 }, (_, id) => id);
  assert.equal(paginateCatalog(products, -5).page, 1);
  assert.equal(paginateCatalog(products, Infinity).page, 1);
  assert.equal(paginateCatalog(products, 99).page, 2);
  assert.deepEqual(paginateCatalog(products, 99).items, [12]);
});

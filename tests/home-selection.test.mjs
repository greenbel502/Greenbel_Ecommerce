import assert from "node:assert/strict";
import test from "node:test";
import { selectHomeProducts } from "../src/lib/products/home-selection.ts";

test("Inicio respeta los destacados administrados antes de elegir equipos de respaldo", () => {
  const equipment = { id: "equipment", kind: "equipment", featured: false };
  const featured = { id: "agricultural", kind: "agricultural", featured: true };
  const result = selectHomeProducts([equipment, featured]);
  assert.deepEqual(result.products, [featured]);
  assert.equal(result.title, "Productos destacados");
});

test("sin destacados muestra hasta cinco equipos públicos sin alterar sus banderas", () => {
  const products = [
    { id: "agricultural", kind: "agricultural", featured: false },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `equipment-${index}`, kind: "equipment", featured: false,
    })),
  ];
  const original = structuredClone(products);
  const result = selectHomeProducts(products);
  assert.equal(result.title, "Equipos para tu trabajo");
  assert.deepEqual(result.products.map((product) => product.id),
    Array.from({ length: 5 }, (_, index) => `equipment-${index}`));
  assert.deepEqual(products, original);
});

test("los destacados también se limitan a cinco y conservan el orden público", () => {
  const products = Array.from({ length: 8 }, (_, index) => ({
    id: `featured-${index}`, kind: "equipment", featured: true,
  }));
  const result = selectHomeProducts(products);
  assert.deepEqual(result.products, products.slice(0, 5));
  assert.equal(result.title, "Equipos destacados");
});

test("un catálogo sin equipos usa sus productos reales y uno vacío no fabrica productos", () => {
  const product = { id: "agricultural", kind: "agricultural", featured: false };
  assert.deepEqual(selectHomeProducts([product]).products, [product]);
  assert.equal(selectHomeProducts([product]).title, "Explora nuestros productos");
  assert.deepEqual(selectHomeProducts([]).products, []);
});

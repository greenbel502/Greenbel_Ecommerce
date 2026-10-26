import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateProductSlug,
  isProductSlugConflict,
} from "../src/lib/products/product-slug.ts";

test("product links normalize names and retain the company code", () => {
  assert.equal(
    generateProductSlug("Aspersór Kawashima / Élite", "AK-26TB"),
    "aspersor-kawashima-elite-ak-26tb",
  );
  assert.equal(generateProductSlug("  Café & Té  ", "X / 01"), "cafe-te-x-01");
});

test("long and non-Latin values always produce a valid bounded path segment", () => {
  const collision = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  for (const [name, sku] of [
    ["Á ".repeat(120), "BC-".repeat(33) + "X"],
    ["日本語", "🥬"],
    ["---", "---"],
    ["Nombre", "X"],
  ]) {
    for (const suffix of ["", collision]) {
      const value = generateProductSlug(name, sku, suffix);
      assert.ok(value.length > 0 && value.length <= 160);
      assert.match(value, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      if (suffix) assert.ok(value.endsWith(collision));
    }
  }
  assert.equal(generateProductSlug("日本語", "🥬"), "producto");
});

test("only slug uniqueness failures are retryable; SKU and other failures are not", () => {
  assert.equal(isProductSlugConflict(null), false);
  assert.equal(
    isProductSlugConflict({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "products_slug_key"',
    }),
    true,
  );
  assert.equal(
    isProductSlugConflict({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "products_sku_key"',
    }),
    false,
  );
  assert.equal(
    isProductSlugConflict({
      code: "23514",
      message: 'constraint "products_slug_key"',
    }),
    false,
  );
});

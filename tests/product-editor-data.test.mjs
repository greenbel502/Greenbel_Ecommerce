import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadProductEditorData,
  ProductEditorLoadError,
} from "../src/lib/products/product-editor-data.ts";
const id = "00000000-0000-4000-8000-0000000000ab";
const data = {
  product: { id },
  images: [{ id: "image", product_id: id }],
  specs: [{ id: "spec", product_id: id }],
  inclusions: [],
  compatibilities: [],
  relatedProducts: [],
  brands: [],
  categories: [],
};

test("read requests only the chosen product with private no-store fetch and normalizes UUID casing", async () => {
  const result = await loadProductEditorData(id.toUpperCase(), {
    request: async (url, options) => {
      assert.equal(url, "/api/admin/products/" + id);
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal);
      return Response.json(data);
    },
  });
  assert.deepEqual(result, data);
});

test("a request that never completes reaches a finite timeout and can be retried", async () => {
  let aborted = false;
  const started = performance.now();
  await assert.rejects(
    loadProductEditorData(id, {
      timeoutMs: 25,
      request: async (_url, options) => {
        options.signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise(() => {});
      },
    }),
    (error) =>
      error instanceof ProductEditorLoadError &&
      error.message.includes("tardando"),
  );
  assert.ok(performance.now() - started < 500);
  assert.equal(aborted, true);
  assert.deepEqual(
    await loadProductEditorData(id, {
      request: async () => Response.json(data),
    }),
    data,
  );
});

test("closing or switching selection cancels the read even when the network ignores abort", async () => {
  const controller = new AbortController();
  const result = loadProductEditorData(id, {
    signal: controller.signal,
    request: async () => new Promise(() => {}),
  });
  controller.abort();
  await assert.rejects(result, (error) => error.name === "AbortError");
});

test("permission, missing record and malformed responses show controlled messages, never raw server errors", async () => {
  for (const status of [401, 403, 404, 503]) {
    await assert.rejects(
      loadProductEditorData(id, {
        request: async () =>
          Response.json({ error: "internal SQL credentials" }, { status }),
      }),
      (error) =>
        error instanceof ProductEditorLoadError &&
        error.status === status &&
        !error.message.includes("SQL"),
    );
  }
  await assert.rejects(
    loadProductEditorData(id, {
      request: async () => new Response("<html>internal trace</html>"),
    }),
    (error) =>
      error instanceof ProductEditorLoadError &&
      !error.message.includes("trace"),
  );
});

test("responses for a different product cannot enter the editor or mix its details", async () => {
  for (const bad of [
    { ...data, product: { id: "other" } },
    { ...data, images: [{ product_id: "other" }] },
    { ...data, specs: [{ product_id: "other" }] },
    {
      ...data,
      compatibilities: [{ equipment_id: "other", part_id: "another" }],
    },
  ])
    await assert.rejects(
      loadProductEditorData(id, { request: async () => Response.json(bad) }),
      ProductEditorLoadError,
    );
});

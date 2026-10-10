import assert from "node:assert/strict";
import test from "node:test";
import { readLimitedMultipart } from "../src/lib/http/read-limited-multipart.ts";

test("multipart pequeño se parsea después de medir sus bytes reales", async () => {
  const form = new FormData();
  form.set("productId", "producto-ficticio");
  form.set("image", new File([Uint8Array.of(1, 2, 3)], "qa.png", { type: "image/png" }));
  const request = new Request("http://localhost/upload", { method: "POST", body: form });
  const parsed = await readLimitedMultipart(request, 4096);
  assert.equal(parsed?.get("productId"), "producto-ficticio");
  assert.equal(parsed?.get("image")?.size, 3);
});

test("multipart sin Content-Length se corta antes del parser al exceder el máximo", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(1024)); },
    cancel() { cancelled = true; }
  });
  const request = new Request("http://localhost/upload", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=qa" },
    body: stream,
    duplex: "half"
  });
  assert.equal(request.headers.has("content-length"), false);
  assert.equal(await readLimitedMultipart(request, 512), null);
  assert.equal(cancelled, true);
});

test("Content-Length falso tampoco permite sobrepasar el límite real", async () => {
  const form = new FormData();
  form.set("message", "x".repeat(2048));
  const request = new Request("http://localhost/upload", { method: "POST", body: form });
  request.headers.set("Content-Length", "1");
  assert.equal(await readLimitedMultipart(request, 512), null);
});

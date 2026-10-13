/** Verify the actual local server, not a temporary copy or just source files. */
import assert from "node:assert/strict";

const origin = new URL(process.argv[2] ?? "http://localhost:3000");
assert.ok(process.argv.length <= 3 && origin.protocol === "http:"
  && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
  && !origin.username && !origin.password && origin.pathname === "/"
  && !origin.search && !origin.hash, "Only a loopback app origin is allowed");

let passed = 0;
for (const path of ["/financiamientosds", "/ruta-inexistente-qa", "/ruta-inexistente-qa/anidada"]) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20_000) });
  const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.equal(response.status, 404, `${path}: HTTP 404 required`);
  assert.match(html, /<h1[^>]*>No encontramos esta página<\/h1>/,
    `${path}: custom 404 must be rendered, not just present in an unused RSC payload`);
  assert.ok(html.includes("Explorar productos") && html.includes("Volver al inicio"),
    `${path}: recovery links missing`);
  assert.ok(!html.includes("This page could not be found"), `${path}: default 404 still active`);
  passed++;
  console.log(`PASS: ${origin.origin}${path}: HTTP 404 y pantalla GreenBel renderizada.`);
}
console.log(`PASS: servidor local activo ${passed}/${passed}; sin operaciones de Supabase, correo o pago.`);

import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
const require = createRequire(import.meta.url),
  Module = require("module"),
  original = Module._load;
Module._load = function (r, p, m) {
  if (r === "server-only") return {};
  if (r === "@/lib/server/environment") return { getActiveEnvironment: () => ({ supabase: { url: "https://dev.example.invalid" } }) };
  return original.call(this, r, p, m);
};
require.extensions[".ts"] = (m, p) =>
  m._compile(
    ts.transpileModule(readFileSync(p, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    p,
  );
const {
  buildFinancingMime,
  renderFinancingContent,
} = require("../src/lib/gmail/financing-message.ts");
const application = {
  id: "11111111-1111-4111-8111-111111111111",
  applicantName: "Cliente <QA> & ejemplo",
  email: "client@example.invalid",
  phone: "+50200000000",
  message: "Consulta de información\n<etiqueta> & prueba.",
  quoteReference: "GB-COT-QA",
  createdAt: "2026-10-26T03:00:00Z",
  authenticatedAt: "2026-10-26T03:05:00Z",
};
const pdf = new TextEncoder().encode("%PDF-1.7\nQA attachment\n%%EOF");
const decode = (mime) =>
  [
    ...mime.matchAll(
      /Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g,
    ),
  ].map((m) => Buffer.from(m[1].replace(/\s/g, ""), "base64"));
test("financing email identifies GreenBel, authenticated customer and fixed recipient with the exact attached PDF", () => {
  const mime = buildFinancingMime(
      application,
      "sender@example.invalid",
      "coop@example.invalid",
      pdf,
    ),
    parts = decode(mime);
  assert.match(mime, /From: GreenBel <sender@example.invalid>/);
  assert.match(mime, /To: <coop@example.invalid>/);
  assert.match(mime, /Reply-To: <client@example.invalid>/);
  assert.match(mime, /multipart\/mixed/);
  assert.match(
    mime,
    /Content-Disposition: attachment; filename="Cotizacion-GB-COT-QA.pdf"/,
  );
  assert.equal(parts.length, 3);
  assert.deepEqual(parts[2], Buffer.from(pdf));
  assert.equal((mime.match(/Content-Disposition: attachment;/g)||[]).length, 1);
  assert.equal((mime.match(/Content-Disposition: inline\r\n/g)||[]).length, 0);
  assert.ok(!mime.includes('filename="greenbel.png"'));
  assert.ok(!mime.includes('name="greenbel.png"'));
  assert.match(mime, /type="text\/html"/);
  assert.match(parts[1].toString(), /https:\/\/[^" ]+\/storage\/v1\/object\/public\/email-assets\/greenbel-/);
  assert.match(parts[1].toString(), /https:\/\/[^" ]+\/storage\/v1\/object\/public\/email-assets\/cooperative-/);
  assert.ok(!mime.includes("Content-Type: image/"));
  assert.ok(parts[0].toString().includes("Desde GreenBel les compartimos"));
  assert.ok(
    parts[0]
      .toString()
      .includes("solicita información sobre un posible financiamiento"),
  );
});
test("financing template escapes personal content and preserves all customer data without approval promises", () => {
  const { text, html } = renderFinancingContent(application);
  for (const value of [
    application.applicantName,
    application.email,
    application.phone,
    application.message,
    application.quoteReference,
  ])
    assert.ok(text.includes(value));
  assert.ok(html.includes("&lt;QA&gt; &amp;"));
  assert.ok(html.includes("&lt;etiqueta&gt;"));
  assert.ok(!html.includes("<etiqueta>"));
  assert.ok(text.includes("no implica aprobación"));
});
test("missing account proof, unsafe attachment or malformed headers cannot construct a financing email", () => {
  assert.throws(() =>
    buildFinancingMime(
      { ...application, authenticatedAt: "" },
      "sender@example.invalid",
      "coop@example.invalid",
      pdf,
    ),
  );
  assert.throws(() =>
    buildFinancingMime(
      application,
      "sender@example.invalid",
      "coop@example.invalid",
      new TextEncoder().encode("<html>fake</html>"),
    ),
  );
  assert.throws(() =>
    buildFinancingMime(
      {
        ...application,
        email: "client@example.invalid\r\nBcc: other@example.invalid",
      },
      "sender@example.invalid",
      "coop@example.invalid",
      pdf,
    ),
  );
});

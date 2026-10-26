import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
const require = createRequire(import.meta.url),
  Module = require("module"),
  original = Module._load;
for (const ext of [".ts", ".tsx"])
  require.extensions[ext] = (m, p) =>
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
class CustomerProfileError extends Error {
  constructor(status) {
    super("private error");
    this.status = status;
  }
}
const product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Producto QA",
  sku: "QA",
  price: 83.25,
  isMockPrice: false,
  stock: 10,
  availability: "available",
};
let sessionError, snapshot, catalogCalls, products, invitation;
Module._load = function (r, p, m) {
  if (r === "server-only") return {};
  if (r === "@/lib/server/whatsapp-reviews")
    return { issueWhatsAppReviewInvitation: async () => invitation };
  if (r === "@/lib/server/customer-profile")
    return {
      CustomerProfileError,
      requireCustomerProfile: async () => {
        if (sessionError) throw new CustomerProfileError(sessionError);
        return { user: { id: "QA" } };
      },
    };
  if (r === "@/application/use-cases/getProducts")
    return {
      getProducts: async () => {
        catalogCalls++;
        return products;
      },
    };
  if (r === "@/lib/server/contact-settings")
    return {
      readPublicGreenbelContacts: async () => ({
        available: true,
        whatsappNumber: "12025550100",
      }),
    };
  if (r === "@/lib/pdf/whatsapp-selection-pdf")
    return {
      renderWhatsAppSelectionPdf: (s) => {
        snapshot = s;
        return new TextEncoder().encode("%PDF-controlled");
      },
    };
  if (r === "@/lib/pdf/load-document-visuals")
    return { loadDocumentVisuals: async () => ({ products: new Map() }) };
  if (r === "@/lib/server/public-submission")
    return {
      isAllowedSubmissionOrigin: (req) =>
        req.headers.get("Origin") === "http://localhost:3000",
      readLimitedBody: async (req) => req.text(),
    };
  if (r.startsWith("@/"))
    return original.call(this, process.cwd() + "/src/" + r.slice(2), p, m);
  return original.call(this, r, p, m);
};
const {
  calculateCartTotals,
  calculateCartLineTotal,
} = require("../src/application/use-cases/cartCalculations.ts");
const {
  parseWhatsAppPreferences,
} = require("../src/domain/cart/whatsapp-preferences.ts");
const { POST } = require("../src/app/api/cart/whatsapp/pdf/route.ts");
const preferences = {
  paymentMethod: "transfer",
  deliveryMethod: "home_delivery",
};
const input = () => ({
  lines: [{ productId: product.id, quantity: 2 }],
  preferences,
});
const post = (data) =>
  POST(
    new Request("http://localhost:3000/api/cart/whatsapp/pdf", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }),
  );
beforeEach(() => {
  sessionError = null;
  snapshot = null;
  catalogCalls = 0;
  products = [product];
  invitation = "44444444-4444-4444-8444-444444444444";
});
test("total and line amount are price times quantity, with cent precision", () => {
  assert.equal(calculateCartLineTotal({ product, quantity: 2 }), 166.5);
  assert.equal(calculateCartTotals([{ product, quantity: 2 }]).total, 166.5);
  assert.equal(
    calculateCartTotals([
      { product: { ...product, price: 0.1 }, quantity: 3 },
      { product: { ...product, price: 0.2 }, quantity: 1 },
    ]).total,
    0.5,
  );
});
test("missing or invalid prices and quantities never produce a misleading total", () => {
  for (const line of [
    { product: { ...product, price: null }, quantity: 1 },
    { product: { ...product, price: NaN }, quantity: 1 },
    { product, quantity: 1.5 },
    { product: { ...product, price: Number.MAX_SAFE_INTEGER }, quantity: 999 },
  ])
    assert.equal(calculateCartTotals([line]).total, null);
});
test("only the four approved preference values are accepted; extra fields are rejected", () => {
  assert.deepEqual(parseWhatsAppPreferences(preferences), preferences);
  for (const value of [
    null,
    {},
    { ...preferences, paymentMethod: "online_gateway" },
    { ...preferences, deliveryMethod: "external" },
    { ...preferences, userId: "other" },
  ])
    assert.equal(parseWhatsAppPreferences(value), null);
});
test("anonymous requests cannot generate a PDF or a WhatsApp URL", async () => {
  sessionError = 401;
  const r = await post(input());
  assert.equal(r.status, 401);
  assert.equal(r.headers.get("X-Greenbel-WhatsApp-Url"), null);
  assert.equal(catalogCalls, 0);
  assert.equal(snapshot, null);
});
test("inactive accounts and unavailable session verification fail closed", async () => {
  for (const status of [403, 503]) {
    sessionError = status;
    const r = await post(input());
    assert.equal(r.status, status);
    assert.equal(snapshot, null);
  }
});
test("both preferences are mandatory and validated before product resolution", async () => {
  for (const data of [
    { lines: input().lines },
    { ...input(), preferences: { paymentMethod: "cash" } },
    { ...input(), preferences: { ...preferences, paymentMethod: "other" } },
  ])
    assert.equal((await post(data)).status, 400);
  assert.equal(catalogCalls, 0);
});
test("server uses catalog prices and attaches the selected preferences to PDF and WhatsApp", async () => {
  const data = input();
  data.lines[0].unitPrice = 0;
  const r = await post(data);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Type"), "application/pdf");
  assert.equal(r.headers.get("X-Greenbel-Review-Invitation"), invitation);
  assert.equal(snapshot.subtotalCents, 16650);
  assert.deepEqual(snapshot.preferences, preferences);
  const message = new URL(
    r.headers.get("X-Greenbel-WhatsApp-Url"),
  ).searchParams.get("text");
  assert.match(message, /Forma de pago: Transferencia/);
  assert.match(message, /Método de entrega: Envío a domicilio/);
  assert.ok((await r.text()).startsWith("%PDF"));
});
test("optional review service failure never blocks PDF and WhatsApp", async () => {
  invitation = null;
  const r = await post(input());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("X-Greenbel-Review-Invitation"), null);
  assert.ok(r.headers.get("X-Greenbel-WhatsApp-Url"));
});
test("a product that becomes unavailable blocks the document instead of reusing stale prices", async () => {
  products = [{ ...product, price: null }];
  assert.equal((await post(input())).status, 409);
  assert.equal(snapshot, null);
});

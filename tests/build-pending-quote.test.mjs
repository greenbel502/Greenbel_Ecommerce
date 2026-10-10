import assert from "node:assert/strict";
import test from "node:test";
import { buildPendingDeliveryQuote } from "../src/domain/quotes/build-pending-quote.ts";

const base = {
  reference: "DEV-Q-001",
  issuedAt: "2026-09-29T12:00:00-06:00",
  customerName: "Cliente ficticio DEV",
  customerEmail: null,
  selection: [{ productId: "uno", quantity: 1 }, { productId: "dos", quantity: 1 }],
  catalog: [
    { id: "uno", sku: "DEV-UNO", name: "Equipo ficticio uno", regularPrice: "8000.00", activeOffer: { kind: "fixed_price", value: "7500.00" }, availableQuantity: 2 },
    { id: "dos", sku: "DEV-DOS", name: "Equipo ficticio dos", regularPrice: "8000.00", activeOffer: { kind: "percentage", value: "10.00" }, availableQuantity: 2 }
  ]
};

test("cotización de servidor aplica una oferta por producto e IVA ya incluido", () => {
  const quote = buildPendingDeliveryQuote(base);
  assert.equal(quote.currency, "GTQ");
  assert.equal(quote.lines[0].finalUnitPrice, "7500.00");
  assert.equal(quote.lines[1].finalUnitPrice, "7200.00");
  assert.equal(quote.merchandiseTotal, "14700.00");
  assert.equal(quote.includedVatAmount, null);
  assert.equal(quote.customerTotal, null);
});

test("cotización no acepta precio ausente, productos duplicados ni importe de navegador", () => {
  assert.throws(() => buildPendingDeliveryQuote({ ...base, catalog: [{ ...base.catalog[0], regularPrice: null }, base.catalog[1]] }), /Precio próximamente/);
  assert.throws(() => buildPendingDeliveryQuote({ ...base, selection: [{ productId: "uno", quantity: 1 }, { productId: "uno", quantity: 2 }] }), /repetido/);
  assert.throws(() => buildPendingDeliveryQuote({ ...base, selection: [{ productId: "uno", quantity: 0 }] }), /Cantidad/);
  assert.throws(() => buildPendingDeliveryQuote({ ...base, catalog: [{ ...base.catalog[0], availableQuantity: null }, base.catalog[1]] }), /disponibilidad/i);
});

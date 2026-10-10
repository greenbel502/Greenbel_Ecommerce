import assert from "node:assert/strict";
import test from "node:test";
import { calculateOfferPrice } from "../src/domain/pricing/offer.ts";

test("precio final exacto y descuento porcentual aprobados", () => {
  assert.deepEqual(calculateOfferPrice("8000.00", { kind: "fixed_price", value: "7500.00" }), {
    regular: "8000.00", final: "7500.00", discount: "500.00"
  });
  assert.deepEqual(calculateOfferPrice("8000.00", { kind: "percentage", value: "10.00" }), {
    regular: "8000.00", final: "7200.00", discount: "800.00"
  });
});

test("redondea a centavos y rechaza ofertas que no reducen precio", () => {
  assert.equal(calculateOfferPrice("9.99", { kind: "percentage", value: "12.50" }).final, "8.74");
  assert.throws(() => calculateOfferPrice("0.01", { kind: "percentage", value: "0.01" }));
  assert.throws(() => calculateOfferPrice("100.00", { kind: "fixed_price", value: "100.00" }));
  assert.throws(() => calculateOfferPrice("100.00", { kind: "percentage", value: "100.00" }));
  assert.throws(() => calculateOfferPrice("100.00", { kind: "percentage", value: "10.001" }));
});

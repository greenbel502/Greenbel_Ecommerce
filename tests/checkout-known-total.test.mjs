import assert from "node:assert/strict";
import test from "node:test";
import { assertAcceptedCheckoutReview, calculateKnownCheckoutTotal } from "../src/domain/checkout/known-total.ts";

test("retiro gratuito conserva precio GTQ con IVA ya incluido", () => {
  const total = calculateKnownCheckoutTotal("100.00", { kind: "pickup" });
  assert.deepEqual(total, {
    currency: "GTQ",
    merchandiseTotal: "100.00",
    shippingFee: "0.00",
    shippingChargeMode: "pickup",
    amountDueGreenbel: "100.00",
    amountDueCarrierShipping: "0.00",
    customerTotal: "100.00",
    includedIvaAmount: null
  });
});

test("transporte pagado a transportadora suma al total del cliente sin deuda a GreenBel", () => {
  const total = calculateKnownCheckoutTotal("100.00", { kind: "external", shippingFee: "15.50", collector: "carrier" });
  assert.equal(total.amountDueGreenbel, "100.00");
  assert.equal(total.amountDueCarrierShipping, "15.50");
  assert.equal(total.customerTotal, "115.50");
  assert.equal(total.shippingChargeMode, "carrier_collects");
});

test("mensajería propia cobra transporte GreenBel aunque sea al entregar", () => {
  const total = calculateKnownCheckoutTotal("100.00", { kind: "own_delivery", shippingFee: "15.50", collector: "greenbel" });
  assert.equal(total.amountDueGreenbel, "115.50");
  assert.equal(total.amountDueCarrierShipping, "0.00");
  assert.equal(total.customerTotal, "115.50");
});

test("costo pendiente y total excedido no generan un total aceptable", () => {
  assert.throws(() => calculateKnownCheckoutTotal("100.00", { kind: "external", shippingFee: null, collector: "carrier" }), /conocido/);
  assert.throws(() => calculateKnownCheckoutTotal("999999999999.99", { kind: "external", shippingFee: "0.01", collector: "greenbel" }), /rango/);
});

test("aceptación necesita revisión y total calculados actualmente", () => {
  const current = calculateKnownCheckoutTotal("100.00", { kind: "pickup" });
  assert.doesNotThrow(() => assertAcceptedCheckoutReview(current, 2, "100.00", 2));
  assert.throws(() => assertAcceptedCheckoutReview(current, 2, "99.00", 2), /revisa y acepta/);
  assert.throws(() => assertAcceptedCheckoutReview(current, 2, "100.00", 1), /revisa y acepta/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { checkoutConfirmationIntentSchema, checkoutReviewRequestSchema } from "../src/domain/checkout/review-request.ts";

const firstProduct = "11111111-1111-4111-8111-111111111111";
const pickupService = "22222222-2222-4222-8222-222222222222";
const paymentOption = "33333333-3333-4333-8333-333333333333";
const zone = "44444444-4444-4444-8444-444444444444";
const key = "55555555-5555-4555-8555-555555555555";
const reviewId = "66666666-6666-4666-8666-666666666666";
const review = {
  lines: [{ productId: firstProduct, quantity: 2 }],
  billing: { kind: "cf", firstName: "Ana", lastName: "DEV", phone: "5555 5555" },
  delivery: { kind: "pickup", serviceId: pickupService },
  paymentOptionId: paymentOption
};

test("solicitud de revisión admite selección y facturación aprobadas", () => {
  assert.equal(checkoutReviewRequestSchema.safeParse(review).success, true);
  assert.equal(checkoutReviewRequestSchema.safeParse({ ...review,
    delivery: { kind: "shipping", serviceId: pickupService, zoneId: zone, chargeMode: "at_destination",
      recipientName: "Ana Prueba", recipientPhone: "5555 5555", addressLine: "Dirección ficticia PRUEBA DEV" }
  }).success, true);
});

test("no acepta importe, identidad ni estado suministrados como cálculo del navegador", () => {
  for (const field of ["customerId", "shippingFee", "total", "paymentStatus"]) {
    assert.equal(checkoutReviewRequestSchema.safeParse({ ...review, [field]: "falseado" }).success, false);
  }
  assert.equal(checkoutReviewRequestSchema.safeParse({ ...review,
    lines: [review.lines[0], review.lines[0]]
  }).success, false);
  assert.equal(checkoutReviewRequestSchema.safeParse({ ...review,
    delivery: { kind: "pickup", serviceId: pickupService, zoneId: zone }
  }).success, false);
  assert.equal(checkoutReviewRequestSchema.safeParse({ ...review,
    delivery: { kind: "shipping", serviceId: pickupService, zoneId: zone, chargeMode: "at_destination",
      recipientName: "Ana", recipientPhone: "5555 5555", addressLine: "" }
  }).success, false);
});

test("intención futura exige total, revisión y clave de idempotencia; no confirma pedido", () => {
  const input = { reviewId, review, acceptedTotal: "100.00", acceptedRevision: 2, idempotencyKey: key };
  assert.equal(checkoutConfirmationIntentSchema.safeParse(input).success, true);
  assert.equal(checkoutConfirmationIntentSchema.safeParse({ ...input, reviewId: undefined }).success, false);
  assert.equal(checkoutConfirmationIntentSchema.safeParse({ ...input, acceptedTotal: "100" }).success, false);
  assert.equal(checkoutConfirmationIntentSchema.safeParse({ ...input, acceptedRevision: 0 }).success, false);
});

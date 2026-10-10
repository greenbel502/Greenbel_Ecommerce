import { z } from "zod";
import { billingSchema } from "./billing.ts";

const lineSchema = z.strictObject({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(999)
});

const deliverySelectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("pickup"), serviceId: z.uuid() }),
  z.strictObject({
    kind: z.literal("shipping"),
    serviceId: z.uuid(),
    zoneId: z.uuid(),
    // A configured customer_choice must resolve to one of these before review.
    chargeMode: z.enum(["with_order", "at_destination"]),
    recipientName: z.string().trim().min(1).max(240),
    recipientPhone: z.string().trim().min(1).max(40).refine((value) => {
      if (!/^[+0-9 ()-]+$/.test(value)) return false;
      const digits = value.replace(/\D/g, "");
      return digits.length >= 8 && digits.length <= 15;
    }, "Ingresa un teléfono válido para la entrega."),
    addressLine: z.string().trim().min(5).max(500)
  })
]);

/** Browser intent only. Prices, stock, fees, roles and payment states come from the server. */
export const checkoutReviewRequestSchema = z.strictObject({
  lines: z.array(lineSchema).min(1).max(50)
    .refine((lines) => new Set(lines.map((line) => line.productId)).size === lines.length,
      "No repitas un producto en la selección."),
  billing: billingSchema,
  delivery: deliverySelectionSchema,
  paymentOptionId: z.uuid()
});

export type CheckoutReviewRequest = z.infer<typeof checkoutReviewRequestSchema>;

/** Future confirmation input. This schema does not confirm or reserve anything. */
export const checkoutConfirmationIntentSchema = z.strictObject({
  // Identifies the persisted server review whose revision/terms were displayed.
  reviewId: z.uuid(),
  review: checkoutReviewRequestSchema,
  acceptedTotal: z.string().regex(/^(0|[1-9]\d{0,11})\.\d{2}$/),
  acceptedRevision: z.number().int().positive().safe(),
  idempotencyKey: z.uuid()
});

export type CheckoutConfirmationIntent = z.infer<typeof checkoutConfirmationIntentSchema>;

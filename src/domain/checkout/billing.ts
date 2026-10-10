import { z } from "zod";

const name = z.string().trim().min(1).max(160);
const fullName = z.string().trim().min(1).max(240);
const phone = z.string().trim().min(1).max(40).refine((value) => {
  if (!/^[+0-9 ()-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}, "Ingresa un número de teléfono válido.");
const optionalEmail = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized === "" ? undefined : normalized;
  },
  z.email().max(254).optional()
);

/** Billing fields confirmed by GreenBel; invoice issuance stays in its internal process. */
export const billingSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("cf"),
    firstName: name,
    lastName: name,
    phone
  }),
  z.strictObject({
    kind: z.literal("nit"),
    nit: z.string().trim().min(1).max(40),
    nitOwnerName: name,
    fullName,
    phone,
    email: optionalEmail
  })
]);

export type BillingDetails = z.infer<typeof billingSchema>;

/** Versioned shape required by orders_billing_snapshot_check in migration 002. */
export type BillingSnapshot =
  | Readonly<{ schema_version: 1; type: "cf"; first_name: string; last_name: string; phone: string }>
  | Readonly<{ schema_version: 1; type: "nit"; nit: string; nit_holder_name: string; full_name: string; phone: string; email?: string }>;

/** This only validates customer input; GreenBel validates/issues invoices separately. */
export function buildBillingSnapshot(value: unknown): BillingSnapshot {
  const billing = billingSchema.parse(value);
  if (billing.kind === "cf") {
    return {
      schema_version: 1,
      type: "cf",
      first_name: billing.firstName,
      last_name: billing.lastName,
      phone: billing.phone
    };
  }
  return {
    schema_version: 1,
    type: "nit",
    nit: billing.nit,
    nit_holder_name: billing.nitOwnerName,
    full_name: billing.fullName,
    phone: billing.phone,
    ...(billing.email ? { email: billing.email } : {})
  };
}

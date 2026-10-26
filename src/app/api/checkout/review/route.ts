import {
  ONLINE_CHECKOUT_ENABLED,
  CHECKOUT_PAUSED_MESSAGE,
} from "@/lib/commerce/policy";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkoutReviewRequestSchema } from "@/domain/checkout/review-request";
import {
  checkoutDatabaseError,
  checkoutJson,
  checkoutRequestBody,
  checkoutSession,
} from "@/lib/server/checkout-api";

export const dynamic = "force-dynamic";

const schema = z.strictObject({
  intent: checkoutReviewRequestSchema,
  reviewKey: z.uuid(),
  reviewId: z.uuid().nullable().optional(),
});
const money = z.string().regex(/^(0|[1-9]\d{0,11})\.\d{2}$/);
const reviewResponse = z
  .object({
    reviewId: z.uuid(),
    revision: z.number().int().positive(),
    stage: z.enum(["draft", "pending_shipping"]),
    currency: z.literal("GTQ"),
    subtotal: money,
    discountTotal: money,
    merchandiseTotal: money,
    shippingFee: money.nullable(),
    amountDueGreenbel: money.nullable(),
    amountDueCarrierShipping: money.nullable(),
    total: money.nullable(),
    shippingChargeMode: z
      .enum(["pickup", "included", "carrier_collects"])
      .nullable(),
    lines: z.array(
      z.object({
        productId: z.uuid(),
        sku: z.string(),
        name: z.string(),
        quantity: z.number().int().positive(),
        regularUnitPrice: money,
        discountUnit: money,
        finalUnitPrice: money,
        lineTotal: money,
      }),
    ),
  })
  .refine((value) => value.stage !== "draft" || value.total !== null);

export async function POST(request: Request) {
  if (!ONLINE_CHECKOUT_ENABLED)
    return checkoutJson({ error: CHECKOUT_PAUSED_MESSAGE }, 410);
  const body = await checkoutRequestBody(request);
  if (body instanceof NextResponse) return body;
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return checkoutJson(
      { error: "Revisa los datos de facturación, entrega y selección." },
      400,
    );
  const session = await checkoutSession();
  if ("response" in session) return session.response;

  try {
    const { data, error } = await session.client.rpc("review_checkout", {
      p_intent: parsed.data.intent,
      p_review_key: parsed.data.reviewKey,
      p_review_id: parsed.data.reviewId ?? null,
    });
    if (error) return checkoutDatabaseError(error.code);
    const review = reviewResponse.safeParse(data);
    if (!review.success)
      return checkoutJson(
        { error: "La revisión aún no está disponible. No se creó una compra." },
        503,
      );
    return checkoutJson({ review: review.data }, 200);
  } catch {
    return checkoutJson(
      { error: "No pudimos obtener el total. Reintenta esta revisión." },
      503,
    );
  }
}

/** Lets a customer resume an own pending shipping review after accepting a manual fee. */
export async function GET(request: Request) {
  if (!ONLINE_CHECKOUT_ENABLED)
    return checkoutJson({ error: CHECKOUT_PAUSED_MESSAGE }, 410);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.uuid().safeParse(id).success)
    return checkoutJson({ error: "Revisión inválida." }, 400);
  const session = await checkoutSession();
  if ("response" in session) return session.response;
  try {
    const { data, error } = await session.client
      .from("orders")
      .select("id,stage,checkout_intent")
      .eq("id", id)
      .eq("customer_id", session.userId)
      .maybeSingle();
    if (error)
      return checkoutJson({ error: "No pudimos recuperar la revisión." }, 503);
    if (!data) return checkoutJson({ error: "Revisión no encontrada." }, 404);
    if (data.stage !== "draft" && data.stage !== "pending_shipping") {
      return checkoutJson(
        { error: "Este pedido ya no admite una nueva revisión." },
        409,
      );
    }
    const intent = checkoutReviewRequestSchema.safeParse(data.checkout_intent);
    if (!intent.success)
      return checkoutJson(
        { error: "La revisión guardada no se puede continuar." },
        503,
      );
    return checkoutJson({ reviewId: data.id, intent: intent.data }, 200);
  } catch {
    return checkoutJson({ error: "No pudimos recuperar la revisión." }, 503);
  }
}

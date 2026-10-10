import { NextResponse } from "next/server";
import { z } from "zod";
import { checkoutConfirmationIntentSchema } from "@/domain/checkout/review-request";
import { checkoutDatabaseError, checkoutJson, checkoutRequestBody, checkoutSession } from "@/lib/server/checkout-api";

export const dynamic = "force-dynamic";

const money = z.string().regex(/^(0|[1-9]\d{0,11})\.\d{2}$/);
const confirmedResponse = z.object({
  orderId: z.uuid(), reference: z.string().min(1).max(100),
  stage: z.enum(["confirmed", "completed", "cancelled"]),
  total: money, reservationId: z.uuid(), revision: z.number().int().positive(),
  alreadyConfirmed: z.boolean(), paymentStatus: z.enum(["pending", "test_succeeded"])
});

export async function POST(request: Request) {
  const body = await checkoutRequestBody(request);
  if (body instanceof NextResponse) return body;
  const parsed = checkoutConfirmationIntentSchema.safeParse(body);
  if (!parsed.success) return checkoutJson({ error: "Revisa el total y vuelve a confirmar." }, 400);
  const session = await checkoutSession();
  if ("response" in session) return session.response;

  try {
    const { data, error } = await session.client.rpc("confirm_checkout", {
      p_review_id: parsed.data.reviewId,
      p_intent: parsed.data.review,
      p_accepted_revision: parsed.data.acceptedRevision,
      p_accepted_total: parsed.data.acceptedTotal,
      p_idempotency_key: parsed.data.idempotencyKey
    });
    if (error) return checkoutDatabaseError(error.code);
    const confirmed = confirmedResponse.safeParse(data);
    if (!confirmed.success) {
      // A malformed response is uncertain; the server may have committed. Never retry with a new key here.
      return checkoutJson({ error: "No pudimos verificar la respuesta. Consulta Mis pedidos antes de intentar otra compra." }, 503);
    }
    return checkoutJson({ order: confirmed.data }, 200);
  } catch {
    return checkoutJson({ error: "La respuesta es incierta. Reintenta con la misma clave o consulta Mis pedidos." }, 503);
  }
}

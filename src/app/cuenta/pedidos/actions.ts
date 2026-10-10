"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseActionClient } from "@/lib/supabase/server";

const actionSchema = z.object({
  orderId: z.uuid(),
  idempotencyKey: z.uuid(),
  reason: z.string().trim().min(1).max(2000)
});

type ActionKind = "draft" | "confirmed" | "request";
type Outcome = "success" | "unauthenticated" | "not_found" | "invalid_stage" | "error";

async function submitCancellation(kind: ActionKind, formData: FormData): Promise<void> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || !z.uuid().safeParse(orderId).success) {
    redirect("/cuenta/pedidos?error=accion");
  }
  const parsed = actionSchema.safeParse({
    orderId,
    idempotencyKey: formData.get("idempotencyKey"),
    reason: formData.get("reason")
  });
  if (!parsed.success) redirect(`/cuenta/pedidos/${orderId}?error=datos`);

  let outcome: Outcome = "error";
  try {
    const client = await createSupabaseActionClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError && authError.name !== "AuthSessionMissingError") {
      outcome = "error";
    } else if (!auth.user) {
      outcome = "unauthenticated";
    } else {
      // RLS and the explicit owner filter both apply. The RPC rechecks stage,
      // ownership, payment, preparation and reservations inside its transaction.
      const { data: order, error: orderError } = await client.from("orders")
        .select("id,stage").eq("id", orderId).eq("customer_id", auth.user.id).maybeSingle();
      if (orderError) {
        outcome = "error";
      } else if (!order) {
        outcome = "not_found";
      } else if (kind === "draft" && !["draft", "pending_shipping"].includes(order.stage)
        || kind === "confirmed" && order.stage !== "confirmed"
        || kind === "request" && !["confirmed", "completed"].includes(order.stage)) {
        outcome = "invalid_stage";
      } else {
        const args = {
          p_order_id: orderId,
          p_reason: parsed.data.reason,
          p_idempotency_key: parsed.data.idempotencyKey
        };
        const result = kind === "draft"
          ? await client.rpc("cancel_unprepared_draft_order", args)
          : kind === "confirmed"
            ? await client.rpc("cancel_unprepared_confirmed_order", args)
            : await client.rpc("request_order_cancellation", args);
        outcome = !result.error && typeof result.data === "string" ? "success" : "error";
      }
    }
  } catch {
    outcome = "error";
  }

  if (outcome === "unauthenticated") redirect("/cuenta/ingresar");
  if (outcome === "not_found") redirect("/cuenta/pedidos?error=accion");
  if (outcome !== "success") redirect(`/cuenta/pedidos/${orderId}?error=accion`);

  revalidatePath("/cuenta/pedidos");
  revalidatePath(`/cuenta/pedidos/${orderId}`);
  // The destination reads persisted state; no query string claims a payment,
  // refund, delivery or even a cancellation before the database confirms it.
  redirect(`/cuenta/pedidos/${orderId}`);
}

export async function cancelDraftOrder(formData: FormData): Promise<void> {
  await submitCancellation("draft", formData);
}

export async function cancelConfirmedOrder(formData: FormData): Promise<void> {
  await submitCancellation("confirmed", formData);
}

export async function requestCancellation(formData: FormData): Promise<void> {
  await submitCancellation("request", formData);
}

/** Accept only the carrier's offered transport fee. Checkout recalculates next. */
export async function acceptShippingProposal(formData: FormData): Promise<void> {
  const orderId = formData.get("orderId");
  const proposalId = formData.get("proposalId");
  if (typeof orderId !== "string" || !z.uuid().safeParse(orderId).success
    || typeof proposalId !== "string" || !z.uuid().safeParse(proposalId).success) {
    redirect("/cuenta/pedidos?error=accion");
  }
  let outcome: Outcome = "error";
  try {
    const client = await createSupabaseActionClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError && authError.name !== "AuthSessionMissingError") outcome = "error";
    else if (!auth.user) outcome = "unauthenticated";
    else {
      const [order, proposal] = await Promise.all([
        client.from("orders").select("id,stage")
          .eq("id", orderId).eq("customer_id", auth.user.id).maybeSingle(),
        client.from("shipping_proposals").select("id,order_id,status")
          .eq("id", proposalId).eq("order_id", orderId).maybeSingle()
      ]);
      if (order.error || proposal.error) outcome = "error";
      else if (!order.data || !proposal.data) outcome = "not_found";
      else if (order.data.stage !== "pending_shipping"
        || !["offered", "accepted"].includes(proposal.data.status)) outcome = "invalid_stage";
      else {
        const { data, error } = await client.rpc("accept_shipping_proposal", { p_proposal_id: proposalId });
        outcome = !error && data === proposalId ? "success" : "error";
      }
    }
  } catch { outcome = "error"; }
  if (outcome === "unauthenticated") redirect("/cuenta/ingresar");
  if (outcome !== "success") redirect(`/cuenta/pedidos/${orderId}?error=propuesta`);
  revalidatePath(`/cuenta/pedidos/${orderId}`);
  // An accepted delivery fee is not the final total. The checkout screen
  // fetches the saved intent, recalculates price/stock and asks for review.
  redirect(`/checkout?reviewId=${orderId}`);
}

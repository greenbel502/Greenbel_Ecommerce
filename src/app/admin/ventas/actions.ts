"use server";

import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseActionClient } from "@/lib/supabase/server";

const quantityPattern = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function registerManualCase(formData: FormData): Promise<void> {
  const orderId = formText(formData, "orderId");
  if (!z.uuid().safeParse(orderId).success) notFound();

  try {
    await requireStaffActor(["operator", "admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    redirect(`/admin/ventas/${orderId}?caseResult=unavailable#manual-case`);
  }

  const kind = formText(formData, "kind");
  const reason = formText(formData, "reason");
  const idempotencyKey = formText(formData, "idempotencyKey");
  const ids = formData.getAll("itemId").filter((value): value is string => typeof value === "string");
  const uniqueIds = new Set(ids);
  const items = ids.map((id) => ({ order_item_id: id, quantity: formText(formData, `quantity:${id}`) }));
  const valid = (kind === "return" || kind === "warranty")
    && reason.length >= 1 && reason.length <= 2000
    && z.uuid().safeParse(idempotencyKey).success
    && ids.length >= 1 && ids.length <= 100 && uniqueIds.size === ids.length
    && items.every((item) => z.uuid().safeParse(item.order_item_id).success
      && quantityPattern.test(item.quantity) && Number(item.quantity) > 0);
  if (!valid) redirect(`/admin/ventas/${orderId}?caseResult=invalid#manual-case`);

  try {
    const client = await createSupabaseActionClient();
    const { error } = await client.rpc("register_manual_service_case", {
      p_order_id: orderId,
      p_kind: kind,
      p_reason: reason,
      p_items: items,
      p_idempotency_key: idempotencyKey
    });
    if (error) throw error;
  } catch {
    // Keep the operation key when transport failure leaves the commit uncertain.
    redirect(`/admin/ventas/${orderId}?caseResult=failed&retryKey=${idempotencyKey}#manual-case`);
  }
  redirect(`/admin/ventas/${orderId}?caseResult=registered#cases-heading`);
}

export async function registerRefundRequest(formData: FormData): Promise<void> {
  const orderId = formText(formData, "orderId");
  const caseId = formText(formData, "caseId");
  if (!z.uuid().safeParse(orderId).success || !z.uuid().safeParse(caseId).success) notFound();

  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    redirect(`/admin/ventas/${orderId}?refundResult=unavailable#cases-heading`);
  }

  const reason = formText(formData, "reason");
  const idempotencyKey = formText(formData, "idempotencyKey");
  if (reason.length < 1 || reason.length > 2000 || !z.uuid().safeParse(idempotencyKey).success) {
    redirect(`/admin/ventas/${orderId}?refundResult=invalid#cases-heading`);
  }

  try {
    const client = await createSupabaseActionClient();
    const { data: entry, error: readError } = await client.from("service_cases")
      .select("order_id").eq("id", caseId).maybeSingle();
    if (readError || entry?.order_id !== orderId) throw new Error("Case mismatch or unavailable");
    const { error } = await client.rpc("register_refund_request", {
      p_case_id: caseId,
      p_reason: reason,
      p_idempotency_key: idempotencyKey
    });
    if (error) throw error;
  } catch {
    redirect(`/admin/ventas/${orderId}?refundResult=failed&refundCaseId=${caseId}&refundRetryKey=${idempotencyKey}#cases-heading`);
  }
  redirect(`/admin/ventas/${orderId}?refundResult=registered#cases-heading`);
}

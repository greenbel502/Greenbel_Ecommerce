"use server";

import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import {
  AdminOperationResult,
  runAdminOperation,
  type AdminFormResult,
} from "@/lib/server/admin-operation-result";
import { z } from "zod";
import {
  StaffAuthorizationError,
  requireStaffActor,
} from "@/lib/server/staff-authorization";
import { createSupabaseActionClient } from "@/lib/supabase/server";

const quantityPattern = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function perform_registerManualCase(formData: FormData): Promise<void> {
  const orderId = formText(formData, "orderId");
  if (!z.uuid().safeParse(orderId).success) notFound();

  try {
    await requireStaffActor(["operator", "admin"]);
  } catch (error) {
    if (
      error instanceof StaffAuthorizationError &&
      error.reason === "unauthenticated"
    )
      redirect("/cuenta/ingresar");
    if (
      error instanceof StaffAuthorizationError &&
      error.reason === "forbidden"
    )
      notFound();
    finish(orderId, "unavailable");
  }

  const kind = formText(formData, "kind");
  const reason = formText(formData, "reason");
  const idempotencyKey = formText(formData, "idempotencyKey");
  const ids = formData
    .getAll("itemId")
    .filter((value): value is string => typeof value === "string");
  const uniqueIds = new Set(ids);
  const items = ids.map((id) => ({
    order_item_id: id,
    quantity: formText(formData, `quantity:${id}`),
  }));
  const valid =
    (kind === "return" || kind === "warranty") &&
    reason.length >= 1 &&
    reason.length <= 2000 &&
    z.uuid().safeParse(idempotencyKey).success &&
    ids.length >= 1 &&
    ids.length <= 100 &&
    uniqueIds.size === ids.length &&
    items.every(
      (item) =>
        z.uuid().safeParse(item.order_item_id).success &&
        quantityPattern.test(item.quantity) &&
        Number(item.quantity) > 0,
    );
  if (!valid) finish(orderId, "invalid");

  try {
    const client = await createSupabaseActionClient();
    const { error } = await client.rpc("register_manual_service_case", {
      p_order_id: orderId,
      p_kind: kind,
      p_reason: reason,
      p_items: items,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
  } catch {
    // Keep the operation key when transport failure leaves the commit uncertain.
    finish(orderId, "failed");
  }
  finish(orderId, "registered");
}

async function perform_registerRefundRequest(
  formData: FormData,
): Promise<void> {
  const orderId = formText(formData, "orderId");
  const caseId = formText(formData, "caseId");
  if (
    !z.uuid().safeParse(orderId).success ||
    !z.uuid().safeParse(caseId).success
  )
    notFound();

  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (
      error instanceof StaffAuthorizationError &&
      error.reason === "unauthenticated"
    )
      redirect("/cuenta/ingresar");
    if (
      error instanceof StaffAuthorizationError &&
      error.reason === "forbidden"
    )
      notFound();
    finish(orderId, "unavailable");
  }

  const reason = formText(formData, "reason");
  const idempotencyKey = formText(formData, "idempotencyKey");
  if (
    reason.length < 1 ||
    reason.length > 2000 ||
    !z.uuid().safeParse(idempotencyKey).success
  ) {
    finish(orderId, "invalid");
  }

  try {
    const client = await createSupabaseActionClient();
    const { data: entry, error: readError } = await client
      .from("service_cases")
      .select("order_id")
      .eq("id", caseId)
      .maybeSingle();
    if (readError || entry?.order_id !== orderId)
      throw new Error("Case mismatch or unavailable");
    const { error } = await client.rpc("register_refund_request", {
      p_case_id: caseId,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
  } catch {
    finish(orderId, "failed");
  }
  finish(orderId, "registered");
}

function finish(orderId: string, code: string): never {
  revalidatePath(`/admin/ventas/${orderId}`);
  throw new AdminOperationResult(code);
}

const messages: Record<string, string> = {
  invalid: "Revisa los campos obligatorios, cantidades y referencias.",
  failed:
    "No se pudo guardar la operación. Se conserva la información y la referencia de reintento.",
  unavailable: "No se pudo verificar el acceso. Inténtalo de nuevo.",
  registered:
    "Solicitud registrada. No autoriza un reembolso ni reincorpora existencias.",
  shipment_saved: "Avance de entrega registrado correctamente.",
  payment_saved: "Resultado de pago de prueba registrado.",
  proposal_saved: "Costo de transporte ofrecido al cliente.",
  proposal_withdrawn: "Propuesta retirada.",
  statement_saved: "Reporte de recaudación registrado.",
  receipt_saved: "Depósito de prueba registrado.",
};
export async function registerManualCase(
  data: FormData,
): Promise<AdminFormResult> {
  return runAdminOperation(() => perform_registerManualCase(data), messages);
}
export async function registerRefundRequest(
  data: FormData,
): Promise<AdminFormResult> {
  return runAdminOperation(() => perform_registerRefundRequest(data), messages);
}

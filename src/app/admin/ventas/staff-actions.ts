"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseActionClient } from "@/lib/supabase/server";

const uuid = z.uuid();
const text = z.string().trim().min(1).max(200);
const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/);

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function staff(orderId: string): Promise<void> {
  try {
    await requireStaffActor(["operator", "admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    redirect(`/admin/ventas/${orderId}?staffResult=unavailable#staff-operations`);
  }
}

function finish(orderId: string, code: string, key?: string, action?: string): never {
  revalidatePath(`/admin/ventas/${orderId}`);
  const retry = code === "failed" && key && action
    ? `&staffRetryKey=${key}&staffAction=${action}` : "";
  redirect(`/admin/ventas/${orderId}?staffResult=${code}${retry}#staff-operations`);
}

function common(data: FormData) {
  const orderId = field(data, "orderId");
  if (!uuid.safeParse(orderId).success) notFound();
  return { orderId, key: field(data, "idempotencyKey") };
}

export async function recordShipmentEvent(formData: FormData): Promise<void> {
  const { orderId, key } = common(formData);
  await staff(orderId);
  const parsed = z.object({
    key: uuid,
    event: z.enum(["prepare", "ready_for_pickup", "dispatch", "deliver", "returned"]),
    trackingNumber: z.string().trim().max(160),
    trackingUrl: z.union([z.literal(""), z.url().startsWith("https://").max(2000)]),
    evidence: text
  }).safeParse({
    key, event: field(formData, "event"),
    trackingNumber: field(formData, "trackingNumber"),
    trackingUrl: field(formData, "trackingUrl"),
    evidence: field(formData, "evidence")
  });
  if (!parsed.success) finish(orderId, "invalid");
  try {
    const client = await createSupabaseActionClient();
    const { error } = await client.rpc("record_staff_shipment_event", {
      p_order_id: orderId,
      p_event: parsed.data.event,
      p_tracking_number: parsed.data.trackingNumber || null,
      p_tracking_url: parsed.data.trackingUrl || null,
      p_evidence_reference: parsed.data.evidence,
      p_idempotency_key: parsed.data.key
    });
    if (error) throw error;
  } catch { finish(orderId, "failed", parsed.data.key, `shipment_${parsed.data.event}`); }
  finish(orderId, "shipment_saved");
}

export async function recordStaffTestPayment(formData: FormData): Promise<void> {
  const { orderId, key } = common(formData);
  await staff(orderId);
  const parsed = z.object({
    key: uuid,
    method: z.enum(["cash", "terminal", "carrier_cod"]),
    outcome: z.enum(["succeeded", "failed"]),
    evidence: text
  }).safeParse({ key, method: field(formData, "method"),
    outcome: field(formData, "outcome"), evidence: field(formData, "evidence") });
  if (!parsed.success) finish(orderId, "invalid");
  try {
    const client = await createSupabaseActionClient();
    const { error } = await client.rpc("record_staff_test_payment", {
      p_order_id: orderId, p_method: parsed.data.method,
      p_outcome: parsed.data.outcome, p_evidence_reference: parsed.data.evidence,
      p_idempotency_key: parsed.data.key
    });
    if (error) throw error;
  } catch { finish(orderId, "failed", parsed.data.key, "payment"); }
  finish(orderId, "payment_saved");
}

export async function offerShippingProposal(formData: FormData): Promise<void> {
  const { orderId, key } = common(formData);
  await staff(orderId);
  const parsed = z.object({ key: uuid, fee: money,
    chargeMode: z.enum(["with_order", "at_destination"]),
    terms: z.string().trim().min(1).max(5000) }).safeParse({
      key, fee: field(formData, "fee"), chargeMode: field(formData, "chargeMode"),
      terms: field(formData, "terms")
    });
  if (!parsed.success) finish(orderId, "invalid");
  try {
    const client = await createSupabaseActionClient();
    const { error } = await client.rpc("offer_staff_shipping_proposal", {
      p_order_id: orderId, p_fee: parsed.data.fee,
      p_charge_mode: parsed.data.chargeMode, p_terms: parsed.data.terms,
      p_idempotency_key: parsed.data.key
    });
    if (error) throw error;
  } catch { finish(orderId, "failed", parsed.data.key, "offer"); }
  finish(orderId, "proposal_saved");
}

export async function withdrawShippingProposal(formData: FormData): Promise<void> {
  const { orderId, key } = common(formData);
  await staff(orderId);
  const parsed = z.object({ key: uuid, proposalId: uuid,
    reason: z.string().trim().min(1).max(2000) }).safeParse({
      key, proposalId: field(formData, "proposalId"), reason: field(formData, "reason")
    });
  if (!parsed.success) finish(orderId, "invalid");
  try {
    const client = await createSupabaseActionClient();
    const { data: proposal, error: readError } = await client.from("shipping_proposals")
      .select("order_id").eq("id", parsed.data.proposalId).maybeSingle();
    if (readError || proposal?.order_id !== orderId) throw new Error("Proposal mismatch");
    const { error } = await client.rpc("withdraw_staff_shipping_proposal", {
      p_proposal_id: parsed.data.proposalId,
      p_reason: parsed.data.reason,
      p_idempotency_key: parsed.data.key
    });
    if (error) throw error;
  } catch { finish(orderId, "failed", parsed.data.key, "withdraw"); }
  finish(orderId, "proposal_withdrawn");
}

export async function recordCarrierStatement(formData: FormData): Promise<void> {
  const { orderId, key } = common(formData);
  await staff(orderId);
  const parsed = z.object({
    key: uuid, shipmentId: uuid, gross: money, commission: money,
    shippingDeducted: money, otherDeductions: money,
    commissionNotes: z.string().trim().max(500),
    deductionNotes: z.string().trim().max(500),
    varianceNotes: z.string().trim().max(500)
  }).safeParse({
    key, shipmentId: field(formData, "shipmentId"), gross: field(formData, "gross"),
    commission: field(formData, "commission"), shippingDeducted: field(formData, "shippingDeducted"),
    otherDeductions: field(formData, "otherDeductions"),
    commissionNotes: field(formData, "commissionNotes"),
    deductionNotes: field(formData, "deductionNotes"),
    varianceNotes: field(formData, "varianceNotes")
  });
  if (!parsed.success) finish(orderId, "invalid");
  try {
    const client = await createSupabaseActionClient();
    const { data: shipment, error: readError } = await client.from("shipments")
      .select("order_id").eq("id", parsed.data.shipmentId).maybeSingle();
    if (readError || shipment?.order_id !== orderId) throw new Error("Shipment mismatch");
    const { error } = await client.rpc("record_staff_carrier_statement", {
      p_shipment_id: parsed.data.shipmentId,
      p_gross_collected: parsed.data.gross,
      p_commission: parsed.data.commission,
      p_shipping_deducted: parsed.data.shippingDeducted,
      p_other_deductions: parsed.data.otherDeductions,
      p_commission_notes: parsed.data.commissionNotes || null,
      p_deduction_notes: parsed.data.deductionNotes || null,
      p_variance_notes: parsed.data.varianceNotes || null,
      p_idempotency_key: parsed.data.key
    });
    if (error) throw error;
  } catch { finish(orderId, "failed", parsed.data.key, "statement"); }
  finish(orderId, "statement_saved");
}

export async function recordCarrierReceipt(formData: FormData): Promise<void> {
  const { orderId, key } = common(formData);
  await staff(orderId);
  const parsed = z.object({ key: uuid, statementId: uuid,
    amount: money, bankReference: text }).safeParse({
      key, statementId: field(formData, "statementId"), amount: field(formData, "amount"),
      bankReference: field(formData, "bankReference")
    });
  if (!parsed.success || Number(parsed.data.amount) <= 0) finish(orderId, "invalid");
  try {
    const client = await createSupabaseActionClient();
    const { error } = await client.rpc("record_staff_carrier_receipt", {
      p_statement_id: parsed.data.statementId, p_amount: parsed.data.amount,
      p_bank_reference: parsed.data.bankReference, p_idempotency_key: parsed.data.key
    });
    if (error) throw error;
  } catch { finish(orderId, "failed", parsed.data.key, "receipt"); }
  finish(orderId, "receipt_saved");
}

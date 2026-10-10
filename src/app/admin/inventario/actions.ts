"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseActionClient } from "@/lib/supabase/server";

export type InventoryActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}>;

const changeSchema = z.object({
  productId: z.uuid(),
  kind: z.enum(["stock_entry", "adjustment", "physical_sale"]),
  quantityDelta: z.string().regex(/^-?\d{1,11}(?:\.\d{1,3})?$/).refine((value) => Number(value) !== 0),
  reason: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(200),
  idempotencyKey: z.uuid()
}).refine((value) =>
  (value.kind === "stock_entry" && Number(value.quantityDelta) > 0)
  || (value.kind === "physical_sale" && Number(value.quantityDelta) < 0)
  || value.kind === "adjustment"
);

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function recordInventoryChangeAction(
  previous: InventoryActionState,
  formData: FormData
): Promise<InventoryActionState> {
  const retryKey = previous.idempotencyKey;
  const parsed = changeSchema.safeParse({
    productId: field(formData, "productId"),
    kind: field(formData, "kind"),
    quantityDelta: field(formData, "quantityDelta"),
    reason: field(formData, "reason"),
    reference: field(formData, "reference"),
    idempotencyKey: field(formData, "idempotencyKey")
  });
  if (!parsed.success) {
    return { status: "error", message: "Revisa producto, cantidad, motivo y referencia. La salida física requiere una cantidad negativa.", idempotencyKey: retryKey };
  }
  try {
    await requireStaffActor(["operator", "admin"]);
    const client = await createSupabaseActionClient();
    const input = parsed.data;
    // The authenticated RPC repeats role validation and owns the stock row lock and idempotency key.
    const { data, error } = await client.rpc("record_inventory_change", {
      p_product_id: input.productId,
      p_kind: input.kind,
      p_quantity_delta: input.quantityDelta,
      p_reason: input.reason,
      p_reference: input.reference || null,
      p_idempotency_key: input.idempotencyKey
    });
    if (error || !data) {
      return { status: "error", message: "No se registró el movimiento. Revisa existencias, permiso y clave del intento.", idempotencyKey: retryKey };
    }
    revalidatePath("/admin/inventario");
    return {
      status: "success",
      message: "Movimiento de inventario registrado. Este registro no acredita ningún cobro.",
      idempotencyKey: randomUUID()
    };
  } catch {
    return { status: "error", message: "No se pudo verificar el permiso o registrar el movimiento.", idempotencyKey: retryKey };
  }
}

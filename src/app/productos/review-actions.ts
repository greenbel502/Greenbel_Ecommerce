"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { shouldUseSupabaseCatalog } from "@/lib/server/catalog-source";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseActionClient, createSupabaseReadClient } from "@/lib/supabase/server";

export type EligibleReviewOrderItem = Readonly<{ id: string; orderReference: string }>;
export type ReviewEligibility = Readonly<{
  status: "ready" | "unauthenticated" | "inactive" | "unavailable" | "mock";
  items: EligibleReviewOrderItem[];
}>;
export type ProductReviewActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

const uuid = z.uuid();
const reviewSchema = z.object({
  orderItemId: uuid,
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(3000)
});

function oneRelation(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object" ? record as Record<string, unknown> : null;
}

/** The public product page can show only delivered lines belonging to its signed-in viewer. */
export async function getEligibleReviewOrderItems(productId: string): Promise<ReviewEligibility> {
  const empty: EligibleReviewOrderItem[] = [];
  try {
    if (!shouldUseSupabaseCatalog()) return { status: "mock", items: empty };
    if (!uuid.safeParse(productId).success) return { status: "unavailable", items: empty };

    const client = await createSupabaseReadClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError && authError.name !== "AuthSessionMissingError") return { status: "unavailable", items: empty };
    if (!auth.user) return { status: "unauthenticated", items: empty };
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("active").eq("id", auth.user.id).maybeSingle();
    if (profileError) return { status: "unavailable", items: empty };
    if (!profile?.active) return { status: "inactive", items: empty };

    // Both nested records are subject to the viewer's RLS; the customer filter
    // additionally keeps staff accounts from seeing another person's lines here.
    const { data, error } = await client.from("order_items")
      .select("id,orders!inner(customer_id,reference,shipments!inner(delivered_at))")
      .eq("product_id", productId)
      .eq("orders.customer_id", auth.user.id)
      .not("orders.shipments.delivered_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { status: "unavailable", items: empty };

    const items = (data ?? []).flatMap((line) => {
      const order = oneRelation(line.orders);
      const shipment = oneRelation(order?.shipments);
      if (order?.customer_id !== auth.user.id || typeof order.reference !== "string"
        || typeof shipment?.delivered_at !== "string") return [];
      return [{ id: line.id, orderReference: order.reference }];
    });
    return { status: "ready", items };
  } catch {
    return { status: "unavailable", items: empty };
  }
}

/** A review is accepted only after this request proves ownership and delivery. */
export async function submitProductReviewAction(
  productId: string,
  _previous: ProductReviewActionState,
  formData: FormData
): Promise<ProductReviewActionState> {
  if (!uuid.safeParse(productId).success) {
    return { status: "error", message: "No se pudo identificar el producto." };
  }
  const parsed = reviewSchema.safeParse({
    orderItemId: formData.get("orderItemId"),
    rating: formData.get("rating"),
    comment: formData.get("comment")
  });
  if (!parsed.success) {
    return { status: "error", message: "Selecciona una compra entregada, una calificación de 1 a 5 y escribe un comentario de hasta 3,000 caracteres." };
  }

  try {
    if (!shouldUseSupabaseCatalog()) {
      return { status: "error", message: "Las reseñas no están disponibles en el catálogo de demostración." };
    }
    const client = await createSupabaseActionClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError && authError.name !== "AuthSessionMissingError") {
      return { status: "error", message: "No se pudo verificar tu sesión. Inténtalo más tarde." };
    }
    if (!auth.user) {
      return { status: "error", message: "Inicia sesión para enviar una reseña de tu compra entregada." };
    }
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("active").eq("id", auth.user.id).maybeSingle();
    if (profileError) {
      return { status: "error", message: "No se pudo verificar tu cuenta. Inténtalo más tarde." };
    }
    if (!profile?.active) {
      return { status: "error", message: "Tu cuenta no está activa para registrar reseñas." };
    }

    const { data: line, error: lineError } = await client.from("order_items")
      .select("id,order_id,product_id")
      .eq("id", parsed.data.orderItemId)
      .eq("product_id", productId)
      .maybeSingle();
    if (lineError || !line) {
      return { status: "error", message: "No se encontró una compra entregada de este producto en tu cuenta." };
    }

    const { data: order, error: orderError } = await client.from("orders")
      .select("id")
      .eq("id", line.order_id)
      .eq("customer_id", auth.user.id)
      .maybeSingle();
    if (orderError || !order) {
      return { status: "error", message: "No se encontró una compra entregada de este producto en tu cuenta." };
    }

    const { data: shipment, error: shipmentError } = await client.from("shipments")
      .select("id")
      .eq("order_id", order.id)
      .not("delivered_at", "is", null)
      .maybeSingle();
    if (shipmentError || !shipment) {
      return { status: "error", message: "Esta compra todavía no figura como entregada." };
    }

    // The service client is created only after authenticated, RLS-protected
    // reads have established the exact customer, product and delivered line.
    // Migration 005 repeats these checks in a database trigger at insert time.
    const { error: insertError } = await createSupabaseAdminClient().from("reviews").insert({
      customer_id: auth.user.id,
      product_id: productId,
      order_item_id: line.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
      moderation_status: "pending"
    });
    if (insertError) {
      return { status: "error", message: "No se pudo registrar la reseña. Comprueba la entrega e inténtalo de nuevo." };
    }

    revalidatePath("/productos");
    return { status: "success", message: "Reseña registrada y pendiente de moderación. Se mostrará públicamente cuando sea aprobada." };
  } catch {
    return { status: "error", message: "No se pudo confirmar el registro de la reseña. Inténtalo más tarde." };
  }
}

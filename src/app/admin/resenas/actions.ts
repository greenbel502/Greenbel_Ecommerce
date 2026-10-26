"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseActionClient } from "@/lib/supabase/server";

export type ReviewModerationState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

const moderationSchema = z.discriminatedUnion("decision", [
  z.object({
    id: z.uuid(),
    decision: z.literal("visible"),
    reason: z.literal(""),
  }),
  z.object({
    id: z.uuid(),
    decision: z.literal("hidden"),
    reason: z.enum(["spam", "personal_data", "offensive_content"]),
  }),
]);

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function moderateReviewAction(
  _previous: ReviewModerationState,
  formData: FormData,
): Promise<ReviewModerationState> {
  const parsed = moderationSchema.safeParse({
    id: field(formData, "id"),
    decision: field(formData, "decision"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Elige publicar o un motivo de ocultación permitido.",
    };
  }

  try {
    const actor = await requireStaffActor(["admin"]);
    const { id, decision, reason } = parsed.data;
    const source = field(formData, "source") || "product";
    const expected = z
      .enum(["pending", "visible", "hidden"])
      .safeParse(field(formData, "expectedStatus") || "pending");
    if (!expected.success || !["product", "whatsapp"].includes(source))
      return {
        status: "error",
        message: "No se pudo identificar la reseña. Actualiza la vista.",
      };
    if (source === "whatsapp") {
      const client = await createSupabaseActionClient();
      const { data, error } = await client.rpc("moderate_whatsapp_review", {
        p_review_id: id,
        p_expected_status: expected.data,
        p_decision: decision,
        p_reason: reason || null,
      });
      if (error || data !== id)
        return {
          status: "error",
          message:
            "No se guardó la moderación. Actualiza la vista antes de reintentar.",
        };
      revalidatePath("/admin/resenas");
      revalidatePath("/");
      return {
        status: "success",
        message:
          decision === "visible"
            ? "Reseña publicada."
            : "Reseña ocultada con el motivo registrado.",
      };
    }
    const { data, error } = await createSupabaseAdminClient()
      .from("reviews")
      .update({
        moderation_status: decision,
        moderation_reason: decision === "hidden" ? reason : null,
        moderated_by: actor.userId,
        moderated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("moderation_status", expected.data)
      .select("id,moderation_status,moderated_by")
      .maybeSingle();
    if (
      error ||
      !data ||
      data.moderated_by !== actor.userId ||
      data.moderation_status !== decision
    ) {
      return {
        status: "error",
        message:
          "No se moderó la reseña. Es posible que ya haya sido atendida; actualiza la vista.",
      };
    }
    revalidatePath("/admin/resenas");
    revalidatePath("/productos/[slug]", "page");
    return {
      status: "success",
      message:
        decision === "visible"
          ? "Reseña publicada."
          : "Reseña ocultada con el motivo registrado.",
    };
  } catch {
    return {
      status: "error",
      message: "No se pudo verificar el permiso o moderar la reseña.",
    };
  }
}

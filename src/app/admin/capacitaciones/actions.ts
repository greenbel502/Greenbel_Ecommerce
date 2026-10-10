"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export type TrainingActionState = Readonly<{ status: "idle" | "success" | "error"; message: string }>;

const videoUrl = z.string().trim().max(2000).refine((value) => {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
});
const trainingSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  title: z.string().trim().min(1).max(240),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
  description: z.string().trim().max(12000),
  videoUrl,
  publicationStatus: z.enum(["draft", "published", "archived"])
}).refine((value) => value.publicationStatus !== "published" || value.videoUrl.length > 0);

const relationSchema = z.object({
  trainingId: z.uuid(),
  targetId: z.uuid(),
  kind: z.enum(["product", "category"]),
  operation: z.enum(["attach", "detach"])
});

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveTrainingAction(
  _previous: TrainingActionState,
  formData: FormData
): Promise<TrainingActionState> {
  const parsed = trainingSchema.safeParse({
    id: field(formData, "id"),
    title: field(formData, "title"),
    slug: field(formData, "slug"),
    description: field(formData, "description"),
    videoUrl: field(formData, "videoUrl"),
    publicationStatus: field(formData, "publicationStatus")
  });
  if (!parsed.success) return { status: "error", message: "Revisa título, identificador, video HTTPS y estado. Para publicar se requiere video." };

  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const payload = {
      title: input.title,
      slug: input.slug,
      description: input.description || null,
      video_url: input.videoUrl || null,
      publication_status: input.publicationStatus
    };
    const admin = createSupabaseAdminClient();
    const query = input.id
      ? admin.from("trainings").update(payload).eq("id", input.id)
      : admin.from("trainings").insert(payload);
    const { data, error } = await query.select("id").single();
    if (error || !data) return { status: "error", message: "No se pudo guardar la capacitación. Revisa el identificador y el estado." };
    revalidatePath("/admin/capacitaciones");
    revalidatePath("/capacitaciones");
    return { status: "success", message: input.publicationStatus === "published" ? "Capacitación publicada." : "Capacitación guardada." };
  } catch {
    return { status: "error", message: "No se pudo verificar el permiso o guardar la capacitación." };
  }
}

export async function saveTrainingRelationAction(
  _previous: TrainingActionState,
  formData: FormData
): Promise<TrainingActionState> {
  const parsed = relationSchema.safeParse({
    trainingId: field(formData, "trainingId"),
    targetId: field(formData, "targetId"),
    kind: field(formData, "kind"),
    operation: field(formData, "operation")
  });
  if (!parsed.success) return { status: "error", message: "Selecciona una capacitación y un producto o categoría válido." };

  try {
    await requireStaffActor(["admin"]);
    const { trainingId, targetId, kind, operation } = parsed.data;
    const table = kind === "product" ? "training_products" : "training_categories";
    const targetColumn = kind === "product" ? "product_id" : "category_id";

    if (operation === "attach") {
      // Verify visibility through the same public projection the video page uses.
      const publicClient = createSupabasePublicClient();
      const target = kind === "product"
        ? await publicClient.from("catalog_products").select("id").eq("id", targetId).maybeSingle()
        : await publicClient.from("categories").select("id").eq("id", targetId).eq("active", true).maybeSingle();
      if (target.error || !target.data) {
        return { status: "error", message: kind === "product" ? "El producto no está publicado con una categoría y marca activas." : "La categoría no está activa." };
      }
    }

    const admin = createSupabaseAdminClient();
    if (operation === "attach") {
      const { error } = await admin.from(table).upsert(
        { training_id: trainingId, [targetColumn]: targetId },
        { onConflict: `training_id,${targetColumn}` }
      );
      if (error) return { status: "error", message: "No se pudo asociar el registro. Comprueba que la capacitación siga disponible." };
    } else {
      const { data, error } = await admin.from(table).delete()
        .eq("training_id", trainingId).eq(targetColumn, targetId)
        .select(targetColumn).maybeSingle();
      if (error || !data) return { status: "error", message: "No se encontró la asociación para quitarla. Actualiza la vista." };
    }

    revalidatePath("/admin/capacitaciones");
    revalidatePath("/capacitaciones/[slug]", "page");
    return { status: "success", message: operation === "attach" ? "Asociación guardada." : "Asociación quitada." };
  } catch {
    return { status: "error", message: "No se pudo verificar el permiso o actualizar la asociación." };
  }
}

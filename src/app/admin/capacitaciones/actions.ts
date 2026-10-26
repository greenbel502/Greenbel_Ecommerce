"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { TrainingRecord } from "@/lib/trainings/types";
import { generateProductSlug } from "@/lib/products/product-slug";
import {
  TRAINING_VIDEO_BUCKET,
  validTrainingVideoPath,
} from "@/lib/trainings/media";

export type TrainingActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
  training?: TrainingRecord;
}>;

const videoUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === "https:" &&
        Boolean(parsed.hostname) &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  });
const trainingSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(12000),
  videoUrl,
  videoOperation: z.enum(["keep", "url"]),
  publicationStatus: z.enum(["draft", "published", "archived"]),
});

const relationSchema = z.object({
  trainingId: z.uuid(),
  targetId: z.uuid(),
  kind: z.enum(["product", "category"]),
  operation: z.enum(["attach", "detach"]),
});

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Delete owned database rows atomically, then remove the now-unlinked private files. */
export async function deleteTrainingAction(
  _previous: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  const parsed = z
    .object({
      id: z.uuid(),
      expectedName: z.string().trim().min(1).max(240),
      confirmation: z.literal("delete"),
    })
    .safeParse({
      id: field(formData, "id"),
      expectedName: field(formData, "expectedName"),
      confirmation: field(formData, "confirmation"),
    });
  if (!parsed.success)
    return {
      status: "error",
      message: "Confirma la capacitación que deseas eliminar.",
    };
  try {
    const actor = await requireStaffActor(["admin"]);
    const admin = createSupabaseAdminClient();
    const deletion = await admin.rpc("admin_delete_training", {
      p_training_id: parsed.data.id,
      p_expected_title: parsed.data.expectedName,
      p_actor_id: actor.userId,
    });
    if (deletion.error || deletion.data?.id !== parsed.data.id) {
      const code = deletion.error?.code;
      return {
        status: "error",
        message:
          code === "PT409"
            ? "La capacitación cambió desde que abriste la confirmación. Actualiza la lista antes de eliminarla."
            : code === "P0002"
              ? "La capacitación ya no existe. Actualiza la lista."
              : code === "PGRST202"
                ? "La eliminación aún no está habilitada en este entorno."
                : "No se confirmó la eliminación de la capacitación. Actualiza la lista antes de reintentar.",
      };
    }
    const deleted = deletion.data;
    let cleanupPending = false;
    for (const [bucket, path] of [
      ["training-covers", deleted.cover_path],
      [TRAINING_VIDEO_BUCKET, deleted.video_storage_path],
    ] as const) {
      if (!path) continue;
      const valid =
        typeof path === "string" &&
        (bucket === TRAINING_VIDEO_BUCKET
          ? validTrainingVideoPath(parsed.data.id, path)
          : new RegExp(
              `^${parsed.data.id}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp|avif)$`,
            ).test(path));
      if (!valid) {
        cleanupPending = true;
        continue;
      }
      try {
        const cleanup = await admin.storage.from(bucket).remove([path]);
        if (cleanup.error) cleanupPending = true;
      } catch {
        cleanupPending = true;
      }
    }
    if (cleanupPending)
      console.warn("TRAINING_DELETE_MEDIA_CLEANUP_PENDING", {
        trainingId: parsed.data.id,
      });
    revalidatePath("/admin/capacitaciones");
    revalidatePath("/admin");
    revalidatePath("/capacitaciones");
    revalidatePath("/capacitaciones/[slug]", "page");
    revalidatePath("/productos/[slug]", "page");
    return {
      status: "success",
      message:
        "Capacitación eliminada correctamente." +
        (cleanupPending ? " La limpieza de sus archivos está pendiente." : ""),
    };
  } catch {
    return {
      status: "error",
      message:
        "No se pudo verificar el permiso o confirmar la eliminación. Actualiza la lista antes de reintentar.",
    };
  }
}

export async function saveTrainingAction(
  _previous: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  const parsed = trainingSchema.safeParse({
    id: field(formData, "id"),
    title: field(formData, "title"),
    description: field(formData, "description"),
    videoUrl: field(formData, "videoUrl"),
    videoOperation: field(formData, "videoOperation") || "url",
    publicationStatus: field(formData, "publicationStatus"),
  });
  if (!parsed.success)
    return {
      status: "error",
      message:
        "Revisa el título, el video HTTPS y el estado de la capacitación.",
    };

  try {
    await requireStaffActor(["admin"]);
    const input = parsed.data;
    const admin = createSupabaseAdminClient();
    const current = input.id
      ? await admin
          .from("trainings")
          .select("id,video_url,video_storage_path")
          .eq("id", input.id)
          .maybeSingle()
      : null;
    if (current && (current.error || !current.data))
      return {
        status: "error",
        message:
          "No se encontró la capacitación. Recarga e inténtalo de nuevo.",
      };
    const source =
      input.videoOperation === "url"
        ? { video_url: input.videoUrl || null, video_storage_path: null }
        : {
            video_url: current?.data?.video_url ?? null,
            video_storage_path: current?.data?.video_storage_path ?? null,
          };
    if (
      input.publicationStatus === "published" &&
      !source.video_url &&
      !source.video_storage_path
    )
      return {
        status: "error",
        message: "Agrega el video antes de publicar la capacitación.",
      };
    const payload = {
      title: input.title,
      description: input.description || null,
      ...source,
      publication_status: input.publicationStatus,
    };
    let query = input.id
      ? admin.from("trainings").update(payload).eq("id", input.id)
      : admin.from("trainings").insert({
          ...payload,
          slug: generateProductSlug(input.title, randomUUID()),
        });
    if (input.id && current?.data) {
      query =
        current.data.video_storage_path === null
          ? query.is("video_storage_path", null)
          : query.eq("video_storage_path", current.data.video_storage_path);
      query =
        current.data.video_url === null
          ? query.is("video_url", null)
          : query.eq("video_url", current.data.video_url);
    }
    const { data, error } = await query
      .select(
        "id,title,slug,description,video_url,video_storage_path,cover_path,publication_status,created_at",
      )
      .single();
    if (error || !data)
      return {
        status: "error",
        message:
          "No se pudo guardar la capacitación. Revisa el identificador y el estado.",
      };
    revalidatePath("/admin/capacitaciones");
    revalidatePath("/capacitaciones");
    revalidatePath("/capacitaciones/[slug]", "page");
    if (input.videoOperation === "url" && current?.data?.video_storage_path)
      await admin.storage
        .from(TRAINING_VIDEO_BUCKET)
        .remove([current.data.video_storage_path]);
    return {
      status: "success",
      training: data as TrainingRecord,
      message:
        input.publicationStatus === "published"
          ? "Capacitación publicada."
          : "Capacitación guardada.",
    };
  } catch {
    return {
      status: "error",
      message: "No se pudo verificar el permiso o guardar la capacitación.",
    };
  }
}

export async function saveTrainingRelationAction(
  _previous: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  const parsed = relationSchema.safeParse({
    trainingId: field(formData, "trainingId"),
    targetId: field(formData, "targetId"),
    kind: field(formData, "kind"),
    operation: field(formData, "operation"),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: "Selecciona una capacitación y un producto o categoría válido.",
    };

  try {
    await requireStaffActor(["admin"]);
    const { trainingId, targetId, kind, operation } = parsed.data;
    const table =
      kind === "product" ? "training_products" : "training_categories";
    const targetColumn = kind === "product" ? "product_id" : "category_id";

    if (operation === "attach") {
      // Verify visibility through the same public projection the video page uses.
      const publicClient = createSupabasePublicClient();
      const target =
        kind === "product"
          ? await publicClient
              .from("catalog_products")
              .select("id")
              .eq("id", targetId)
              .maybeSingle()
          : await publicClient
              .from("categories")
              .select("id")
              .eq("id", targetId)
              .eq("active", true)
              .maybeSingle();
      if (target.error || !target.data) {
        return {
          status: "error",
          message:
            kind === "product"
              ? "El producto no está publicado con una categoría y marca activas."
              : "La categoría no está activa.",
        };
      }
    }

    const admin = createSupabaseAdminClient();
    if (operation === "attach") {
      const { error } = await admin
        .from(table)
        .upsert(
          { training_id: trainingId, [targetColumn]: targetId },
          { onConflict: `training_id,${targetColumn}` },
        );
      if (error)
        return {
          status: "error",
          message:
            "No se pudo asociar el registro. Comprueba que la capacitación siga disponible.",
        };
    } else {
      const { data, error } = await admin
        .from(table)
        .delete()
        .eq("training_id", trainingId)
        .eq(targetColumn, targetId)
        .select(targetColumn)
        .maybeSingle();
      if (error || !data)
        return {
          status: "error",
          message:
            "No se encontró la asociación para quitarla. Actualiza la vista.",
        };
    }

    revalidatePath("/admin/capacitaciones");
    revalidatePath("/capacitaciones/[slug]", "page");
    return {
      status: "success",
      message:
        operation === "attach" ? "Asociación guardada." : "Asociación quitada.",
    };
  } catch {
    return {
      status: "error",
      message: "No se pudo verificar el permiso o actualizar la asociación.",
    };
  }
}

"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseActionClient } from "@/lib/supabase/server";
export type TrainingRatingState = {
  status: "idle" | "success" | "error";
  message: string;
  rating?: number;
};
export async function rateTraining(
  id: string,
  _previous: TrainingRatingState,
  form: FormData,
): Promise<TrainingRatingState> {
  const parsed = z
    .object({ id: z.uuid(), rating: z.coerce.number().int().min(1).max(5) })
    .safeParse({ id, rating: form.get("rating") });
  if (!parsed.success)
    return { status: "error", message: "Selecciona de 1 a 5 estrellas." };
  try {
    const client = await createSupabaseActionClient();
    const { data: auth, error } = await client.auth.getUser();
    if (error || !auth.user)
      return {
        status: "error",
        message: "Inicia sesión para calificar esta capacitación.",
      };
    // RPC-free own-row writes use the user's session, column grants and RLS.
    const current = await client
      .from("training_ratings")
      .select("rating")
      .eq("training_id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (current.error)
      return {
        status: "error",
        message: "No se pudo consultar tu calificación. Inténtalo de nuevo.",
      };
    const query = current.data
      ? client
          .from("training_ratings")
          .update({ rating: parsed.data.rating })
          .eq("training_id", id)
          .eq("user_id", auth.user.id)
      : client.from("training_ratings").insert({
          training_id: id,
          user_id: auth.user.id,
          rating: parsed.data.rating,
        });
    const saved = await query.select("rating").single();
    if (saved.error || !saved.data)
      return {
        status: "error",
        message:
          "No se pudo guardar. Comprueba que tu cuenta esté activa y el video siga publicado, e inténtalo de nuevo.",
      };
    revalidatePath("/capacitaciones");
    revalidatePath("/capacitaciones/[slug]", "page");
    revalidatePath("/admin/capacitaciones");
    revalidatePath("/admin");
    return {
      status: "success",
      message: "Tu calificación se guardó. Gracias por compartir tu opinión.",
      rating: saved.data.rating,
    };
  } catch {
    return {
      status: "error",
      message: "No se pudo guardar tu calificación. Inténtalo de nuevo.",
    };
  }
}

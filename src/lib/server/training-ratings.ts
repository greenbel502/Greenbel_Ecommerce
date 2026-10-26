import "server-only";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseReadClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffActor } from "./staff-authorization";
import type {
  TrainingRating,
  RatingOverview,
  RatingViewer,
} from "@/lib/trainings/types";

export async function trainingRatings(
  ids: string[],
): Promise<TrainingRating[] | null> {
  if (!ids.length) return [];
  try {
    const { data, error } = await createSupabasePublicClient().rpc(
      "training_rating_summaries",
      { p_training_ids: ids.slice(0, 100) },
    );
    return error ? null : (data as TrainingRating[]);
  } catch {
    return null;
  }
}
export async function trainingRatingViewer(id: string): Promise<RatingViewer> {
  try {
    const client = await createSupabaseReadClient();
    const auth = await client.auth.getUser();
    if (!auth.data.user)
      return {
        status:
          auth.error && auth.error.name !== "AuthSessionMissingError"
            ? "unavailable"
            : "unauthenticated",
        rating: null,
      };
    const profile = await client
      .from("profiles")
      .select("active")
      .eq("id", auth.data.user.id)
      .maybeSingle();
    if (profile.error) return { status: "unavailable", rating: null };
    if (!profile.data?.active) return { status: "inactive", rating: null };
    const rating = await client
      .from("training_ratings")
      .select("rating")
      .eq("training_id", id)
      .eq("user_id", auth.data.user.id)
      .maybeSingle();
    return {
      status: rating.error ? "unavailable" : "ready",
      rating: rating.data?.rating ?? null,
    };
  } catch {
    return { status: "unavailable", rating: null };
  }
}
export async function adminTrainingRatings(
  ids: string[],
): Promise<{ stats: TrainingRating[]; overview: RatingOverview } | null> {
  await requireStaffActor(["admin"]);
  const admin = createSupabaseAdminClient();
  const [rows, overview] = await Promise.all([
    ids.length
      ? admin
          .from("admin_training_rating_stats")
          .select("*")
          .in("training_id", ids)
      : Promise.resolve({ data: [], error: null }),
    admin.from("admin_training_rating_overview").select("*").single(),
  ]);
  return rows.error || overview.error
    ? null
    : { stats: rows.data ?? [], overview: overview.data };
}

import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Optional invitation: a review service failure must never block the purchase PDF. */
export async function issueWhatsAppReviewInvitation(
  userId: string,
  reference: string,
): Promise<string | null> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .rpc("issue_whatsapp_review_invitation", {
        p_customer_id: userId,
        p_reference: reference,
      })
      .abortSignal(AbortSignal.timeout(3000));
    if (error || typeof data !== "string") return null;
    return /^[0-9a-f-]{36}$/i.test(data) ? data : null;
  } catch {
    return null;
  }
}

export function isMissingReviewModel(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

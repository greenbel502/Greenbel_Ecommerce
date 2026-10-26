import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryAdminList } from "@/lib/server/admin-list-query";
import { adminLists } from "@/lib/admin-list-config";
import type { ListState } from "@/lib/admin-list";
import type {
  AdminReview,
  ReviewSource,
  ReviewStatus,
} from "@/lib/reviews/types";
import { isMissingReviewModel } from "./whatsapp-reviews";

export const reviewInboxConfig = {
  ...adminLists.reviews,
  filterLabel: "Estado",
  search: ["comment", "customer_name", "reference", "subject"],
};

/** Only invoked by the admin-authorized page. Pending migration keeps legacy reviews usable. */
export async function readAdminReviews(
  state: ListState,
): Promise<{ rows: AdminReview[]; ready: boolean }> {
  const admin = createSupabaseAdminClient();
  const probe = await admin
    .from("admin_review_inbox")
    .select("id", { head: true })
    .limit(1);
  if (!probe.error) {
    const { data } = await queryAdminList<{
      id: string;
      source: ReviewSource;
      customer_name: string;
      subject: string;
      reference: string;
      rating: number;
      comment: string;
      created_at: string;
      moderation_status: ReviewStatus;
      moderation_reason: string | null;
    }>(
      admin,
      "admin_review_inbox",
      "id,source,customer_name,subject,reference,rating,comment,created_at,moderation_status,moderation_reason",
      state,
      reviewInboxConfig,
    );
    return {
      ready: true,
      rows: data.map((r) => ({
        id: r.id,
        source: r.source,
        customerName: r.customer_name || "Cliente",
        subject: r.subject,
        reference: r.reference,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
        moderationStatus: r.moderation_status,
        moderationReason: r.moderation_reason,
      })),
    };
  }
  if (!isMissingReviewModel(probe.error))
    throw Error("Review inbox unavailable");
  const result = await queryAdminList<{
    id: string;
    customer_id: string;
    product_id: string;
    rating: number;
    comment: string;
    created_at: string;
    moderation_status: ReviewStatus;
    moderation_reason: string | null;
  }>(
    admin,
    "reviews",
    "id,customer_id,product_id,rating,comment,created_at,moderation_status,moderation_reason",
    state,
    adminLists.reviews,
  );
  const productIds = [...new Set(result.data.map((r) => r.product_id))];
  const customerIds = [...new Set(result.data.map((r) => r.customer_id))];
  const [products, profiles] = await Promise.all([
    productIds.length
      ? admin.from("products").select("id,name,sku").in("id", productIds)
      : { data: [], error: null },
    customerIds.length
      ? admin.from("profiles").select("id,display_name").in("id", customerIds)
      : { data: [], error: null },
  ]);
  if (products.error || profiles.error)
    throw Error("Review details unavailable");
  const names = new Map((products.data ?? []).map((p) => [p.id, p]));
  const customers = new Map(
    (profiles.data ?? []).map((p) => [p.id, p.display_name]),
  );
  return {
    ready: false,
    rows: result.data.map((r) => ({
      id: r.id,
      source: "product",
      customerName: customers.get(r.customer_id) || "Cliente",
      subject: names.get(r.product_id)?.name || "Producto asociado",
      reference: names.get(r.product_id)?.sku || "",
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
      moderationStatus: r.moderation_status,
      moderationReason: r.moderation_reason,
    })),
  };
}

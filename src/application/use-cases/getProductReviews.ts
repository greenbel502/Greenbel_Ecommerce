import "server-only";

import { shouldUseSupabaseCatalog } from "@/lib/server/catalog-source";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export type PublicProductReview = Readonly<{
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
}>;

export async function getProductReviews(productId: string): Promise<{
  status: "ready" | "unavailable" | "mock";
  reviews: PublicProductReview[];
}> {
  if (!shouldUseSupabaseCatalog()) return { status: "mock", reviews: [] };
  try {
    const client = createSupabasePublicClient();
    const { data, error } = await client.from("reviews")
      .select("id,rating,comment,created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return { status: "unavailable", reviews: [] };
    return {
      status: "ready",
      reviews: (data ?? []).map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.created_at
      }))
    };
  } catch {
    return { status: "unavailable", reviews: [] };
  }
}

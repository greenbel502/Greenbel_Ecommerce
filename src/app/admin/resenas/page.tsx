import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ReviewAdmin, type PendingReviewRow } from "./review-admin";
import styles from "./reviews-admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moderar reseñas", robots: { index: false, follow: false } };

export default async function ReviewAdminPage() {
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    return <div className={styles.shell}><p className={styles.error} role="alert">No se pudo verificar el acceso a reseñas. Inténtalo más tarde.</p></div>;
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: reviews, error: reviewsError } = await admin.from("reviews")
      .select("id,product_id,rating,comment,created_at")
      .eq("moderation_status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);
    if (reviewsError) throw new Error("Reviews unavailable");

    const productIds = [...new Set((reviews ?? []).map((review) => review.product_id))];
    const products = productIds.length > 0
      ? await admin.from("products").select("id,name,sku").in("id", productIds)
      : { data: [], error: null };
    if (products.error) throw new Error("Products unavailable");
    const names = new Map((products.data ?? []).map((product) => [product.id, { name: product.name, sku: product.sku }]));
    const pending: PendingReviewRow[] = (reviews ?? []).map((review) => ({
      id: review.id,
      productName: names.get(review.product_id)?.name ?? "Producto sin ficha disponible",
      productSku: names.get(review.product_id)?.sku ?? "",
      rating: review.rating,
      comment: review.comment,
      createdAt: review.created_at
    }));
    return <ReviewAdmin reviews={pending} hasMore={pending.length === 100} />;
  } catch {
    return <div className={styles.shell}><p className={styles.error} role="alert">El modelo de reseñas todavía no está disponible en este entorno. La moderación se habilitará cuando la migración aprobada esté aplicada en DEV.</p></div>;
  }
}

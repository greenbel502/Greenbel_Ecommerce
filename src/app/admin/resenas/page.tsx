import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listState, type AdminParams } from "@/lib/admin-list";
import { adminLists } from "@/lib/admin-list-config";
import { queryAdminList } from "@/lib/server/admin-list-query";
import { ListTools, ListPager, ListEmpty } from "../_components/list-controls";
import { ReviewAdmin, type PendingReviewRow } from "./review-admin";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reseñas",
  robots: { index: false, follow: false },
};
export default async function ReviewAdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminParams>;
}) {
  try {
    await requireStaffActor(["admin"]);
  } catch (e) {
    if (e instanceof StaffAuthorizationError && e.reason === "unauthenticated")
      redirect("/cuenta/ingresar");
    if (e instanceof StaffAuthorizationError && e.reason === "forbidden")
      notFound();
    throw e;
  }
  const params = await searchParams,
    state = listState(params, "", adminLists.reviews);
  if (params.filter === undefined) state.filter = "pending";
  const admin = createSupabaseAdminClient();
  const result = await queryAdminList<{
    id: string;
    product_id: string;
    rating: number;
    comment: string;
    created_at: string;
    moderation_status: string;
  }>(
    admin,
    "reviews",
    "id,product_id,rating,comment,created_at,moderation_status",
    state,
    adminLists.reviews,
  );
  const ids = [...new Set(result.data.map((r) => r.product_id))];
  const products = ids.length
    ? await admin.from("products").select("id,name,sku").in("id", ids)
    : { data: [], error: null };
  if (products.error) throw Error("Review products unavailable");
  const names = new Map((products.data ?? []).map((p) => [p.id, p]));
  const rows: PendingReviewRow[] = result.data.map((r) => ({
    id: r.id,
    productName: names.get(r.product_id)?.name || "Producto asociado",
    productSku: names.get(r.product_id)?.sku || "",
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    moderationStatus: r.moderation_status,
  }));
  return (
    <>
      <ListTools
        state={state}
        config={adminLists.reviews}
        path="/admin/resenas"
        label="reseñas"
      />
      <ReviewAdmin reviews={rows} hasMore={false} />
      {!rows.length && (
        <ListEmpty state={state} path="/admin/resenas" noun="reseñas" />
      )}
      <ListPager state={state} path="/admin/resenas" label="reseñas" />
    </>
  );
}

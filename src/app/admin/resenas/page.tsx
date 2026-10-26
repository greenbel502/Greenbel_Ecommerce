import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { listState, type AdminParams } from "@/lib/admin-list";
import { adminLists } from "@/lib/admin-list-config";
import {
  readAdminReviews,
  reviewInboxConfig,
} from "@/lib/server/admin-reviews";
import { ListTools, ListPager, ListEmpty } from "../_components/list-controls";
import { ReviewAdmin } from "./review-admin";
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
  const { rows, ready } = await readAdminReviews(state);
  return (
    <ReviewAdmin
      reviews={rows}
      total={state.total}
      controls={
        <ListTools
          state={state}
          config={
            ready
              ? reviewInboxConfig
              : { ...adminLists.reviews, filterLabel: "Estado" }
          }
          path="/admin/resenas"
          label="reseñas"
        />
      }
      empty={<ListEmpty state={state} path="/admin/resenas" noun="reseñas" />}
      pager={<ListPager state={state} path="/admin/resenas" label="reseñas" />}
    />
  );
}

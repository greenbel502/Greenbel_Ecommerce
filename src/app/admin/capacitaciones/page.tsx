import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { shouldUseSupabaseCatalog } from "@/lib/server/catalog-source";
import { listState, type AdminParams } from "@/lib/admin-list";
import { adminLists } from "@/lib/admin-list-config";
import { queryAdminList } from "@/lib/server/admin-list-query";
import { ListTools, ListPager, ListEmpty } from "../_components/list-controls";
import {
  TrainingAdmin,
  type TrainingRow,
  type TrainingProductOption,
  type TrainingCategoryOption,
  type TrainingProductLink,
  type TrainingCategoryLink,
} from "./training-admin";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Capacitaciones",
  robots: { index: false, follow: false },
};
export default async function TrainingAdminPage({
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
    state = listState(params, "", adminLists.trainings),
    admin = createSupabaseAdminClient();
  const columns =
    "id,title,slug,description,video_url,cover_path,publication_status,created_at";
  const result = await queryAdminList<TrainingRow>(
    admin,
    "trainings",
    columns,
    state,
    adminLists.trainings,
  );
  const listRows = [...result.data];
  const selectedId =
    typeof params.edit === "string" && /^[a-f0-9-]{36}$/i.test(params.edit)
      ? params.edit
      : "";
  if (selectedId && !result.data.some((r) => r.id === selectedId)) {
    const row = await admin
      .from("trainings")
      .select(columns)
      .eq("id", selectedId)
      .maybeSingle();
    if (row.error) throw Error("Training unavailable");
    if (!row.data) notFound();
    result.data.push(row.data as TrainingRow);
  }
  let products: TrainingProductOption[] = [],
    categories: TrainingCategoryOption[] = [],
    productLinks: TrainingProductLink[] = [],
    categoryLinks: TrainingCategoryLink[] = [];
  if (selectedId) {
    const [pr, cr] = await Promise.all([
      admin
        .from("training_products")
        .select("training_id,product_id")
        .eq("training_id", selectedId),
      admin
        .from("training_categories")
        .select("training_id,category_id")
        .eq("training_id", selectedId),
    ]);
    if (pr.error || cr.error) throw Error("Training links unavailable");
    productLinks = pr.data;
    categoryLinks = cr.data;
    const [p, c] = await Promise.all([
      productLinks.length
        ? admin
            .from("products")
            .select("id,name,sku")
            .in(
              "id",
              productLinks.map((r) => r.product_id),
            )
        : Promise.resolve({ data: [], error: null }),
      categoryLinks.length
        ? admin
            .from("categories")
            .select("id,name")
            .in(
              "id",
              categoryLinks.map((r) => r.category_id),
            )
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (p.error || c.error) throw Error("Training links unavailable");
    products = p.data ?? [];
    categories = c.data ?? [];
  }
  return (
    <TrainingAdmin
      trainings={result.data}
      listRows={listRows}
      selectedId={selectedId}
      products={products}
      categories={categories}
      productLinks={productLinks}
      categoryLinks={categoryLinks}
      publicCatalogConnected={shouldUseSupabaseCatalog()}
      limitedRecords={false}
      controls={
        <ListTools
          state={state}
          config={adminLists.trainings}
          path="/admin/capacitaciones"
          label="capacitaciones"
        />
      }
      pager={
        <>
          <ListPager
            state={state}
            path="/admin/capacitaciones"
            label="capacitaciones"
          />
          {!listRows.length && (
            <ListEmpty
              state={state}
              path="/admin/capacitaciones"
              noun="capacitaciones"
            />
          )}
        </>
      }
    />
  );
}

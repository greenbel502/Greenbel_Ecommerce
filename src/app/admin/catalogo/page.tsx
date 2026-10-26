import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { shouldUseSupabaseCatalog } from "@/lib/server/catalog-source";
import {
  StaffAuthorizationError,
  requireStaffActor,
} from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listState, type AdminParams } from "@/lib/admin-list";
import { adminLists } from "@/lib/admin-list-config";
import { BRAND_LOGO_BUCKET, BRAND_LOGO_MAX_STORED } from "@/lib/brand-logo";
import { queryAdminList } from "@/lib/server/admin-list-query";
import { ListTools, ListPager, ListEmpty } from "../_components/list-controls";
import {
  CatalogAdmin,
  type BrandRow,
  type CategoryRow,
  type CompatibilityRow,
  type ImageRow,
  type InclusionRow,
  type OfferRow,
  type ProductRow,
  type SpecRow,
} from "./catalog-admin";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Catálogo y ofertas",
  robots: { index: false, follow: false },
};
export default async function CatalogAdminPage({
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
  const params = await searchParams;
  const states = Object.fromEntries(
    ["brands", "categories", "products", "offers"].map((key) => [
      key,
      listState(params, `${key}_`, adminLists[key]),
    ]),
  );
  // The editor is transient client state; list submissions must not resurrect a closed drawer.
  for (const state of Object.values(states)) {
    delete state.params.brand;
    delete state.params.category;
    delete state.params.product;
  }
  const columns =
    "id,sku,slug,name,model,kind,brand_id,category_id,short_description,description,regular_price,warranty_months,warranty_terms,publication_status,featured";
  const uuid = (v: unknown): v is string =>
    typeof v === "string" && /^[a-f0-9-]{36}$/i.test(v);
  const selectedProductId =
      params.product === "new"
        ? "new"
        : uuid(params.product)
          ? params.product
          : "",
    selectedOfferId = uuid(params.offer) ? params.offer : "",
    selectedBrandId =
      params.brand === "new" ? "new" : uuid(params.brand) ? params.brand : "",
    selectedCategoryId =
      params.category === "new"
        ? "new"
        : uuid(params.category)
          ? params.category
          : "";
  const admin = createSupabaseAdminClient();
  const [brands, categories, products, offers] = await Promise.all([
    queryAdminList<BrandRow>(
      admin,
      "brands",
      "id,name,slug,active,logo_path,updated_at",
      states.brands,
      adminLists.brands,
    ),
    queryAdminList<CategoryRow>(
      admin,
      "categories",
      "id,name,slug,parent_id,active",
      states.categories,
      adminLists.categories,
    ),
    queryAdminList<ProductRow>(
      admin,
      "products",
      columns,
      states.products,
      adminLists.products,
    ),
    queryAdminList<OfferRow>(
      admin,
      "product_offers",
      "id,product_id,kind,value,starts_at,ends_at,enabled,products!inner(name,sku)",
      states.offers,
      adminLists.offers,
    ),
  ]);
  const brandRows = [...brands.data];
  const categoryRows = [...categories.data];
  if (
    selectedCategoryId &&
    selectedCategoryId !== "new" &&
    !categories.data.some((category) => category.id === selectedCategoryId)
  ) {
    const selected = await admin
      .from("categories")
      .select("id,name,slug,parent_id,active")
      .eq("id", selectedCategoryId)
      .maybeSingle();
    if (selected.error) throw new Error("Category editor unavailable");
    if (!selected.data) notFound();
    categories.data.push(selected.data as CategoryRow);
  }
  // Only resolve parents of this bounded page/selection, never download the full hierarchy.
  const parentIds = [
    ...new Set(
      categories.data.flatMap((category) =>
        category.parent_id ? [category.parent_id] : [],
      ),
    ),
  ];
  if (parentIds.length) {
    const parents = await admin
      .from("categories")
      .select("id,name")
      .in("id", parentIds);
    if (parents.error) throw new Error("Category parents unavailable");
    const names = new Map(
      parents.data.map((parent) => [parent.id, parent.name]),
    );
    for (const category of categories.data)
      category.parent_name = names.get(category.parent_id ?? "") ?? null;
  }
  if (
    selectedBrandId &&
    selectedBrandId !== "new" &&
    !brands.data.some((brand) => brand.id === selectedBrandId)
  ) {
    const selected = await admin
      .from("brands")
      .select("id,name,slug,active,logo_path,updated_at")
      .eq("id", selectedBrandId)
      .maybeSingle();
    if (selected.error) throw new Error("Brand editor unavailable");
    if (!selected.data) notFound();
    brands.data.push(selected.data as BrandRow);
  }
  let brandLogoReady = false;
  if (params.view === "brands") {
    const bucket = await admin.storage.getBucket(BRAND_LOGO_BUCKET);
    brandLogoReady =
      !bucket.error &&
      bucket.data?.public === false &&
      Number(bucket.data.file_size_limit) === BRAND_LOGO_MAX_STORED &&
      bucket.data.allowed_mime_types?.length === 1 &&
      bucket.data.allowed_mime_types[0] === "image/webp";
  }
  const productRows = [...products.data],
    offerRows = [...offers.data];
  if (
    selectedProductId &&
    selectedProductId !== "new" &&
    !products.data.some((p) => p.id === selectedProductId)
  ) {
    const r = await admin
      .from("products")
      .select(columns)
      .eq("id", selectedProductId)
      .maybeSingle();
    if (r.error) throw Error("Editor unavailable");
    if (r.data) products.data.push(r.data as ProductRow);
    else notFound();
  }
  if (selectedOfferId && !offers.data.some((p) => p.id === selectedOfferId)) {
    const r = await admin
      .from("product_offers")
      .select("id,product_id,kind,value,starts_at,ends_at,enabled")
      .eq("id", selectedOfferId)
      .maybeSingle();
    if (r.error) throw Error("Offer unavailable");
    if (r.data) offers.data.push(r.data as OfferRow);
    else notFound();
  }
  let specs: SpecRow[] = [],
    inclusions: InclusionRow[] = [],
    images: ImageRow[] = [],
    compatibilities: CompatibilityRow[] = [];
  if (selectedProductId && selectedProductId !== "new") {
    const results = await Promise.all([
      admin
        .from("product_specs")
        .select("id,product_id,label,value,unit,sort_order")
        .eq("product_id", selectedProductId)
        .order("sort_order"),
      admin
        .from("product_inclusions")
        .select("id,product_id,description,quantity,sort_order")
        .eq("product_id", selectedProductId)
        .order("sort_order"),
      admin
        .from("product_images")
        .select("id,product_id,alt_text,sort_order,is_primary")
        .eq("product_id", selectedProductId)
        .order("sort_order"),
      admin
        .from("product_compatibilities")
        .select("equipment_id,part_id,notes")
        .or(
          `equipment_id.eq.${selectedProductId},part_id.eq.${selectedProductId}`,
        ),
    ]);
    if (results.some((r) => r.error))
      throw Error("Product details unavailable");
    specs = results[0].data as SpecRow[];
    inclusions = results[1].data as InclusionRow[];
    images = results[2].data as ImageRow[];
    compatibilities = results[3].data as CompatibilityRow[];
  }
  // Resolve only the current product page and selected editor; never load the full catalogue.
  const visibleProductIds = [
    ...new Set([
      ...productRows.map((item) => item.id),
      ...(selectedProductId && selectedProductId !== "new"
        ? [selectedProductId]
        : []),
    ]),
  ];
  if (visibleProductIds.length) {
    const covers = await admin
      .from("product_images")
      .select("id,product_id")
      .in("product_id", visibleProductIds)
      .eq("is_primary", true);
    if (covers.error) throw new Error("Product covers unavailable");
    const byProduct = new Map(
      covers.data.map((image) => [image.product_id, image.id]),
    );
    for (const product of products.data)
      product.cover_image_id = byProduct.get(product.id) ?? null;
    const brandIds = [
      ...new Set(
        products.data.flatMap((product) =>
          product.brand_id &&
          !brands.data.some((brand) => brand.id === product.brand_id)
            ? [product.brand_id]
            : [],
        ),
      ),
    ];
    const categoryIds = [
      ...new Set(
        products.data.flatMap((product) =>
          !categories.data.some(
            (category) => category.id === product.category_id,
          )
            ? [product.category_id]
            : [],
        ),
      ),
    ];
    const [brandOptions, categoryOptions] = await Promise.all([
      brandIds.length
        ? admin
            .from("brands")
            .select("id,name,slug,active,logo_path,updated_at")
            .in("id", brandIds)
        : Promise.resolve({ data: [], error: null }),
      categoryIds.length
        ? admin
            .from("categories")
            .select("id,name,slug,parent_id,active")
            .in("id", categoryIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (brandOptions.error || categoryOptions.error)
      throw new Error("Product classification unavailable");
    brands.data.push(...(brandOptions.data as BrandRow[]));
    categories.data.push(...(categoryOptions.data as CategoryRow[]));
  }
  const ids = [
    ...new Set([
      ...offers.data.map((o) => o.product_id),
      ...compatibilities.flatMap((c) => [c.equipment_id, c.part_id]),
    ]),
  ].filter((id) => !products.data.some((p) => p.id === id));
  if (ids.length) {
    const r = await admin.from("products").select(columns).in("id", ids);
    if (r.error) throw Error("Related products unavailable");
    products.data.push(...(r.data as ProductRow[]));
  }
  const controls = Object.fromEntries(
    Object.entries(states).map(([key, state]) => [
      key,
      <ListTools
        key={key}
        state={state}
        config={adminLists[key]}
        path="/admin/catalogo"
        label={
          {
            brands: "marcas",
            categories: "categorías",
            products: "productos",
            offers: "ofertas",
          }[key]
        }
      />,
    ]),
  );
  const pagers = Object.fromEntries(
    Object.entries(states).map(([key, state]) => [
      key,
      <>
        <ListPager
          state={state}
          path="/admin/catalogo"
          label={
            {
              brands: "marcas",
              categories: "categorías",
              products: "productos",
              offers: "ofertas",
            }[key]
          }
        />
        {state.total === 0 && (
          <ListEmpty state={state} path="/admin/catalogo" />
        )}
      </>,
    ]),
  );
  return (
    <CatalogAdmin
      counts={Object.fromEntries(
        Object.entries(states).map(([key, state]) => [key, state.total]),
      )}
      brands={brands.data}
      categories={categories.data}
      products={products.data}
      productRows={productRows}
      offerRows={offerRows}
      offers={offers.data}
      specs={specs}
      inclusions={inclusions}
      images={images}
      compatibilities={compatibilities}
      view={
        typeof params.view === "string" &&
        ["brands", "categories", "products", "offers"].includes(params.view)
          ? params.view
          : "products"
      }
      selectedProductId={selectedProductId}
      selectedOfferId={selectedOfferId}
      selectedBrandId={selectedBrandId}
      selectedCategoryId={selectedCategoryId}
      brandRows={brandRows}
      categoryRows={categoryRows}
      brandLogoReady={brandLogoReady}
      controls={controls}
      pagers={pagers}
      publicCatalogConnected={shouldUseSupabaseCatalog()}
    />
  );
}

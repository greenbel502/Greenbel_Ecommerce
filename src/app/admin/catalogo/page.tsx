import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { shouldUseSupabaseCatalog } from "@/lib/server/catalog-source";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CatalogAdmin, type BrandRow, type CategoryRow, type CompatibilityRow, type ImageRow, type InclusionRow, type OfferRow, type ProductRow, type SpecRow } from "./catalog-admin";
import styles from "./catalog.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administrar catálogo", robots: { index: false, follow: false } };

export default async function CatalogAdminPage() {
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    return <div className={styles.shell}><p role="alert">No se pudo verificar el acceso al catálogo. Inténtalo más tarde.</p></div>;
  }

  try {
    const admin = createSupabaseAdminClient();
    const [brands, categories, products, offers, specs, inclusions, images, compatibilities] = await Promise.all([
      admin.from("brands").select("id,name,slug,active").order("name").limit(1000),
      admin.from("categories").select("id,name,slug,parent_id,active").order("name").limit(1000),
      admin.from("products").select("id,sku,slug,name,model,kind,brand_id,category_id,short_description,description,regular_price,warranty_months,warranty_terms,publication_status,featured").order("name").limit(1000),
      admin.from("product_offers").select("id,product_id,kind,value,starts_at,ends_at,enabled").order("starts_at", { ascending: false }).limit(1000),
      admin.from("product_specs").select("id,product_id,label,value,unit,sort_order").order("sort_order").limit(3000),
      admin.from("product_inclusions").select("id,product_id,description,quantity,sort_order").order("sort_order").limit(3000),
      admin.from("product_images").select("id,product_id,alt_text,sort_order,is_primary").order("sort_order").limit(3000),
      admin.from("product_compatibilities").select("equipment_id,part_id,notes").limit(3000)
    ]);
    if (brands.error || categories.error || products.error || offers.error || specs.error || inclusions.error || images.error || compatibilities.error) {
      throw new Error("Catalog data unavailable");
    }
    return <CatalogAdmin
      brands={(brands.data ?? []) as BrandRow[]}
      categories={(categories.data ?? []) as CategoryRow[]}
      products={(products.data ?? []) as ProductRow[]}
      offers={(offers.data ?? []) as OfferRow[]}
      specs={(specs.data ?? []) as SpecRow[]}
      inclusions={(inclusions.data ?? []) as InclusionRow[]}
      images={(images.data ?? []) as ImageRow[]}
      compatibilities={(compatibilities.data ?? []) as CompatibilityRow[]}
      publicCatalogConnected={shouldUseSupabaseCatalog()}
    />;
  } catch {
    return <div className={styles.shell}><p role="alert">El modelo de catálogo aún no está disponible en este entorno. Los controles de administración se habilitarán cuando la migración aprobada esté aplicada en DEV.</p></div>;
  }
}

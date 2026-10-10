import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { shouldUseSupabaseCatalog } from "@/lib/server/catalog-source";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TrainingAdmin, type TrainingCategoryLink, type TrainingCategoryOption, type TrainingProductLink, type TrainingProductOption, type TrainingRow } from "./training-admin";
import styles from "./training-admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administrar capacitaciones", robots: { index: false, follow: false } };

export default async function TrainingAdminPage() {
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") redirect("/cuenta/ingresar");
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") notFound();
    return <div className={styles.shell}><p role="alert">No se pudo verificar el acceso a capacitaciones. Inténtalo más tarde.</p></div>;
  }

  try {
    const admin = createSupabaseAdminClient();
    const [trainings, products, categories, productLinks, categoryLinks] = await Promise.all([
      admin.from("trainings").select("id,title,slug,description,video_url,cover_path,publication_status,created_at")
        .order("created_at", { ascending: false }).limit(1000),
      admin.from("catalog_products").select("id,name,sku").order("name").limit(1000),
      admin.from("categories").select("id,name").eq("active", true).order("name").limit(1000),
      admin.from("training_products").select("training_id,product_id").limit(1000),
      admin.from("training_categories").select("training_id,category_id").limit(1000)
    ]);
    if (trainings.error || products.error || categories.error || productLinks.error || categoryLinks.error) {
      throw new Error("Training relations unavailable");
    }
    return <TrainingAdmin
      trainings={(trainings.data ?? []) as TrainingRow[]}
      products={(products.data ?? []) as TrainingProductOption[]}
      categories={(categories.data ?? []) as TrainingCategoryOption[]}
      productLinks={(productLinks.data ?? []) as TrainingProductLink[]}
      categoryLinks={(categoryLinks.data ?? []) as TrainingCategoryLink[]}
      publicCatalogConnected={shouldUseSupabaseCatalog()}
      limitedRecords={(trainings.data?.length ?? 0) >= 1000 || (products.data?.length ?? 0) >= 1000
        || (categories.data?.length ?? 0) >= 1000 || (productLinks.data?.length ?? 0) >= 1000
        || (categoryLinks.data?.length ?? 0) >= 1000}
    />;
  } catch {
    return <div className={styles.shell}><p role="alert">El modelo de capacitaciones todavía no está disponible en este entorno. No se muestran formularios hasta aplicar la migración aprobada en DEV.</p></div>;
  }
}

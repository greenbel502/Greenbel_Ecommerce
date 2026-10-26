import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductEditorData } from "@/lib/products/product-editor-data";

const columns =
  "id,sku,slug,name,model,kind,brand_id,category_id,short_description,description,regular_price,warranty_months,warranty_terms,publication_status,featured";

/** Caller must authorize an active administrator first. All reads are scoped to this product. */
export async function readProductEditorData(
  admin: SupabaseClient,
  id: string,
  signal: AbortSignal,
): Promise<ProductEditorData | null> {
  const [product, images, specs, inclusions, compatibilities] =
    await Promise.all([
      admin
        .from("products")
        .select(columns)
        .eq("id", id)
        .abortSignal(signal)
        .maybeSingle(),
      admin
        .from("product_images")
        .select("id,product_id,alt_text,sort_order,is_primary")
        .eq("product_id", id)
        .order("sort_order")
        .order("id")
        .abortSignal(signal),
      admin
        .from("product_specs")
        .select("id,product_id,label,value,unit,sort_order")
        .eq("product_id", id)
        .order("sort_order")
        .order("id")
        .abortSignal(signal),
      admin
        .from("product_inclusions")
        .select("id,product_id,description,quantity,sort_order")
        .eq("product_id", id)
        .order("sort_order")
        .order("id")
        .abortSignal(signal),
      admin
        .from("product_compatibilities")
        .select("equipment_id,part_id,notes")
        .or(`equipment_id.eq.${id},part_id.eq.${id}`)
        .abortSignal(signal),
    ]);
  if (
    [product, images, specs, inclusions, compatibilities].some(
      (result) => result.error,
    )
  )
    throw new Error("Product editor read unavailable");
  if (!product.data) return null;
  const imageRows = images.data ?? [];
  const compatibilityRows = compatibilities.data ?? [];
  const ids = [
    ...new Set(
      compatibilityRows.flatMap((row) => [row.equipment_id, row.part_id]),
    ),
  ].filter((value) => value !== id);
  const [related, brand, category] = await Promise.all([
    ids.length
      ? admin.from("products").select(columns).in("id", ids).abortSignal(signal)
      : Promise.resolve({ data: [], error: null }),
    product.data.brand_id
      ? admin
          .from("brands")
          .select("id,name,slug,active,logo_path,updated_at")
          .eq("id", product.data.brand_id)
          .abortSignal(signal)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("categories")
      .select("id,name,slug,parent_id,active")
      .eq("id", product.data.category_id)
      .abortSignal(signal),
  ]);
  if (related.error || brand.error || category.error)
    throw new Error("Product classification read unavailable");
  return {
    product: {
      ...product.data,
      cover_image_id: imageRows.find((image) => image.is_primary)?.id ?? null,
    },
    images: imageRows,
    specs: specs.data ?? [],
    inclusions: inclusions.data ?? [],
    compatibilities: compatibilityRows,
    relatedProducts: related.data,
    brands: brand.data,
    categories: category.data,
  } as ProductEditorData;
}

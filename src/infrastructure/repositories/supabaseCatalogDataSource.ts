import type { Product } from "@/domain/entities/product";
import type { ProductFilters } from "@/domain/repositories/productRepository";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { SupabaseProductDataSource } from "./supabaseProductRepository";

type CatalogRow = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  kind: "equipment" | "part" | "accessory";
  model: string | null;
  category_name: string;
  brand_name: string | null;
  short_description: string | null;
  description: string | null;
  regular_price: string | number | null;
  effective_price: string | number | null;
  warranty_months: number | null;
  featured: boolean;
};

type SpecRow = { product_id: string; label: string; value: string; unit: string | null; sort_order: number };
type InclusionRow = { product_id: string; description: string; quantity: string | number; sort_order: number };
type ImageRow = { id: string; product_id: string; alt_text: string; is_primary: boolean; sort_order: number };
type AvailabilityRow = { product_id: string; verified: boolean; available: boolean };

function displayPrice(value: string | number | null): number | null {
  if (value === null) return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0 || price > 999_999_999_999.99) {
    throw new Error("El catálogo devolvió un precio inválido.");
  }
  return price;
}

function filterProducts(products: Product[], filters?: ProductFilters): Product[] {
  const query = filters?.query?.trim().toLocaleLowerCase("es-GT");
  return products.filter((product) => {
    if (filters?.category && filters.category !== "Todos" && product.category !== filters.category) return false;
    if (filters?.brand && filters.brand !== "Todas" && product.brand !== filters.brand) return false;
    if (!query) return true;
    const haystack = [product.name, product.sku, product.brand, product.category, ...product.searchTerms, ...product.specs.map((spec) => `${spec.label} ${spec.value}`)]
      .join(" ").toLocaleLowerCase("es-GT");
    return haystack.includes(query);
  });
}

/** Public reads use the publishable key and anon RLS; no service role is used. */
export const supabaseCatalogDataSource: SupabaseProductDataSource = {
  async listProducts(filters) {
    const client = createSupabasePublicClient();
    const { data, error } = await client.from("catalog_products").select("*").order("created_at", { ascending: false });
    if (error) throw new Error("El catálogo público no está disponible.");
    return filterProducts(await hydrateProducts(client, (data ?? []) as CatalogRow[]), filters);
  },

  async findProductBySlug(slug) {
    const client = createSupabasePublicClient();
    const { data, error } = await client.from("catalog_products").select("*").eq("slug", slug).maybeSingle();
    if (error) throw new Error("La ficha del producto no está disponible.");
    if (!data) return null;
    return (await hydrateProducts(client, [data as CatalogRow]))[0] ?? null;
  }
};

async function hydrateProducts(client: ReturnType<typeof createSupabasePublicClient>, rows: CatalogRow[]): Promise<Product[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [specResult, inclusionResult, imageResult, availabilityResult] = await Promise.all([
    client.from("product_specs").select("product_id,label,value,unit,sort_order").in("product_id", ids).order("sort_order"),
    client.from("product_inclusions").select("product_id,description,quantity,sort_order").in("product_id", ids).order("sort_order"),
    client.from("product_images").select("id,product_id,alt_text,is_primary,sort_order").in("product_id", ids).order("sort_order"),
    client.from("product_availability").select("product_id,verified,available").in("product_id", ids)
  ]);
  if (specResult.error || inclusionResult.error || imageResult.error || availabilityResult.error) throw new Error("Los detalles del catálogo no están disponibles.");
  const specs = (specResult.data ?? []) as SpecRow[];
  const inclusions = (inclusionResult.data ?? []) as InclusionRow[];
  const images = (imageResult.data ?? []) as ImageRow[];
  const availability = new Map(((availabilityResult.data ?? []) as AvailabilityRow[])
    .map((item) => [item.product_id, item]));

  return rows.map((row) => {
    const regular = displayPrice(row.regular_price);
    const effective = displayPrice(row.effective_price);
    if ((regular === null) !== (effective === null)) throw new Error("Precio de catálogo inconsistente.");
    const productImages = images.filter((image) => image.product_id === row.id)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
    const primaryImage = productImages.find((image) => image.is_primary) ?? productImages[0];
    const stockStatus = availability.get(row.id);
    if (!stockStatus) throw new Error("Falta disponibilidad pública para un producto publicado.");
    return {
      id: row.id,
      slug: row.slug,
      sku: row.sku,
      name: row.name,
      category: row.category_name,
      brand: row.brand_name ?? "Sin marca",
      kind: row.kind,
      operation: null,
      price: effective,
      compareAtPrice: regular !== null && effective !== null && regular > effective ? regular : undefined,
      isMockPrice: false,
      rating: null,
      stock: null,
      availability: stockStatus.verified ? (stockStatus.available ? "available" : "unavailable") : "unknown",
      warrantyMonths: row.warranty_months,
      featured: row.featured,
      shortDescription: row.short_description ?? "",
      description: row.description ?? "",
      recommendedUse: "",
      image: primaryImage ? `/api/product-images/${primaryImage.id}` : "/images/product-placeholder.svg",
      images: productImages.map((image) => ({
        src: `/api/product-images/${image.id}`,
        alt: image.alt_text
      })),
      specs: specs.filter((spec) => spec.product_id === row.id).map((spec) => ({
        label: spec.label,
        value: spec.unit ? `${spec.value} ${spec.unit}` : spec.value
      })),
      includes: inclusions.filter((item) => item.product_id === row.id).map((item) => {
        const quantity = Number(item.quantity);
        return quantity === 1 ? item.description : `${quantity} × ${item.description}`;
      }),
      searchTerms: row.model ? [row.model] : []
    };
  });
}

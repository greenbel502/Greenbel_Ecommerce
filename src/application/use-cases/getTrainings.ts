import "server-only";

import { shouldUseSupabaseCatalog } from "@/lib/server/catalog-source";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { PublicDataUnavailableError } from "@/lib/server/public-data-result";

export type PublicTraining = Readonly<{
  id: string;
  slug: string;
  title: string;
  description: string | null;
  videoUrl: string;
  hasCover: boolean;
}>;
export type TrainingRelatedProduct = Readonly<{
  id: string;
  slug: string;
  sku: string;
  name: string;
  shortDescription: string | null;
}>;

type TrainingRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  video_url: string;
  cover_path: string | null;
};

function fromRow(row: TrainingRow): PublicTraining {
  const videoUrl = new URL(row.video_url);
  if (videoUrl.protocol !== "https:") throw new Error("La capacitación publicada no tiene un video HTTPS válido.");
  return { id: row.id, slug: row.slug, title: row.title, description: row.description,
    videoUrl: videoUrl.toString(), hasCover: Boolean(row.cover_path) };
}

/** There are no video fixtures; DEV mock mode truthfully renders an empty library. */
export async function getPublicTrainings(): Promise<PublicTraining[]> {
  if (!shouldUseSupabaseCatalog()) return [];
  const client = createSupabasePublicClient();
  const { data, error } = await client.from("catalog_trainings").select("id,slug,title,description,video_url,cover_path").order("created_at", { ascending: false });
  if (error) throw new PublicDataUnavailableError("Las capacitaciones públicas no están disponibles.");
  return ((data ?? []) as TrainingRow[]).map(fromRow);
}

export async function getPublicTrainingBySlug(slug: string): Promise<PublicTraining | null> {
  if (!shouldUseSupabaseCatalog()) return null;
  const client = createSupabasePublicClient();
  const { data, error } = await client.from("catalog_trainings").select("id,slug,title,description,video_url,cover_path").eq("slug", slug).maybeSingle();
  if (error) throw new PublicDataUnavailableError("La capacitación no está disponible.");
  return data ? fromRow(data as TrainingRow) : null;
}

/** Resolve direct and category associations for a currently published product. */
export async function getProductRelatedTrainings(productId: string): Promise<PublicTraining[]> {
  if (!shouldUseSupabaseCatalog()) return [];
  const client = createSupabasePublicClient();
  const product = await client.from("catalog_products").select("id,category_id").eq("id", productId).maybeSingle();
  if (product.error) throw new PublicDataUnavailableError("Las capacitaciones relacionadas no están disponibles.");
  if (!product.data) return [];

  const [directLinks, categoryLinks] = await Promise.all([
    client.from("training_products").select("training_id").eq("product_id", productId),
    client.from("training_categories").select("training_id").eq("category_id", product.data.category_id)
  ]);
  if (directLinks.error || categoryLinks.error) throw new PublicDataUnavailableError("Las capacitaciones relacionadas no están disponibles.");
  const trainingIds = [...new Set([
    ...(directLinks.data ?? []).map((link) => link.training_id),
    ...(categoryLinks.data ?? []).map((link) => link.training_id)
  ])];
  if (trainingIds.length === 0) return [];

  const trainings = await client.from("catalog_trainings")
    .select("id,slug,title,description,video_url,cover_path")
    .in("id", trainingIds)
    .order("created_at", { ascending: false });
  if (trainings.error) throw new PublicDataUnavailableError("Las capacitaciones relacionadas no están disponibles.");
  return ((trainings.data ?? []) as TrainingRow[]).map(fromRow);
}

/** Direct and category links are resolved through the published product view. */
export async function getTrainingRelatedProducts(trainingId: string): Promise<TrainingRelatedProduct[]> {
  if (!shouldUseSupabaseCatalog()) return [];
  const client = createSupabasePublicClient();
  const [directLinks, categoryLinks] = await Promise.all([
    client.from("training_products").select("product_id").eq("training_id", trainingId),
    client.from("training_categories").select("category_id").eq("training_id", trainingId)
  ]);
  if (directLinks.error || categoryLinks.error) throw new PublicDataUnavailableError("Los productos relacionados no están disponibles.");
  const productIds = [...new Set((directLinks.data ?? []).map((link) => link.product_id))];
  const categoryIds = [...new Set((categoryLinks.data ?? []).map((link) => link.category_id))];
  if (productIds.length === 0 && categoryIds.length === 0) return [];

  const [directProducts, categoryProducts] = await Promise.all([
    productIds.length > 0
      ? client.from("catalog_products").select("id,slug,sku,name,short_description").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    categoryIds.length > 0
      ? client.from("catalog_products").select("id,slug,sku,name,short_description").in("category_id", categoryIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (directProducts.error || categoryProducts.error) throw new PublicDataUnavailableError("Los productos relacionados no están disponibles.");
  const products = new Map<string, TrainingRelatedProduct>();
  for (const row of [...(directProducts.data ?? []), ...(categoryProducts.data ?? [])]) {
    products.set(row.id, {
      id: row.id,
      slug: row.slug,
      sku: row.sku,
      name: row.name,
      shortDescription: row.short_description
    });
  }
  return [...products.values()].sort((a, b) => a.name.localeCompare(b.name, "es-GT"));
}

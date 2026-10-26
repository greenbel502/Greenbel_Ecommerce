import "server-only";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/** Minimal anonymous reads reuse the same publication/RLS rules as the storefront. */
export async function getSitemapSlugs() {
  const client = createSupabasePublicClient();
  async function slugs(table: "catalog_products" | "catalog_trainings") {
    const result: string[] = [];
    const size = 500;
    for (let offset = 0; ; offset += size) {
      const { data, error } = await client
        .from(table)
        .select("slug")
        .order("id")
        .range(offset, offset + size - 1);
      if (error || !data) throw new Error("Public sitemap data unavailable");
      result.push(...data.map((row) => row.slug as string));
      if (data.length < size) return result;
    }
  }
  const [products, trainings] = await Promise.all([
    slugs("catalog_products"),
    slugs("catalog_trainings"),
  ]);
  return { products, trainings };
}

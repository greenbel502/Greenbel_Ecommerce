import "server-only";
import type { PublicBrand } from "@/domain/entities/brand";
import { brandLogoUrl } from "@/lib/brand-logo";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { PublicDataUnavailableError } from "./public-data-result";

/** Uses the same brand records as administration/products, through active-brand RLS. */
export async function getPublicBrands(): Promise<PublicBrand[]> {
  try {
    const client = createSupabasePublicClient();
    const brands: PublicBrand[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client
        .from("brands")
        .select("id,name,slug,logo_path")
        .eq("active", true)
        .order("name")
        .order("id")
        .range(offset, offset + 499);
      if (error || !data) throw new PublicDataUnavailableError();
      brands.push(
        ...data.map((brand) => ({
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          logoUrl: brandLogoUrl(brand.id, brand.logo_path),
        })),
      );
      if (data.length < 500) return brands;
    }
  } catch {
    throw new PublicDataUnavailableError();
  }
}

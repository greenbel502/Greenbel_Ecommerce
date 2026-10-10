import "server-only";

import { localProductRepository } from "@/infrastructure/repositories/localProductRepository";
import { SupabaseProductRepository } from "@/infrastructure/repositories/supabaseProductRepository";
import { supabaseCatalogDataSource } from "@/infrastructure/repositories/supabaseCatalogDataSource";
import type { ProductFilters } from "@/domain/repositories/productRepository";
import { shouldUseSupabaseCatalog } from "@/lib/server/catalog-source";

function repository() {
  return shouldUseSupabaseCatalog()
    ? new SupabaseProductRepository(supabaseCatalogDataSource)
    : localProductRepository;
}

export async function getProducts(filters?: ProductFilters) {
  return repository().list(filters);
}

export async function getFeaturedProducts() {
  return repository().listFeatured();
}

export async function getProductBySlug(slug: string) {
  return repository().findBySlug(slug);
}

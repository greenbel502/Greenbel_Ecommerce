import type { Product } from "../entities/product";

export type ProductFilters = {
  category?: string;
  query?: string;
  brand?: string;
};

export interface ProductRepository {
  list(filters?: ProductFilters): Promise<Product[]>;
  findBySlug(slug: string): Promise<Product | null>;
  listFeatured(): Promise<Product[]>;
}

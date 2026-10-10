import type { Product } from "@/domain/entities/product";
import type { ProductFilters, ProductRepository } from "@/domain/repositories/productRepository";

export interface SupabaseProductDataSource {
  listProducts(filters?: ProductFilters): Promise<Product[]>;
  findProductBySlug(slug: string): Promise<Product | null>;
}

export class SupabaseProductRepository implements ProductRepository {
  constructor(private readonly dataSource: SupabaseProductDataSource) {}
  list(filters?: ProductFilters) { return this.dataSource.listProducts(filters); }
  findBySlug(slug: string) { return this.dataSource.findProductBySlug(slug); }
  async listFeatured() { return (await this.dataSource.listProducts()).filter((product) => product.featured).slice(0, 6); }
}

import { products } from "@/infrastructure/mock/products";
import type { ProductRepository } from "@/domain/repositories/productRepository";

export const localProductRepository: ProductRepository = {
  async list(filters) {
    const query = filters?.query?.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = !filters?.category || filters.category === "Todos" || product.category === filters.category;
      const matchesBrand = !filters?.brand || filters.brand === "Todas" || product.brand === filters.brand;
      const haystack = [product.name, product.sku, product.brand, product.category, ...product.searchTerms, ...product.specs.map((spec) => `${spec.label} ${spec.value}`)].join(" ").toLowerCase();
      return matchesCategory && matchesBrand && (!query || haystack.includes(query));
    });
  },
  async findBySlug(slug) { return products.find((product) => product.slug === slug) ?? null; },
  async listFeatured() { return products.filter((product) => product.featured).slice(0, 6); }
};

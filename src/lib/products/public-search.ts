import type { Product } from "../../domain/entities/product";
import type { AppEnvironment } from "../server/environment-policy";

export type ProductSearchItem = Pick<
  Product,
  "id" | "name" | "slug" | "sku" | "brand" | "image" | "price" | "isMockPrice"
>;

export function publicProductSearchResults(
  products: readonly Product[],
  environment: AppEnvironment,
): ProductSearchItem[] {
  return products
    .filter((product) => environment === "DEV" || !product.isMockPrice)
    .slice(0, 6)
    .map(({ id, name, slug, sku, brand, image, price, isMockPrice }) => ({
      id,
      name,
      slug,
      sku,
      brand,
      image,
      price,
      isMockPrice,
    }));
}

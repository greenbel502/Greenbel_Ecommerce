import type { Product } from "@/domain/entities/product";

/** Home reads the public catalog; it never changes the administrator's featured flags. */
export function selectHomeProducts<T extends Pick<Product, "featured" | "kind">>(
  products: readonly T[],
): { products: T[]; title: string } {
  const featured = products.filter((product) => product.featured);
  if (featured.length > 0) {
    const selection = featured.slice(0, 5);
    return {
      products: selection,
      title: selection.every((product) => product.kind === "equipment")
        ? "Equipos destacados"
        : "Productos destacados",
    };
  }

  const equipment = products.filter((product) => product.kind === "equipment");
  return equipment.length > 0
    ? { products: equipment.slice(0, 5), title: "Equipos para tu trabajo" }
    : { products: products.slice(0, 5), title: "Explora nuestros productos" };
}

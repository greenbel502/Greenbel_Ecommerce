import Image from "next/image";
import type { Product } from "@/domain/entities/product";

export function ProductVisual({ product, priority = false }: { product: Product; priority?: boolean }) {
  return (
    <div className="product-visual">
      <Image
        src={product.image}
        unoptimized={product.image.startsWith("/api/product-images/")}
        alt={`${product.name} - ${product.brand}`}
        fill
        priority={priority}
        sizes="(max-width: 640px) calc(100vw - 48px), (max-width: 900px) 46vw, (max-width: 1180px) 32vw, 280px"
      />
      <span className="product-visual-chip">{product.brand}</span>
    </div>
  );
}

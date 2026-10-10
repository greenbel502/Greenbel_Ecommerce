"use client";

import { ArrowUpRight, MessageCircle, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { formatCurrency } from "@/application/use-cases/cartCalculations";
import type { Product } from "@/domain/entities/product";
import { useCart } from "@/presentation/providers/cart-provider";
import { ProductVisual } from "./product-visual";

export function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const hasPrice = product.price !== null;
  const canSelect = hasPrice && (product.availability
    ? product.availability === "available"
    : product.stock === null || product.stock > 0);
  const availability = product.availability === "available" ? "Disponible"
    : product.availability === "unavailable" ? "Agotado"
      : product.availability === "unknown" ? "Existencia por confirmar"
        : product.stock === null ? "Existencia por confirmar" : product.stock <= 0 ? "Agotado" : product.stock <= 5 ? "Últimas unidades" : "Disponible";
  const warranty = product.warrantyMonths === null ? null : `${product.warrantyMonths} mes${product.warrantyMonths === 1 ? "" : "es"} de garantía`;

  function addToCart() {
    if (!canSelect) return;
    if (addItem(product)) {
      toast.success("Producto agregado", { description: `${product.name} está en tu carrito.` });
    } else {
      toast.error("No se pudo agregar", { description: "La selección alcanzó el límite técnico permitido." });
    }
  }

  return (
    <article className="product-card">
      <Link href={`/productos/${product.slug}`} className="product-image-link" aria-label={`Ver ${product.name}`}>
        {product.badge && <span className="badge">{product.badge}</span>}
        <ProductVisual product={product} />
      </Link>
      <div className="product-card-body">
        <div className="product-meta"><span>{product.brand}</span><span>{product.sku}</span></div>
        <Link href={`/productos/${product.slug}`}><h3>{product.name}</h3></Link>
        <p>{product.shortDescription}</p>
        <div className="spec-chips">
          {product.specs.slice(0, 2).map((spec) => <span key={spec.label}>{spec.value}</span>)}
        </div>
        <div className="stock-row"><span className={product.availability === "available" ? "stock" : product.availability ? "" : product.stock === null ? "" : product.stock > 0 && product.stock <= 5 ? "stock low" : "stock"}>{availability}</span>{warranty && <span>{warranty}</span>}</div>
        <div className="product-price-row">
          <div><strong>{product.price === null ? "Precio próximamente" : formatCurrency(product.price)}</strong>{hasPrice && product.isMockPrice && <small>Precio demostrativo</small>}</div>
          {canSelect && <button className="icon-button add-button" onClick={addToCart} aria-label={`Agregar ${product.name}`} title="Agregar al carrito"><ShoppingCart size={18} /></button>}
        </div>
        <div className="card-actions">
          <Link href={`/productos/${product.slug}`}>Ver detalles <ArrowUpRight size={15} /></Link>
          <Link href={`/contacto?producto=${product.sku}`} aria-label={`Ver estado de contacto para ${product.name}`}><MessageCircle size={16} /> Contacto</Link>
        </div>
      </div>
    </article>
  );
}

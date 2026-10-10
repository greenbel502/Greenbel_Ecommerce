"use client";

import { MessageCircle, Minus, Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MAX_CART_QUANTITY } from "@/domain/cart/cartSelection";
import type { Product } from "@/domain/entities/product";
import { useCart } from "@/presentation/providers/cart-provider";

export function ProductDetailActions({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();
  const canAdd = product.price !== null && (product.availability
    ? product.availability === "available"
    : product.stock === null || product.stock > 0);
  const add = () => {
    if (!canAdd) return;
    if (addItem(product, quantity)) {
      toast.success("Producto agregado", { description: `${quantity} × ${product.name}` });
    } else {
      toast.error("No se pudo agregar", { description: "La selección alcanzó el límite técnico permitido." });
    }
  };

  return <>
    {canAdd && <div className="detail-purchase">
      <div className="quantity-selector">
        <button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Restar cantidad"><Minus /></button>
        <span>{quantity}</span>
        <button onClick={() => setQuantity(Math.min(MAX_CART_QUANTITY, product.stock ?? MAX_CART_QUANTITY, quantity + 1))} disabled={quantity >= MAX_CART_QUANTITY || (product.stock !== null && quantity >= product.stock)} aria-label="Sumar cantidad"><Plus /></button>
      </div>
      <button className="primary-button" onClick={add}><ShoppingCart size={18} /> Agregar al carrito</button>
    </div>}
    <a className="whatsapp-button" href={`/contacto?producto=${product.sku}`}><MessageCircle size={18} /> Ver estado de contacto</a>
    {canAdd && <div className="mobile-buy-bar"><span>{product.name}</span><button onClick={add}><ShoppingCart size={18} /> Agregar</button></div>}
  </>;
}

"use client";

import Link from "next/link";
import { LockKeyhole, ShoppingBag } from "lucide-react";
import { formatCurrency } from "@/application/use-cases/cartCalculations";
import { useCart } from "@/presentation/providers/cart-provider";
import { AnimatedTitle, Reveal } from "./motion-primitives";

export function CheckoutAvailability() {
  const { lines, totals } = useCart();

  if (lines.length === 0) {
    return (
      <section className="empty-state">
        <ShoppingBag size={42} />
        <AnimatedTitle as="h1" lines={["Tu carrito está vacío"]} />
        <Reveal as="p" delay={0.16}>Selecciona productos para revisarlos.</Reveal>
        <Link href="/productos" className="primary-button">Ver productos</Link>
      </section>
    );
  }

  return (
    <section className="checkout-shell">
      <div className="checkout-intro">
        <Reveal as="span" className="eyebrow">Tu selección</Reveal>
        <AnimatedTitle as="h1" lines={["Compra en preparación"]} />
        <Reveal as="p" delay={0.16}>
          La compra sigue pendiente de las condiciones de entrega y pago, y de una confirmación segura del pedido.
        </Reveal>
      </div>
      <div className="checkout-layout">
        <div className="checkout-form">
          <section className="form-section">
            <div className="form-section-heading">
              <span><LockKeyhole size={20} /></span>
              <div>
                <h2>Aún no se puede confirmar este pedido</h2>
                <p>No se ha creado una orden, reservado inventario ni procesado un pago. Tu selección permanece en el carrito de este navegador.</p>
              </div>
            </div>
            <Link href="/carrito" className="primary-button">Volver al carrito</Link>
          </section>
        </div>
        <aside className="summary-panel checkout-summary">
          <span className="eyebrow">Tu carrito</span>
          <h2>Resumen provisional</h2>
          <div className="checkout-products">
            {lines.map(({ product, quantity }) => (
              <div key={product.id}>
                <span><b>{quantity}</b>{product.name}<small>{product.sku}</small></span>
                <strong>{product.price === null ? "Precio próximamente" : formatCurrency(product.price * quantity)}</strong>
              </div>
            ))}
          </div>
          <div className="summary-lines">
            <span>Subtotal de productos <strong>{totals.subtotal === null ? "Pendiente" : formatCurrency(totals.subtotal)}</strong></span>
            <span>Entrega <strong>Pendiente de definir</strong></span>
            <span className="summary-total">Total final <strong>Pendiente de confirmar</strong></span>
          </div>
          <p className="warranty-note">{lines.some((line) => line.product.isMockPrice) ? "Los precios de demostración son ficticios. " : ""}El carrito no garantiza precio ni disponibilidad.</p>
        </aside>
      </div>
    </section>
  );
}

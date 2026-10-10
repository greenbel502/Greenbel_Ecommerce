"use client";

import Link from "next/link";
import { Minus, Plus, RotateCcw, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/application/use-cases/cartCalculations";
import { MAX_CART_QUANTITY } from "@/domain/cart/cartSelection";
import { useCart } from "@/presentation/providers/cart-provider";
import { ProductVisual } from "./product-visual";
import { AnimatedTitle, Reveal } from "./motion-primitives";
import { QuoteRequest } from "./quote-request";

export function CartView() {
  const { clearCart, itemCount, lines, removeItem, restoreStatus, retryRestore, storageError, totals, updateQuantity } = useCart();
  const hasScrollableProducts = lines.length > 5;
  const storageMessage = storageError
    ? "El navegador no permitió leer o guardar la selección local. Los cambios visibles pueden perderse al recargar; no se borraron los datos guardados."
    : null;
  const restoreMessage = restoreStatus === "error"
    ? "No pudimos actualizar los productos del carrito. No eliminamos tu selección; reintenta antes de usar precios o disponibilidad."
    : restoreStatus === "incomplete"
      ? "Algunos productos de tu selección no están disponibles en el catálogo público. Sus IDs no se eliminaron para que puedas reintentar."
      : null;

  if (restoreStatus === "loading" && lines.length === 0)
    return <section className="empty-state" role="status"><ShoppingBag size={42} /><h1>Recuperando tu carrito</h1><p>Estamos consultando las fichas actuales de tu selección.</p></section>;

  if ((restoreMessage || storageMessage) && lines.length === 0)
    return <section className="empty-state"><ShoppingBag size={42} /><h1>No pudimos mostrar tu selección</h1><p role="alert">{restoreMessage} {storageMessage}</p>{restoreMessage && <button className="primary-button" onClick={retryRestore}>Reintentar catálogo</button>}<Link href="/productos" className="continue-shopping">Ver catálogo</Link></section>;

  if (lines.length === 0)
    return (
      <section className="empty-state">
        <ShoppingBag size={42} />
        <AnimatedTitle as="h1" lines={["Tu carrito está listo", "para llenarse"]} />
        <Reveal as="p" delay={0.16}>Agrega equipos o repuestos y revisa todo antes de confirmar.</Reveal>
        <Reveal delay={0.24}><Link href="/productos" className="primary-button">Ver productos</Link></Reveal>
      </section>
    );

  return (
    <section className="cart-layout">
      <div className="cart-main">
        {storageMessage && <div className="cart-restore-notice" role="alert"><p>{storageMessage}</p></div>}
        {restoreMessage && <div className="cart-restore-notice" role="alert"><p>{restoreMessage}</p><button onClick={retryRestore}>Reintentar</button></div>}
        {restoreStatus === "loading" && <p className="cart-restore-notice" role="status">Actualizando los productos del carrito...</p>}
        <div className="cart-heading">
          <div>
            <Reveal as="span" className="eyebrow">Tu selección</Reveal>
            <AnimatedTitle as="h1" lines={["Carrito de compras"]} />
            <Reveal as="p" delay={0.16}>
              {itemCount} producto{itemCount === 1 ? "" : "s"} en tu pedido.
            </Reveal>
          </div>
          <button
            className="text-button danger"
            onClick={() => {
              clearCart();
              toast("Carrito vaciado");
            }}
          >
            <Trash2 size={16} /> Vaciar carrito
          </button>
        </div>

        <div className={hasScrollableProducts ? "cart-table cart-table-scrollable" : "cart-table"}>
          <div className="cart-table-header">
            <span>Producto</span>
            <span>Cantidad</span>
            <span>Total</span>
            <span className="sr-only">Acción</span>
          </div>
          <div className="cart-lines-scroll">
            {lines.map((line) => (
              <article className="cart-line" key={line.product.id}>
                <div className="cart-product">
                  <ProductVisual product={line.product} />
                  <div>
                    <span className="cart-sku">
                      {line.product.brand} · {line.product.sku}
                    </span>
                    <h2>{line.product.name}</h2>
                    <small>{line.product.price === null ? "Precio próximamente" : `${formatCurrency(line.product.price)} c/u`}</small>
                  </div>
                </div>
                <div className="quantity-control" aria-label={`Cantidad de ${line.product.name}`}>
                  <button onClick={() => updateQuantity(line.product.id, line.quantity - 1)} disabled={line.quantity <= 1} aria-label="Restar">
                    <Minus size={15} />
                  </button>
                  <span>{line.quantity}</span>
                  <button
                    onClick={() => updateQuantity(line.product.id, line.quantity + 1)}
                    disabled={line.quantity >= MAX_CART_QUANTITY || (line.product.stock !== null && line.quantity >= line.product.stock)}
                    aria-label="Sumar"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <strong>{line.product.price === null ? "Precio próximamente" : formatCurrency(line.product.price * line.quantity)}</strong>
                <button className="remove-button" onClick={() => removeItem(line.product.id)} aria-label={`Eliminar ${line.product.name}`}>
                  <Trash2 size={17} />
                </button>
              </article>
            ))}
          </div>
        </div>

        <Link className="continue-shopping" href="/productos">
          <RotateCcw size={16} /> Continuar comprando
        </Link>
      </div>

      <aside className="summary-panel">
        <Reveal as="span" className="eyebrow">Resumen</Reveal>
        <AnimatedTitle lines={["Tu pedido"]} />
        <div className="summary-lines">
          <span>
            Subtotal de productos <strong>{totals.subtotal === null ? "Pendiente" : formatCurrency(totals.subtotal)}</strong>
          </span>
          <span>
            Entrega <strong>Pendiente de definir</strong>
          </span>
          <span className="summary-total">
            Total final <strong>Pendiente de confirmar</strong>
          </span>
        </div>
        <p className="warranty-note">{lines.some((line) => line.product.isMockPrice) ? "Los precios de los productos de demostración son ficticios. " : ""}El carrito no reserva existencias ni garantiza precios. Los importes del navegador no son definitivos; el total requiere entrega configurada y cálculo en servidor.</p>
        <QuoteRequest lines={lines} ready={restoreStatus === "ready" && !storageError} />
        <Link href="/checkout" className="primary-button full-width">
          Revisar disponibilidad de compra
        </Link>
        <div className="summary-trust">
          <span>Sin cobro en esta vista</span>
          <span>Respaldo postventa GreenBel</span>
        </div>
      </aside>
    </section>
  );
}

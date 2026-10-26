import type { CartLine, CartTotals } from "@/domain/entities/cart";

export function calculateCartTotals(lines: CartLine[]): CartTotals {
  let subtotalCents = 0;
  for (const line of lines) {
    const amount = calculateCartLineTotal(line);
    if (
      amount === null ||
      !Number.isSafeInteger(subtotalCents + Math.round(amount * 100))
    )
      return { subtotal: null, shipping: null, discount: 0, total: null };
    subtotalCents += Math.round(amount * 100);
  }
  const subtotal = subtotalCents / 100;
  return {
    subtotal,
    shipping: null,
    discount: 0,
    // Product total only. Shipping is arranged separately during WhatsApp assistance.
    total: subtotal,
  };
}

export function calculateCartLineTotal(line: CartLine): number | null {
  const price = line.product.price;
  if (
    price === null ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isSafeInteger(line.quantity) ||
    line.quantity < 1
  )
    return null;
  const cents = Math.round(price * 100) * line.quantity;
  return Number.isSafeInteger(cents) ? cents / 100 : null;
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

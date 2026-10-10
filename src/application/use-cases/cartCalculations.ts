import type { CartLine, CartTotals } from "@/domain/entities/cart";

export function calculateCartTotals(lines: CartLine[]): CartTotals {
  let subtotal: number | null = 0;
  for (const line of lines) {
    if (line.product.price === null) {
      subtotal = null;
      break;
    }
    subtotal += line.product.price * line.quantity;
  }

  return {
    subtotal,
    shipping: null,
    discount: 0,
    total: null
  };
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

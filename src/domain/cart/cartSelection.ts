/** Technical bounds for a browser selection and the public restore endpoint. */
import type { CartLine } from "../entities/cart";
import type { Product } from "../entities/product";

export const MAX_CART_LINES = 50;
export const MAX_CART_QUANTITY = 999;
export const MAX_PRODUCT_ID_LENGTH = 120;

export type StoredCartLine = { productId: string; quantity: number };

export function selectionQuantity(quantity: number, stock: number | null): number {
  const requested = Number.isFinite(quantity) ? Math.max(1, Math.min(MAX_CART_QUANTITY, Math.trunc(quantity))) : 1;
  return stock === null ? requested : Math.min(requested, Math.max(1, stock));
}

export function resolveCartSelection(selection: StoredCartLine[], products: Product[]): { lines: CartLine[]; missingIds: string[] } {
  const found = new Map(products.map((product) => [product.id, product]));
  const lines: CartLine[] = [];
  const missingIds: string[] = [];
  for (const selected of selection) {
    const product = found.get(selected.productId);
    if (product) lines.push({ product, quantity: selectionQuantity(selected.quantity, product.stock) });
    else missingIds.push(selected.productId);
  }
  return { lines, missingIds };
}

export function parseCartSelection(value: unknown): StoredCartLine[] | null {
  if (!Array.isArray(value) || value.length > MAX_CART_LINES) return null;
  const seen = new Set<string>();
  const lines: StoredCartLine[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const { productId, quantity } = entry as Record<string, unknown>;
    if (
      typeof productId !== "string" ||
      productId.length === 0 ||
      productId.length > MAX_PRODUCT_ID_LENGTH ||
      !/^[a-zA-Z0-9_-]+$/.test(productId) ||
      seen.has(productId) ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_CART_QUANTITY
    ) return null;
    seen.add(productId);
    lines.push({ productId, quantity });
  }
  return lines;
}

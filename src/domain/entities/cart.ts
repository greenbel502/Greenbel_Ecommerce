import type { Product } from "./product";

export type CartLine = {
  product: Product;
  quantity: number;
};

export type CartTotals = {
  subtotal: number | null;
  shipping: number | null;
  discount: number;
  total: number | null;
};

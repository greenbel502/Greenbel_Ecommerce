import type { CartLine } from "../entities/cart";

/** Stable browser selection marker for keeping a private quote tied to this cart. */
export function quoteSelectionSignature(lines: readonly CartLine[]): string {
  const pairs = lines.map((line) => [line.product.id, line.quantity] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(pairs);
}

import { calculateOfferPrice, type OfferInput } from "../pricing/offer.ts";
import { validateQuoteDocument, type QuoteDocumentSnapshot } from "./quote-document.ts";

export type ServerCatalogQuoteItem = Readonly<{
  id: string;
  sku: string;
  name: string;
  regularPrice: string | null;
  activeOffer: OfferInput | null;
  availableQuantity: number | null;
}>;

export type QuoteSelection = Readonly<{ productId: string; quantity: number }>;

const HUNDRED = BigInt(100);
const MAX_MONEY_CENTS = BigInt("99999999999999");

function toCents(value: string): bigint {
  if (!/^(0|[1-9]\d{0,11})\.\d{2}$/.test(value)) throw new Error("Precio de catálogo inválido.");
  const [whole, decimal] = value.split(".");
  return BigInt(whole) * HUNDRED + BigInt(decimal);
}

function fromCents(value: bigint): string {
  if (value < BigInt(0) || value > MAX_MONEY_CENTS) throw new Error("El total excede el rango admitido.");
  return `${value / HUNDRED}.${(value % HUNDRED).toString().padStart(2, "0")}`;
}

/** Build only from products freshly read by the server; the browser sends IDs and quantities. */
export function buildPendingDeliveryQuote(input: {
  reference: string;
  issuedAt: string;
  customerName: string;
  customerEmail: string | null;
  selection: readonly QuoteSelection[];
  catalog: readonly ServerCatalogQuoteItem[];
}): QuoteDocumentSnapshot {
  if (input.selection.length === 0 || input.selection.length > 200) throw new Error("La selección de cotización no es válida.");
  const catalog = new Map(input.catalog.map((product) => [product.id, product]));
  const selectedIds = new Set<string>();
  let merchandise = BigInt(0);

  const lines = input.selection.map((selected) => {
    if (selectedIds.has(selected.productId)) throw new Error("Producto repetido en la cotización.");
    selectedIds.add(selected.productId);
    if (!Number.isSafeInteger(selected.quantity) || selected.quantity < 1 || selected.quantity > 100000) {
      throw new Error("Cantidad de cotización inválida.");
    }
    const product = catalog.get(selected.productId);
    if (!product) throw new Error("Producto no disponible para cotizar.");
    if (product.regularPrice === null) throw new Error("Precio próximamente: este producto aún no admite cotización monetaria.");
    if (product.availableQuantity === null || !Number.isSafeInteger(product.availableQuantity) || product.availableQuantity < selected.quantity) {
      throw new Error("La disponibilidad no permite emitir esta cotización todavía.");
    }
    const offer = product.activeOffer
      ? calculateOfferPrice(product.regularPrice, product.activeOffer)
      : { regular: product.regularPrice, final: product.regularPrice, discount: "0.00" };
    const lineTotal = fromCents(toCents(offer.final) * BigInt(selected.quantity));
    merchandise += toCents(lineTotal);
    return {
      sku: product.sku,
      name: product.name,
      quantity: selected.quantity,
      regularUnitPrice: offer.regular,
      discountPerUnit: offer.discount,
      finalUnitPrice: offer.final,
      lineTotal
    };
  });

  const snapshot: QuoteDocumentSnapshot = {
    version: 1,
    reference: input.reference,
    issuedAt: input.issuedAt,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    currency: "GTQ",
    lines,
    merchandiseTotal: fromCents(merchandise),
    includedVatAmount: null,
    delivery: { status: "pending", amount: null, description: "El transporte se definirá antes de confirmar una compra." },
    customerTotal: null
  };
  validateQuoteDocument(snapshot);
  return snapshot;
}

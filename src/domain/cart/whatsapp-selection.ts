import type { Product } from "../entities/product";
import type { StoredCartLine } from "./cartSelection";
import {
  whatsAppPreferenceLabels,
  type WhatsAppPreferences,
} from "./whatsapp-preferences";

/** Selecting a priced product for an adviser does not reserve or confirm stock. */
export function canRequestByWhatsApp(product: Product): boolean {
  return (
    !product.isMockPrice &&
    product.price !== null &&
    Number.isFinite(product.price) &&
    product.price > 0 &&
    product.availability !== "unavailable" &&
    product.stock !== 0
  );
}
export type WhatsAppSelectionDocument = {
  reference: string;
  issuedAt: string;
  lines: {
    name: string;
    sku: string;
    quantity: number;
    unitCents: number;
    totalCents: number;
    availabilityPending: boolean;
  }[];
  subtotalCents: number;
  preferences: WhatsAppPreferences;
};
export function buildWhatsAppSelection(
  selection: StoredCartLine[],
  products: Product[],
  reference: string,
  issuedAt: string,
  preferences: WhatsAppPreferences,
): WhatsAppSelectionDocument {
  whatsAppPreferenceLabels(preferences);
  if (!selection.length || selection.length > 50)
    throw Error("Agrega productos al carrito.");
  const found = new Map(products.map((p) => [p.id, p])),
    seen = new Set<string>();
  let subtotalCents = 0;
  const lines = selection.map(({ productId, quantity }) => {
    const product = found.get(productId);
    if (
      seen.has(productId) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 999
    )
      throw Error("Revisa las cantidades seleccionadas.");
    seen.add(productId);
    if (!product || !canRequestByWhatsApp(product))
      throw Error(
        "Un producto cambió o ya no está disponible. Actualiza el carrito.",
      );
    if (product.stock !== null && quantity > product.stock)
      throw Error("Cambió la cantidad disponible. Actualiza el carrito.");
    const unitCents = Math.round(product.price! * 100),
      totalCents = unitCents * quantity;
    if (
      !Number.isSafeInteger(unitCents) ||
      unitCents <= 0 ||
      !Number.isSafeInteger(totalCents)
    )
      throw Error("No se pudo comprobar el precio del producto.");
    subtotalCents += totalCents;
    if (!Number.isSafeInteger(subtotalCents))
      throw Error("El importe excede el rango permitido.");
    return {
      name: product.name,
      sku: product.sku,
      quantity,
      unitCents,
      totalCents,
      availabilityPending:
        product.availability === "unknown" ||
        (product.stock === null && product.availability !== "available"),
    };
  });
  return { reference, issuedAt, lines, subtotalCents, preferences };
}
export function whatsAppSelectionUrl(
  number: string,
  reference: string,
  itemCount: number,
  fileName: string,
  preferences: WhatsAppPreferences,
  productTotalCents: number,
): string {
  if (!/^[1-9]\d{7,14}$/.test(number))
    throw Error("El número de WhatsApp no está disponible.");
  if (!Number.isSafeInteger(productTotalCents) || productTotalCents <= 0)
    throw Error("El total de productos no es válido.");
  const labels = whatsAppPreferenceLabels(preferences);
  const message = `Hola, GreenBel. Me interesa comprar los ${itemCount} productos de mi selección ${reference}.\nTotal de productos: Q ${(productTotalCents / 100).toFixed(2)}.\nForma de pago: ${labels.payment}.\nMétodo de entrega: ${labels.delivery}.\nAdjuntaré el PDF ${fileName} para coordinar mi compra.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

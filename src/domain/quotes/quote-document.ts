export type QuoteDocumentLine = Readonly<{
  sku: string;
  name: string;
  quantity: number;
  regularUnitPrice: string;
  discountPerUnit: string;
  finalUnitPrice: string;
  lineTotal: string;
}>;

export type QuoteDocumentSnapshot = Readonly<{
  version: 1;
  reference: string;
  issuedAt: string;
  customerName: string;
  customerEmail: string | null;
  currency: "GTQ";
  lines: readonly QuoteDocumentLine[];
  merchandiseTotal: string;
  /** Informational VAT amount within merchandise prices; never added to the total. */
  includedVatAmount: string | null;
  delivery: Readonly<{
    status: "included" | "excluded" | "pending";
    amount: string | null;
    description: string | null;
  }>;
  customerTotal: string | null;
}>;

const MAX_MONEY_CENTS = BigInt("99999999999999");
const HUNDRED = BigInt(100);

function cents(value: string, field: string): bigint {
  if (!/^(0|[1-9]\d{0,11})\.\d{2}$/.test(value)) {
    throw new Error(`${field} requiere un importe decimal con dos posiciones.`);
  }
  const [whole, decimal] = value.split(".");
  const parsed = BigInt(whole) * HUNDRED + BigInt(decimal);
  if (parsed > MAX_MONEY_CENTS) throw new Error(`${field} excede el rango admitido.`);
  return parsed;
}

function requiredText(value: string, field: string, maxLength: number): void {
  if (!value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${field} no es válido.`);
  }
}

/** Accepts only an immutable server snapshot; browser prices and totals are never authoritative. */
export function validateQuoteDocument(snapshot: QuoteDocumentSnapshot): void {
  if (snapshot.version !== 1) throw new Error("Versión de cotización no admitida.");
  requiredText(snapshot.reference, "La referencia", 48);
  requiredText(snapshot.customerName, "El nombre", 160);
  if (snapshot.customerEmail !== null) {
    requiredText(snapshot.customerEmail, "El correo", 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(snapshot.customerEmail)) {
      throw new Error("El correo de la cotización no es válido.");
    }
  }
  if (snapshot.currency !== "GTQ") throw new Error("La moneda debe ser GTQ.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.issuedAt) || Number.isNaN(Date.parse(snapshot.issuedAt))) {
    throw new Error("La fecha de emisión no es válida.");
  }
  if (snapshot.lines.length === 0 || snapshot.lines.length > 200) throw new Error("La cotización requiere entre 1 y 200 líneas.");

  let merchandise = BigInt(0);
  for (const [index, line] of snapshot.lines.entries()) {
    requiredText(line.sku, `El SKU de la línea ${index + 1}`, 80);
    requiredText(line.name, `El nombre de la línea ${index + 1}`, 200);
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100000) {
      throw new Error(`La cantidad de la línea ${index + 1} no es válida.`);
    }
    const regular = cents(line.regularUnitPrice, "Precio regular");
    const discount = cents(line.discountPerUnit, "Descuento");
    const final = cents(line.finalUnitPrice, "Precio final");
    const total = cents(line.lineTotal, "Total de línea");
    if (regular <= BigInt(0) || discount >= regular || final <= BigInt(0) || regular - discount !== final || final * BigInt(line.quantity) !== total) {
      throw new Error(`Los importes de la línea ${index + 1} no concilian.`);
    }
    merchandise += total;
  }
  if (merchandise !== cents(snapshot.merchandiseTotal, "Subtotal de mercancía")) {
    throw new Error("El subtotal no concilia con las líneas.");
  }

  const includedVat = snapshot.includedVatAmount === null ? null : cents(snapshot.includedVatAmount, "IVA incluido");
  if (includedVat !== null && includedVat > merchandise) throw new Error("El IVA incluido excede el subtotal.");
  const delivery = snapshot.delivery;
  if (delivery.description !== null) requiredText(delivery.description, "La descripción de entrega", 240);
  if (delivery.status === "included") {
    if (delivery.amount === null) throw new Error("El costo incluido de entrega debe estar definido.");
  } else if (delivery.status === "excluded" || delivery.status === "pending") {
    if (delivery.amount !== null) throw new Error("No se puede fijar un cargo de entrega desconocido o externo.");
  } else {
    throw new Error("Estado de entrega no válido.");
  }

  if (delivery.status === "included" && snapshot.customerTotal === null) {
    throw new Error("El total final debe constar cuando la entrega está definida.");
  }

  if (snapshot.customerTotal !== null) {
    if (delivery.status !== "included" || delivery.amount === null) {
      throw new Error("El total final exige entrega definida.");
    }
    if (cents(snapshot.customerTotal, "Total final") !== merchandise + cents(delivery.amount, "Entrega")) {
      throw new Error("El total final no concilia.");
    }
  }
}

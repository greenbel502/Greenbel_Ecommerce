/** Decimal-only preview. Callers must supply fresh server prices and verified delivery terms. */
export type KnownDeliveryCharge =
  | Readonly<{ kind: "pickup" }>
  | Readonly<{ kind: "own_delivery"; shippingFee: string; collector: "greenbel" }>
  | Readonly<{ kind: "external"; shippingFee: string; collector: "greenbel" | "carrier" }>;

export type KnownCheckoutTotal = Readonly<{
  currency: "GTQ";
  merchandiseTotal: string;
  shippingFee: string;
  shippingChargeMode: "pickup" | "included" | "carrier_collects";
  amountDueGreenbel: string;
  amountDueCarrierShipping: string;
  customerTotal: string;
  includedIvaAmount: null;
}>;

const MAX_CENTS = BigInt("99999999999999"); // numeric(14,2)
const HUNDRED = BigInt(100);

function cents(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,11})\.\d{2}$/.test(value)) {
    throw new Error(`${label} debe ser un importe GTQ conocido con dos decimales.`);
  }
  const [whole, fraction] = value.split(".");
  const result = BigInt(whole) * HUNDRED + BigInt(fraction);
  if (result > MAX_CENTS) throw new Error(`${label} excede el rango admitido.`);
  return result;
}

function amount(value: bigint): string {
  if (value < BigInt(0) || value > MAX_CENTS) throw new Error("El total excede el rango admitido.");
  return `${value / HUNDRED}.${(value % HUNDRED).toString().padStart(2, "0")}`;
}

/** Prices include IVA. No additional tax is charged or inferred here. */
export function calculateKnownCheckoutTotal(merchandiseTotal: string, delivery: KnownDeliveryCharge): KnownCheckoutTotal {
  const merchandise = cents(merchandiseTotal, "Los productos");
  if (merchandise === BigInt(0)) throw new Error("Los productos deben tener un total positivo.");
  const shipping = delivery.kind === "pickup" ? BigInt(0) : cents(delivery.shippingFee, "El transporte");
  const carrierShipping = delivery.kind === "external" && delivery.collector === "carrier" ? shipping : BigInt(0);
  const greenbel = merchandise + shipping - carrierShipping;
  const total = greenbel + carrierShipping;
  return {
    currency: "GTQ",
    merchandiseTotal: amount(merchandise),
    shippingFee: amount(shipping),
    shippingChargeMode: delivery.kind === "pickup" ? "pickup" : delivery.kind === "external" && delivery.collector === "carrier" ? "carrier_collects" : "included",
    amountDueGreenbel: amount(greenbel),
    amountDueCarrierShipping: amount(carrierShipping),
    customerTotal: amount(total),
    includedIvaAmount: null
  };
}

/** Requires a new review whenever server-calculated prices or delivery terms change. */
export function assertAcceptedCheckoutReview(
  current: KnownCheckoutTotal,
  currentRevision: number,
  acceptedTotal: unknown,
  acceptedRevision: unknown
): void {
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 1
      || acceptedRevision !== currentRevision || acceptedTotal !== current.customerTotal) {
    throw new Error("El total o las condiciones cambiaron; revisa y acepta de nuevo.");
  }
}

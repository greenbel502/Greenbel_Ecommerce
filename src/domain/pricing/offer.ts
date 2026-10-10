export type OfferInput =
  | Readonly<{ kind: "fixed_price"; value: string }>
  | Readonly<{ kind: "percentage"; value: string }>;

export type OfferPrice = Readonly<{
  regular: string;
  final: string;
  discount: string;
}>;

const MAX_MONEY_CENTS = BigInt("99999999999999"); // numeric(14,2)
const HUNDRED = BigInt(100);
const TEN_THOUSAND = BigInt(10000);

function parseHundredths(value: string, label: string): bigint {
  if (!/^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value)) {
    throw new Error(`${label} debe tener como máximo dos decimales.`);
  }
  const [whole, decimal = ""] = value.split(".");
  const hundredths = BigInt(whole) * HUNDRED + BigInt(decimal.padEnd(2, "0"));
  if (hundredths > MAX_MONEY_CENTS) throw new Error(`${label} excede el rango admitido.`);
  return hundredths;
}

function formatHundredths(value: bigint): string {
  return `${value / HUNDRED}.${(value % HUNDRED).toString().padStart(2, "0")}`;
}

/** Exact decimal arithmetic for server-side offer snapshots; never accepts a browser total. */
export function calculateOfferPrice(regularPrice: string, offer: OfferInput): OfferPrice {
  const regularCents = parseHundredths(regularPrice, "El precio regular");
  if (regularCents <= BigInt(0)) throw new Error("El precio regular debe ser positivo.");

  let finalCents: bigint;
  if (offer.kind === "fixed_price") {
    finalCents = parseHundredths(offer.value, "El precio final");
  } else {
    const percentageHundredths = parseHundredths(offer.value, "El porcentaje");
    if (percentageHundredths <= BigInt(0) || percentageHundredths >= TEN_THOUSAND) {
      throw new Error("El porcentaje debe ser mayor que cero y menor que cien.");
    }
    finalCents = (regularCents * (TEN_THOUSAND - percentageHundredths) + BigInt(5000)) / TEN_THOUSAND;
  }

  if (finalCents <= BigInt(0) || finalCents >= regularCents) {
    throw new Error("El precio de oferta debe ser positivo y menor al regular.");
  }
  return {
    regular: formatHundredths(regularCents),
    final: formatHundredths(finalCents),
    discount: formatHundredths(regularCents - finalCents)
  };
}

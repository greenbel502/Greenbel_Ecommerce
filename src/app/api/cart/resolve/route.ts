import { NextResponse } from "next/server";
import { getProducts } from "@/application/use-cases/getProducts";
import { parseCartSelection } from "@/domain/cart/cartSelection";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const NO_STORE = { "Cache-Control": "no-store" };

async function readLimitedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return body + decoder.decode();
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
}

export async function POST(request: Request) {
  let body: string | null;
  try {
    body = await readLimitedBody(request);
  } catch {
    return NextResponse.json({ error: "No se pudo leer la selección." }, { status: 400, headers: NO_STORE });
  }
  if (body === null) {
    return NextResponse.json({ error: "La selección excede el tamaño permitido." }, { status: 413, headers: NO_STORE });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Selección inválida." }, { status: 400, headers: NO_STORE });
  }
  const selection = parseCartSelection(
    typeof parsed === "object" && parsed !== null && "lines" in parsed ? parsed.lines : undefined
  );
  if (!selection) {
    return NextResponse.json({ error: "Selección inválida." }, { status: 400, headers: NO_STORE });
  }
  if (selection.length === 0) {
    return NextResponse.json({ products: [], missingIds: [] }, { headers: NO_STORE });
  }

  try {
    // getProducts reads the published catalog. In Supabase mode it uses the anon key and RLS.
    const ids = new Set(selection.map((line) => line.productId));
    const products = (await getProducts()).filter((product) => ids.has(product.id));
    const foundIds = new Set(products.map((product) => product.id));
    const missingIds = selection.map((line) => line.productId).filter((id) => !foundIds.has(id));
    return NextResponse.json({ products, missingIds }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "No se pudo consultar el catálogo. Intenta de nuevo." },
      { status: 503, headers: NO_STORE }
    );
  }
}

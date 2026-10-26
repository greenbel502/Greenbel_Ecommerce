import { NextResponse } from "next/server";
import { getProducts } from "@/application/use-cases/getProducts";
import { publicProductSearchResults } from "@/lib/products/public-search";
import { resolveAppEnvironment } from "@/lib/server/environment-policy";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  if (params.getAll("q").length > 1 || query.length > 120)
    return NextResponse.json(
      { error: "La búsqueda es demasiado larga." },
      { status: 400, headers },
    );
  try {
    // Official repository: anonymous RLS, current effective prices and public images.
    const products = await getProducts({ query });
    return NextResponse.json(
      {
        products: publicProductSearchResults(
          products,
          resolveAppEnvironment(process.env),
        ),
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo consultar el catálogo. Inténtalo de nuevo." },
      { status: 503, headers },
    );
  }
}

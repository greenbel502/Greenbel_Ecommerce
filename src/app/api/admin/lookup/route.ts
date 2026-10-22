import { NextResponse } from "next/server";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { searchTerm } from "@/lib/admin-list";
const entities = {
  products: {
    table: "products",
    columns: "id,name,sku",
    search: ["name", "sku"],
  },
  brands: { table: "brands", columns: "id,name", search: ["name"] },
  categories: { table: "categories", columns: "id,name", search: ["name"] },
  services: {
    table: "delivery_services",
    columns: "id,name",
    search: ["name"],
  },
  zones: {
    table: "delivery_zones",
    columns: "id,name,code",
    search: ["name", "code"],
  },
};
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const key = params.get("entity") as keyof typeof entities;
    if (!Object.hasOwn(entities, key))
      return NextResponse.json(
        { error: "Selección no disponible." },
        { status: 400 },
      );
    await requireStaffActor(
      key === "products" ? ["admin", "operator"] : ["admin"],
    );
    const config = entities[key],
      q = searchTerm((params.get("q") || "").slice(0, 120));
    let query = createSupabaseAdminClient()
      .from(config.table)
      .select(config.columns)
      .order("name")
      .order("id")
      .limit(21);
    if (q)
      query = query.or(config.search.map((c) => `${c}.ilike.%${q}%`).join(","));
    if (
      key === "products" &&
      ["part", "equipment"].includes(params.get("kind") || "")
    )
      query = query.eq("kind", params.get("kind"));
    if (key === "products" && params.get("published") === "true")
      query = query.eq("publication_status", "published");
    if (key === "categories" && params.get("active") === "true")
      query = query.eq("active", true);
    const result = await query;
    if (result.error) throw new Error("Lookup unavailable");
    const rows = result.data as unknown as {
      id: string;
      name: string;
      sku?: string;
      code?: string;
    }[];
    return NextResponse.json(
      {
        items: rows
          .slice(0, 20)
          .map((row) => ({
            id: row.id,
            label: `${row.sku || row.code ? `${row.sku || row.code} · ` : ""}${row.name}`,
          })),
        hasMore: rows.length > 20,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof StaffAuthorizationError
        ? error.reason === "unauthenticated"
          ? 401
          : error.reason === "forbidden"
            ? 403
            : 503
        : 503;
    return NextResponse.json(
      { error: "No se pudo cargar la selección." },
      { status },
    );
  }
}

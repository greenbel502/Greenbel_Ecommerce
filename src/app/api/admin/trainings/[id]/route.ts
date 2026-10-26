import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    await requireStaffActor(["admin"]);
  } catch {
    return NextResponse.json(
      { error: "No tienes permiso para consultar esta capacitación." },
      { status: 403, headers },
    );
  }
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return NextResponse.json(
      { error: "Capacitación no válida." },
      { status: 400, headers },
    );
  try {
    const admin = createSupabaseAdminClient(),
      signal = AbortSignal.timeout(8000);
    const [row, pl, cl] = await Promise.all([
      admin
        .from("trainings")
        .select(
          "id,title,slug,description,video_url,video_storage_path,cover_path,publication_status,created_at",
        )
        .eq("id", id)
        .abortSignal(signal)
        .maybeSingle(),
      admin
        .from("training_products")
        .select("training_id,product_id")
        .eq("training_id", id)
        .abortSignal(signal),
      admin
        .from("training_categories")
        .select("training_id,category_id")
        .eq("training_id", id)
        .abortSignal(signal),
    ]);
    if (row.error || pl.error || cl.error) throw Error();
    if (!row.data)
      return NextResponse.json(
        { error: "Capacitación no encontrada." },
        { status: 404, headers },
      );
    const [p, c] = await Promise.all([
      pl.data.length
        ? admin
            .from("products")
            .select("id,name,sku")
            .in(
              "id",
              pl.data.map((r) => r.product_id),
            )
            .abortSignal(signal)
        : Promise.resolve({ data: [], error: null }),
      cl.data.length
        ? admin
            .from("categories")
            .select("id,name")
            .in(
              "id",
              cl.data.map((r) => r.category_id),
            )
            .abortSignal(signal)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (p.error || c.error) throw Error();
    return NextResponse.json(
      {
        training: row.data,
        productLinks: pl.data,
        categoryLinks: cl.data,
        products: p.data,
        categories: c.data,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudieron cargar los detalles. Inténtalo de nuevo." },
      { status: 503, headers },
    );
  }
}

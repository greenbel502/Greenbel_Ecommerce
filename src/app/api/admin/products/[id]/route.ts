import { NextResponse } from "next/server";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readProductEditorData } from "@/lib/server/product-editor-data";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return NextResponse.json(
      { error: "Producto no disponible." },
      { status: 404, headers },
    );
  try {
    await requireStaffActor(["admin"]);
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(8_000),
    ]);
    const data = await readProductEditorData(
      createSupabaseAdminClient(),
      id.toLowerCase(),
      signal,
    );
    return data
      ? NextResponse.json(data, { headers })
      : NextResponse.json(
          { error: "Producto no disponible." },
          { status: 404, headers },
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
      { error: "No se pudieron cargar las fotografías y los detalles." },
      { status, headers },
    );
  }
}

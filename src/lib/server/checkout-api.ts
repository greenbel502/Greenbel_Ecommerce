import "server-only";

import { NextResponse } from "next/server";
import { isAllowedSubmissionOrigin, readLimitedBody } from "@/lib/server/public-submission";
import { createSupabaseActionClient } from "@/lib/supabase/server";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export function checkoutJson(body: object, status: number) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

export async function checkoutRequestBody(request: Request): Promise<unknown | NextResponse> {
  if (!isAllowedSubmissionOrigin(request)) return checkoutJson({ error: "Origen no permitido." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return checkoutJson({ error: "Envía la solicitud en formato JSON." }, 415);
  }
  try {
    const raw = await readLimitedBody(request, 16_384);
    if (raw === null) return checkoutJson({ error: "La solicitud excede el tamaño permitido." }, 413);
    return JSON.parse(raw);
  } catch {
    return checkoutJson({ error: "Solicitud inválida." }, 400);
  }
}

export async function checkoutSession(): Promise<
  | { client: Awaited<ReturnType<typeof createSupabaseActionClient>>; userId: string }
  | { response: NextResponse }
> {
  try {
    const client = await createSupabaseActionClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError?.name === "AuthSessionMissingError") {
      return { response: checkoutJson({ error: "Inicia sesión para revisar la compra." }, 401) };
    }
    if (authError) return { response: checkoutJson({ error: "No pudimos comprobar tu sesión." }, 503) };
    if (!auth.user) return { response: checkoutJson({ error: "Inicia sesión para revisar la compra." }, 401) };
    const { data: profile, error: profileError } = await client.from("profiles")
      .select("active").eq("id", auth.user.id).maybeSingle();
    if (profileError) return { response: checkoutJson({ error: "No pudimos verificar tu cuenta." }, 503) };
    if (profile?.active !== true) return { response: checkoutJson({ error: "Esta cuenta no puede comprar." }, 403) };
    return { client, userId: auth.user.id };
  } catch {
    return { response: checkoutJson({ error: "La compra no está disponible ahora." }, 503) };
  }
}

export function checkoutDatabaseError(code: string | undefined): NextResponse {
  switch (code) {
    case "22023":
      return checkoutJson({ error: "Revisa tu selección y datos de compra." }, 400);
    case "42501":
      return checkoutJson({ error: "No tienes acceso a esta revisión o tu cuenta no puede comprar." }, 403);
    case "23505":
      return checkoutJson({ error: "Esta clave ya se utilizó con una compra diferente. Actualiza y vuelve a revisar." }, 409);
    case "P0001":
      return checkoutJson({ error: "Cambió el precio, el inventario o una condición de entrega o pago. Revisa el total de nuevo." }, 409);
    case "P0002":
      return checkoutJson({ error: "No hay una configuración disponible para esta combinación de entrega y pago." }, 422);
    default:
      return checkoutJson({ error: "No pudimos confirmar la operación. Reintenta la misma solicitud antes de iniciar otra." }, 503);
  }
}

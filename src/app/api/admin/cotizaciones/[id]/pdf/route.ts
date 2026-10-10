import { z } from "zod";
import { privateQuotePdfResponse, readVerifiedQuotePdf } from "@/lib/server/private-quote-pdf";
import { StaffAuthorizationError, requireStaffActor } from "@/lib/server/staff-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function json(body: object, status: number) {
  return Response.json(body, { status, headers: NO_STORE });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    if (error instanceof StaffAuthorizationError && error.reason === "unauthenticated") {
      return new Response(null, { status: 303, headers: {
        ...NO_STORE,
        Location: new URL("/cuenta/ingresar", request.url).toString()
      } });
    }
    if (error instanceof StaffAuthorizationError && error.reason === "forbidden") {
      return json({ error: "Documento no disponible." }, 404);
    }
    return json({ error: "No se pudo verificar el acceso." }, 503);
  }

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return json({ error: "Documento no disponible." }, 404);
  try {
    const { bytes, reference } = await readVerifiedQuotePdf(id);
    return privateQuotePdfResponse(bytes, reference);
  } catch {
    return json({ error: "Documento no disponible." }, 503);
  }
}

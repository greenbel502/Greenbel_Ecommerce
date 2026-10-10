import { createHash } from "node:crypto";
import { z } from "zod";
import { privateQuotePdfResponse, readVerifiedQuotePdf } from "@/lib/server/private-quote-pdf";
import { isAllowedSubmissionOrigin, readLimitedBody } from "@/lib/server/public-submission";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const schema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

function json(body: object, status: number) {
  return Response.json(body, { status, headers: NO_STORE });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAllowedSubmissionOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return json({ error: "Documento no disponible." }, 404);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Solicitud inválida." }, 415);
  }
  let token: string;
  try {
    const raw = await readLimitedBody(request, 1024);
    if (raw === null) return json({ error: "Solicitud inválida." }, 413);
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return json({ error: "Solicitud inválida." }, 400);
    token = parsed.data.token;
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  try {
    const client = createSupabaseAdminClient();
    const digest = createHash("sha256").update(token).digest("hex");
    const { data: authorized, error: grantError } = await client.rpc("consume_guest_access_grant", {
      p_token_sha256: digest,
      p_quote_id: id,
      p_financing_request_id: null
    });
    if (grantError) return json({ error: "Documento no disponible." }, 503);
    if (authorized !== true) return json({ error: "Acceso no válido o vencido." }, 403);

    const { bytes, reference } = await readVerifiedQuotePdf(id);
    return privateQuotePdfResponse(bytes, reference);
  } catch {
    return json({ error: "Documento no disponible." }, 503);
  }
}

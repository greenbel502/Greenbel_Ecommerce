import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessEmailDeliveryMode } from "@/lib/server/environment";
import { isAllowedSubmissionOrigin, readLimitedBody } from "@/lib/server/public-submission";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const CONSENT_VERSION = "draft-share-v1";
const schema = z.object({
  idempotencyKey: z.uuid(),
  quoteId: z.uuid(),
  quoteAccessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  applicantName: z.string().trim().min(2).max(160)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  phone: z.string().trim().min(8).max(40).nullable(),
  message: z.string().trim().min(1).max(500).nullable(),
  consent: z.literal(true)
}).strict();

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!isAllowedSubmissionOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Envía la solicitud en formato JSON." }, 415);
  }
  let input: z.infer<typeof schema>;
  try {
    const raw = await readLimitedBody(request, 8_192);
    if (raw === null) return json({ error: "La solicitud excede el tamaño permitido." }, 413);
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return json({ error: "Revisa los datos del borrador." }, 400);
    input = parsed.data;
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  try {
    getBusinessEmailDeliveryMode();
    const fingerprint = createHash("sha256").update(JSON.stringify({
      quoteId: input.quoteId,
      applicantName: input.applicantName,
      email: input.email,
      phone: input.phone,
      message: input.message,
      consentVersion: CONSENT_VERSION
    })).digest("hex");
    const tokenHash = createHash("sha256").update(input.quoteAccessToken).digest("hex");
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("create_financing_draft", {
      p_idempotency_key: input.idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_quote_id: input.quoteId,
      p_token_sha256: tokenHash,
      p_applicant_name: input.applicantName,
      p_email: input.email,
      p_phone: input.phone,
      p_message: input.message,
      p_consent_version: CONSENT_VERSION
    }).single();
    if (error?.code === "P4030") return json({ error: "El acceso a la cotización venció o no es válido." }, 403);
    if (error?.code === "P4090") return json({ error: "La clave de este borrador ya se utilizó con otros datos." }, 409);
    if (error || !data || typeof data !== "object" || !("financing_id" in data)
      || typeof data.financing_id !== "string" || !("repeated" in data)
      || typeof data.repeated !== "boolean") {
      return json({ error: "No se pudo guardar el borrador. Inténtalo de nuevo." }, 503);
    }
    return json({ status: "draft_recorded", verification: "pending", delivery: "disabled" }, data.repeated ? 200 : 201);
  } catch {
    return json({ error: "No se pudo guardar el borrador. Inténtalo de nuevo." }, 503);
  }
}

import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  deliverContactNotification,
  logGmailFailure,
} from "@/lib/gmail/deliver";
import {
  abuseSourceHash,
  isAllowedSubmissionOrigin,
  readLimitedBody,
} from "@/lib/server/public-submission";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 8_192;
const NO_STORE = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const PERSISTENCE_ERROR = "No se pudo guardar la consulta. Inténtalo de nuevo.";
const singleLine = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));

const schema = z
  .object({
    website: z.string().max(0).optional(),
    idempotencyKey: z.uuid(),
    name: singleLine(2, 160),
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    phone: singleLine(8, 40).optional().nullable(),
    type: singleLine(1, 120).optional().nullable(),
    product: singleLine(1, 160).optional().nullable(),
    message: z
      .string()
      .trim()
      .min(10)
      .max(5000)
      .refine(
        (value) =>
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      ),
  })
  .strict();

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  try {
    if (!isAllowedSubmissionOrigin(request))
      return json({ error: "Origen no permitido." }, 403);
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      return json({ error: "Envía la consulta en formato JSON." }, 415);
    }

    const raw = await readLimitedBody(request, MAX_BODY_BYTES);
    if (raw === null)
      return json({ error: "La consulta excede el tamaño permitido." }, 413);
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return json({ error: "Consulta inválida." }, 400);
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      return json({ error: "Revisa los datos de la consulta." }, 400);

    const contact = parsed.data;
    const normalized = {
      name: contact.name,
      email: contact.email,
      phone: contact.phone ?? null,
      inquiry_type: contact.type ?? null,
      product: contact.product ?? null,
      message: contact.message,
    };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex");
    const sourceHash = abuseSourceHash(request, "contact");
    if (!sourceHash) return json({ error: PERSISTENCE_ERROR }, 503);
    const client = createSupabaseAdminClient();
    const { data, error } = await client
      .rpc("record_contact_message", {
        p_idempotency_key: contact.idempotencyKey,
        p_request_fingerprint: fingerprint,
        p_source_hash: sourceHash,
        p_name: normalized.name,
        p_email: normalized.email,
        p_phone: normalized.phone,
        p_inquiry_type: normalized.inquiry_type,
        p_product: normalized.product,
        p_message: normalized.message,
      })
      .single();

    if (
      !error &&
      data &&
      typeof data === "object" &&
      "contact_id" in data &&
      typeof data.contact_id === "string" &&
      "repeated" in data &&
      typeof data.repeated === "boolean"
    ) {
      // Gmail failure must never replace a confirmed persistence receipt.
      const contactId = data.contact_id;
      try {
        after(async () => {
          await deliverContactNotification(contactId);
        });
      } catch {
        logGmailFailure(contactId, "delivery_scheduling_failed");
      }
      return json({ status: "recorded" }, data.repeated ? 200 : 201);
    }
    if (error?.code === "P4090") {
      return json(
        { error: "La clave de esta consulta ya se utilizó con otros datos." },
        409,
      );
    }
    if (error?.code === "P4290") {
      return json(
        {
          error:
            "Se alcanzó el límite temporal de consultas. Inténtalo más tarde.",
        },
        429,
      );
    }
    return json({ error: PERSISTENCE_ERROR }, 503);
  } catch {
    // Never expose privileged keys, database details, or submitted contact data.
    return json({ error: PERSISTENCE_ERROR }, 503);
  }
}

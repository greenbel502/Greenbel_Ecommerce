import { createHash } from "node:crypto";
import { z } from "zod";
import {
  FINANCING_CONSENT,
  financeRpc,
  requireFinancingAccount,
  FinancingError,
} from "@/lib/financing/workflow";
import {
  financeInput,
  financingJson,
  financingFailure,
} from "@/lib/financing/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z
  .object({
    idempotencyKey: z.uuid(),
    quoteId: z.uuid(),
    quoteAccessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    applicantName: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v)),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s-]{8,40}$/)
      .nullable(),
    message: z.string().trim().min(1).max(500).nullable(),
    consent: z.literal(true),
  })
  .strict();
export async function POST(request: Request) {
  try {
    const { user } = await requireFinancingAccount();
    const a = await financeInput(request, schema);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          userId: user.id,
          quoteId: a.quoteId,
          name: a.applicantName,
          email: user.email!.toLowerCase(),
          phone: a.phone,
          message: a.message,
          consentVersion: FINANCING_CONSENT,
        }),
      )
      .digest("hex");
    const result = await financeRpc("financing_account_create", {
      p_user_id: user.id,
      p_idempotency_key: a.idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_quote_id: a.quoteId,
      p_token_sha256: createHash("sha256")
        .update(a.quoteAccessToken)
        .digest("hex"),
      p_applicant_name: a.applicantName,
      p_phone: a.phone,
      p_message: a.message,
    });
    if (!result?.[0]?.financing_id) throw new FinancingError("P5030");
    return financingJson(
      { status: "prepared", id: result[0].financing_id },
      result[0].repeated ? 200 : 201,
    );
  } catch (e) {
    return financingFailure(e);
  }
}

import "server-only";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  requireCustomerProfile,
  CustomerProfileError,
} from "@/lib/server/customer-profile";
import { readVerifiedQuotePdf } from "@/lib/server/private-quote-pdf";
import {
  buildFinancingMime,
  type FinancingNotification,
} from "@/lib/gmail/financing-message";
import { sendFinancingMail } from "@/lib/gmail/financing-delivery";
export const FINANCING_CONSENT = "finance-account-v3";
export const FINANCING_LOGIN =
  "/cuenta/ingresar?next=%2Ffinanciamiento%23solicitud&reason=financiamiento";
export class FinancingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export async function requireFinancingAccount() {
  const account = await requireCustomerProfile();
  if (!account.user.email || !account.user.email_confirmed_at)
    throw new CustomerProfileError(403);
  return account;
}
export async function financeRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await createSupabaseAdminClient().rpc(name, args);
  if (error) throw new FinancingError(error.code);
  return data;
}
export const accessSchema = z.object({ id: z.uuid() });
export async function financingState(id: string, userId: string) {
  return financeRpc("financing_account_state", { p_id: id, p_user_id: userId });
}
export async function deliverFinancing(
  a: { id: string; userId: string } | { id: string; actorId: string },
) {
  const claim = await financeRpc("financing_account_claim", {
    p_id: a.id,
    p_user_id: "userId" in a ? a.userId : null,
    p_actor_id: "actorId" in a ? a.actorId : null,
  });
  if (!claim) return "not_claimed";
  if (claim.status !== "claimed") return String(claim.status);
  const outcome = await sendFinancingMail(async (sender) => {
    const document = await readVerifiedQuotePdf(claim.quoteId);
    if (document.reference !== claim.application.quoteReference)
      throw Error("pdf_reference_mismatch");
    return buildFinancingMime(
      claim.application as FinancingNotification,
      sender,
      claim.recipient,
      document.bytes,
    );
  });
  const finish = () =>
    financeRpc("financing_notification_finish", {
      p_id: a.id,
      p_attempt_id: claim.attemptId,
      p_status: outcome.status,
      p_message_id: outcome.messageId,
      p_error_code: outcome.errorCode,
    });
  try {
    if ((await finish()) !== true) throw Error("ack_conflict");
  } catch {
    // A retry here acknowledges only the database; never retransmit a possibly accepted email.
    try {
      if ((await finish()) !== true) throw Error("ack_conflict");
    } catch {
      console.error("gmail_financing_notification", {
        id: a.id,
        code: "delivery_ack_pending",
      });
      return "unknown";
    }
  }
  if (outcome.status !== "sent")
    console.error("gmail_financing_notification", {
      id: a.id,
      code: outcome.errorCode,
    });
  return outcome.status;
}

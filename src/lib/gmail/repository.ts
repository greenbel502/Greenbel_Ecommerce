import "server-only";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ContactNotification } from "./message";

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await createSupabaseAdminClient().rpc(name, args);
  if (error) throw Error("gmail_storage_unavailable");
  return data;
}
const connectionSchema = z.object({
  refresh_token_ciphertext: z.string().min(40).max(18000),
  sender_email: z.email(),
  client_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  scopes: z.array(z.string()),
  revision: z.uuid(),
  connected_at: z.string(),
  status: z.enum(["connected", "reconnect_required"]),
  last_error_code: z.string().nullable(),
});
export async function readGmailConnection() {
  const data = await rpc("gmail_connection_read");
  return data ? connectionSchema.parse(data) : null;
}
export async function saveGmailConnection(input: {
  ciphertext: string;
  senderEmail: string;
  clientFingerprint: string;
  actorId: string;
  revision: string | null;
}) {
  return z.uuid().parse(
    await rpc("gmail_connection_save", {
      p_refresh_token_ciphertext: input.ciphertext,
      p_sender_email: input.senderEmail,
      p_client_fingerprint: input.clientFingerprint,
      p_actor_id: input.actorId,
      p_expected_revision: input.revision,
    }),
  );
}
export async function requireGmailReconnect(
  revision: string,
  errorCode: string,
) {
  await rpc("gmail_connection_require_reconnect", {
    p_revision: revision,
    p_error_code: errorCode,
  });
}
export async function claimContactNotification(id: string, retry: boolean) {
  const data = await rpc("gmail_notification_claim", {
    p_contact_id: id,
    p_retry: retry,
  });
  if (!data) return null;
  const claim = z
    .object({
      attempt_id: z.uuid(),
      contact: z.object({
        id: z.uuid(),
        name: z.string(),
        email: z.email(),
        phone: z.string().nullable(),
        inquiry_type: z.string().nullable(),
        product: z.string().nullable(),
        message: z.string(),
        created_at: z.string(),
      }),
    })
    .parse(data);
  return claim as { attempt_id: string; contact: ContactNotification };
}
export async function finishContactNotification(
  id: string,
  attemptId: string,
  status: "sent" | "failed" | "unknown",
  messageId: string | null,
  errorCode: string | null,
) {
  const result = await rpc("gmail_notification_finish", {
    p_contact_id: id,
    p_attempt_id: attemptId,
    p_status: status,
    p_message_id: messageId,
    p_error_code: errorCode,
  });
  if (result !== true) throw Error("gmail_notification_conflict");
}
const notificationSchema = z.object({
  contact_id: z.uuid(),
  status: z.enum(["pending", "sending", "sent", "failed", "unknown"]),
  attempts: z.number().int(),
  next_retry_at: z.string().nullable(),
  last_attempt_at: z.string().nullable(),
  last_error_code: z.string().nullable(),
});
export type NotificationStatus = z.infer<typeof notificationSchema>;
export async function readContactNotificationStates(
  ids: string[],
): Promise<NotificationStatus[]> {
  if (!ids.length) return [];
  return z
    .array(notificationSchema)
    .parse(await rpc("gmail_notification_status", { p_contact_ids: ids }));
}

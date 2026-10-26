import "server-only";
import { gmail } from "googleapis/build/src/apis/gmail";
import { gmailConfig, GMAIL_SCOPE } from "./config";
import { unseal } from "./crypto";
import { gmailOAuth } from "./oauth";
import { buildContactMime } from "./message";
import {
  claimContactNotification,
  finishContactNotification,
  readGmailConnection,
  requireGmailReconnect,
} from "./repository";

export type DeliveryResult =
  "sent" | "failed" | "unknown" | "not_claimed" | "unavailable";
/** Log only a controlled code and internal reference, never Google errors or request/token objects. */
export function logGmailFailure(contactId: string | null, code: string) {
  console.error("gmail_contact_notification", { contactId, code });
}
export function classifyGmailFailure(error: unknown, sendStarted: boolean) {
  const err = error as {
    response?: { status?: number; data?: { error?: unknown } };
  };
  const status = err?.response?.status;
  const revoked =
    err?.response?.data?.error === "invalid_grant" || status === 401;
  if (revoked)
    return {
      status: "failed" as const,
      code: "authorization_revoked",
      reconnect: true,
    };
  if (!sendStarted)
    return {
      status: "failed" as const,
      code: "preparation_failed",
      reconnect: false,
    };
  // A provider rejection is safe to retry; a lost/5xx response may have accepted the message.
  if (status && [400, 403, 404, 413, 429].includes(status))
    return {
      status: "failed" as const,
      code: status === 429 ? "quota_exceeded" : "gmail_rejected",
      reconnect: false,
    };
  return {
    status: "unknown" as const,
    code: "delivery_unconfirmed",
    reconnect: false,
  };
}

export async function deliverContactNotification(
  id: string,
  retry = false,
): Promise<DeliveryResult> {
  let claim: Awaited<ReturnType<typeof claimContactNotification>> = null;
  let connection: Awaited<ReturnType<typeof readGmailConnection>> = null;
  let sendStarted = false;
  let acceptedId: string | null = null;
  try {
    const config = gmailConfig();
    claim = await claimContactNotification(id, retry);
    if (!claim) return "not_claimed";
    connection = await readGmailConnection();
    if (
      !connection ||
      connection.status !== "connected" ||
      connection.sender_email !== config.senderEmail ||
      connection.client_fingerprint !== config.clientFingerprint ||
      connection.scopes.length !== 1 ||
      connection.scopes[0] !== GMAIL_SCOPE
    )
      throw Error("gmail_connection_invalid");
    const oauth = gmailOAuth(config);
    oauth.setCredentials({
      refresh_token: unseal(
        connection.refresh_token_ciphertext,
        config.encryptionKey,
        config.tokenContext,
      ),
    });
    // Refresh before send: failures in this stage cannot have delivered a message.
    await oauth.getAccessToken();
    const raw = Buffer.from(
      buildContactMime(
        claim.contact,
        config.senderEmail,
        config.notificationEmail,
      ),
    ).toString("base64url");
    sendStarted = true;
    const response = await gmail({
      version: "v1",
      auth: oauth,
    }).users.messages.send(
      {
        userId: config.senderEmail,
        requestBody: { raw },
        fields: "id",
      },
      { timeout: 15_000, retry: false },
    );
    acceptedId = response.data.id ?? null;
    if (!acceptedId || !/^[A-Za-z0-9_-]{1,200}$/.test(acceptedId))
      throw Error("gmail_acknowledgement_missing");
    await finishContactNotification(
      id,
      claim.attempt_id,
      "sent",
      acceptedId,
      null,
    );
    return "sent";
  } catch (error) {
    if (!claim) {
      logGmailFailure(id, "configuration_or_storage_unavailable");
      return "unavailable";
    }
    if (acceptedId) {
      // Retry only the idempotent database acknowledgement, NEVER messages.send.
      try {
        await finishContactNotification(
          id,
          claim.attempt_id,
          "sent",
          acceptedId,
          null,
        );
        return "sent";
      } catch {
        logGmailFailure(id, "accepted_delivery_ack_pending");
        return "unknown";
      }
    }
    const outcome = classifyGmailFailure(error, sendStarted);
    try {
      await finishContactNotification(
        id,
        claim.attempt_id,
        outcome.status,
        null,
        outcome.code,
      );
      if (outcome.reconnect && connection)
        await requireGmailReconnect(connection.revision, outcome.code);
    } catch {
      logGmailFailure(id, "delivery_state_unconfirmed");
    }
    logGmailFailure(id, outcome.code);
    return outcome.status;
  }
}

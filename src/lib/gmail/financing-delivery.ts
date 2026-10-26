import "server-only";
import { gmail } from "googleapis/build/src/apis/gmail";
import { gmailConfig, GMAIL_SCOPE } from "./config";
import { unseal } from "./crypto";
import { gmailOAuth } from "./oauth";
import { readGmailConnection, requireGmailReconnect } from "./repository";
import { classifyGmailFailure } from "./deliver";

/** No retries around messages.send: an ambiguous response must never send a second email. */
export async function sendFinancingMail(
  build: (sender: string) => Promise<string> | string,
) {
  let started = false;
  let connection: Awaited<ReturnType<typeof readGmailConnection>> = null;
  try {
    const config = gmailConfig();
    connection = await readGmailConnection();
    if (
      !connection ||
      connection.status !== "connected" ||
      connection.sender_email !== config.senderEmail ||
      connection.client_fingerprint !== config.clientFingerprint ||
      connection.scopes.length !== 1 ||
      connection.scopes[0] !== GMAIL_SCOPE
    )
      throw Error("connection_unavailable");
    const oauth = gmailOAuth(config);
    oauth.setCredentials({
      refresh_token: unseal(
        connection.refresh_token_ciphertext,
        config.encryptionKey,
        config.tokenContext,
      ),
    });
    await oauth.getAccessToken();
    const raw = Buffer.from(await build(config.senderEmail)).toString(
      "base64url",
    );
    started = true;
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
    if (!response.data.id || !/^[A-Za-z0-9_-]{1,200}$/.test(response.data.id))
      throw Error("missing_ack");
    return {
      status: "sent" as const,
      messageId: response.data.id,
      errorCode: null,
    };
  } catch (error) {
    const result = classifyGmailFailure(error, started);
    if (result.reconnect && connection) {
      try {
        await requireGmailReconnect(connection.revision, result.code);
      } catch {
        /* controlled outcome below */
      }
    }
    return { status: result.status, messageId: null, errorCode: result.code };
  }
}

import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getActiveEnvironment } from "@/lib/server/environment";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_STATE_COOKIE = "greenbel_gmail_oauth";
export const GMAIL_CALLBACK_PATH = "/api/integrations/gmail/callback";
export const GMAIL_VARIABLES = [
  "GOOGLE_GMAIL_CLIENT_ID",
  "GOOGLE_GMAIL_CLIENT_SECRET",
  "GOOGLE_GMAIL_REDIRECT_URI",
  "GMAIL_SENDER_EMAIL",
  "GMAIL_NOTIFICATION_EMAIL",
  "GMAIL_TOKEN_ENCRYPTION_KEY",
] as const;

export function missingGmailVariables() {
  return GMAIL_VARIABLES.filter((key) => !process.env[key]?.trim());
}
export function gmailConfig() {
  if (missingGmailVariables().length)
    throw Error("gmail_configuration_missing");
  const env = getActiveEnvironment();
  const senderEmail = z
    .email()
    .max(254)
    .parse(process.env.GMAIL_SENDER_EMAIL?.trim().toLowerCase());
  const notificationEmail = z
    .email()
    .max(254)
    .parse(process.env.GMAIL_NOTIFICATION_EMAIL?.trim().toLowerCase());
  const redirect = new URL(process.env.GOOGLE_GMAIL_REDIRECT_URI!.trim());
  if (
    !env.appUrl ||
    redirect.origin !== new URL(env.appUrl).origin ||
    redirect.pathname !== GMAIL_CALLBACK_PATH ||
    redirect.search ||
    redirect.hash ||
    redirect.username ||
    redirect.password ||
    (redirect.protocol !== "https:" &&
      !(
        env.appEnvironment === "DEV" &&
        redirect.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(redirect.hostname)
      ))
  )
    throw Error("gmail_redirect_invalid");
  const rawKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY!.trim();
  const encryptionKey = Buffer.from(rawKey, "base64");
  if (
    encryptionKey.length !== 32 ||
    encryptionKey.toString("base64") !== rawKey
  )
    throw Error("gmail_encryption_key_invalid");
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID!.trim();
  const clientFingerprint = createHash("sha256").update(clientId).digest("hex");
  return {
    senderEmail,
    notificationEmail,
    clientId,
    clientSecret: process.env.GOOGLE_GMAIL_CLIENT_SECRET!.trim(),
    redirectUri: redirect.href,
    origin: redirect.origin,
    secureCookies: redirect.protocol === "https:",
    encryptionKey,
    clientFingerprint,
    tokenContext: `gmail-refresh-v1:${env.appEnvironment}:${env.supabase.url}:${clientFingerprint}:${senderEmail}`,
    stateContext: `gmail-state-v1:${env.appEnvironment}:${redirect.origin}:${clientFingerprint}`,
  };
}
export type GmailConfig = ReturnType<typeof gmailConfig>;

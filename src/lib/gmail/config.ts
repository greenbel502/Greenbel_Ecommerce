import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getActiveEnvironment } from "@/lib/server/environment";
import type { AppEnvironment } from "@/lib/server/environment-policy";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_STATE_COOKIE = "greenbel_gmail_oauth";
export const GMAIL_CALLBACK_PATH = "/api/integrations/gmail/callback";
export function gmailVariableNames(environment: AppEnvironment) {
  return {
    clientId: `GOOGLE_GMAIL_${environment}_CLIENT_ID`,
    clientSecret: `GOOGLE_GMAIL_${environment}_CLIENT_SECRET`,
    redirectUri: `GOOGLE_GMAIL_${environment}_REDIRECT_URI`,
    senderEmail: `GMAIL_SENDER_${environment}_EMAIL`,
    notificationEmail: `GMAIL_NOTIFICATION_${environment}_EMAIL`,
    encryptionKey: "GMAIL_TOKEN_ENCRYPTION_KEY",
  } as const;
}

export function missingGmailVariables() {
  const { appEnvironment } = getActiveEnvironment();
  return Object.values(gmailVariableNames(appEnvironment)).filter(
    (key) => !process.env[key]?.trim(),
  );
}
export function gmailConfig() {
  const env = getActiveEnvironment();
  const variables = gmailVariableNames(env.appEnvironment);
  if (Object.values(variables).some((key) => !process.env[key]?.trim()))
    throw Error("gmail_configuration_missing");
  const value = (key: string) => process.env[key]!.trim();
  const senderEmail = z
    .email()
    .max(254)
    .parse(value(variables.senderEmail).toLowerCase());
  const notificationEmail = z
    .email()
    .max(254)
    .parse(value(variables.notificationEmail).toLowerCase());
  const redirect = new URL(value(variables.redirectUri));
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
  const rawKey = value(variables.encryptionKey);
  const encryptionKey = Buffer.from(rawKey, "base64");
  if (
    encryptionKey.length !== 32 ||
    encryptionKey.toString("base64") !== rawKey
  )
    throw Error("gmail_encryption_key_invalid");
  const clientId = value(variables.clientId);
  const clientFingerprint = createHash("sha256").update(clientId).digest("hex");
  return {
    senderEmail,
    notificationEmail,
    clientId,
    clientSecret: value(variables.clientSecret),
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

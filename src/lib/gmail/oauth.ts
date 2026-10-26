import "server-only";
// Load only Gmail from the official library, rather than every Google API.
import { auth } from "googleapis/build/src/apis/gmail";
import { CodeChallengeMethod } from "google-auth-library";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { GMAIL_SCOPE, type GmailConfig } from "./config";
import { sameSecret, seal, unseal } from "./crypto";

export function gmailOAuth(config: GmailConfig) {
  return new auth.OAuth2({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    eagerRefreshThresholdMillis: 60_000,
    transporterOptions: { timeout: 10_000, retry: false },
  });
}
const stateSchema = z
  .object({
    state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    actorId: z.uuid(),
    issuedAt: z.number().int(),
    revision: z.uuid().nullable(),
  })
  .strict();

export function prepareGmailAuthorization(
  config: GmailConfig,
  actorId: string,
  revision: string | null,
) {
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(32).toString("base64url");
  const payload = stateSchema.parse({
    state,
    verifier,
    actorId,
    issuedAt: Date.now(),
    revision,
  });
  return {
    cookie: seal(
      JSON.stringify(payload),
      config.encryptionKey,
      config.stateContext,
    ),
    url: gmailOAuth(config).generateAuthUrl({
      scope: [GMAIL_SCOPE],
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: false,
      login_hint: config.senderEmail,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: CodeChallengeMethod.S256,
    }),
  };
}
export function validateGmailState(
  config: GmailConfig,
  cookie: string,
  state: string,
  actorId: string,
  now = Date.now(),
) {
  const value = stateSchema.parse(
    JSON.parse(unseal(cookie, config.encryptionKey, config.stateContext)),
  );
  if (
    !sameSecret(value.state, state) ||
    value.actorId !== actorId ||
    now < value.issuedAt ||
    now - value.issuedAt > 600_000
  )
    throw Error("gmail_state_invalid");
  return value;
}

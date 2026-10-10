import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type GuestResourceKind = "quote" | "financing_request";

export type GuestGrant = Readonly<{
  resourceKind: GuestResourceKind;
  resourceId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
}>;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

/** Store only the hash. Return the raw token once to the guest through a private response. */
export function createGuestAccessToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashGuestAccessToken(token) };
}

export function hashGuestAccessToken(token: string): string {
  if (!TOKEN_PATTERN.test(token) || Buffer.from(token, "base64url").length !== 32 || Buffer.from(token, "base64url").toString("base64url") !== token) {
    throw new Error("Token de acceso inválido.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The caller must fetch one grant by resource and enforce any use or rate limits in storage. */
export function verifyGuestAccessToken(
  grant: GuestGrant,
  resourceKind: GuestResourceKind,
  resourceId: string,
  token: string,
  now: Date = new Date()
): boolean {
  if (grant.resourceKind !== resourceKind || grant.resourceId !== resourceId || grant.revokedAt !== null) return false;
  if (!HASH_PATTERN.test(grant.tokenHash) || Number.isNaN(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= now.getTime()) return false;
  let candidate: string;
  try {
    candidate = hashGuestAccessToken(token);
  } catch {
    return false;
  }
  return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(grant.tokenHash, "hex"));
}

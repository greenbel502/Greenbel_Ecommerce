import assert from "node:assert/strict";
import test from "node:test";
import { createGuestAccessToken, hashGuestAccessToken, verifyGuestAccessToken } from "../src/lib/server/guest-access.ts";

test("el acceso de invitado exige token impredecible ligado al recurso y vencimiento", () => {
  const first = createGuestAccessToken();
  const second = createGuestAccessToken();
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(hashGuestAccessToken(first.token), first.tokenHash);

  const grant = {
    resourceKind: "quote",
    resourceId: "quote-1",
    tokenHash: first.tokenHash,
    expiresAt: "2026-10-01T00:00:00Z",
    revokedAt: null
  };
  const now = new Date("2026-09-30T00:00:00Z");
  assert.equal(verifyGuestAccessToken(grant, "quote", "quote-1", first.token, now), true);
  assert.equal(verifyGuestAccessToken(grant, "quote", "quote-2", first.token, now), false);
  assert.equal(verifyGuestAccessToken(grant, "financing_request", "quote-1", first.token, now), false);
  assert.equal(verifyGuestAccessToken(grant, "quote", "quote-1", second.token, now), false);
  assert.equal(verifyGuestAccessToken(grant, "quote", "quote-1", first.token, new Date("2026-10-01T00:00:00Z")), false);
  assert.equal(verifyGuestAccessToken({ ...grant, revokedAt: "2026-09-30T00:00:00Z" }, "quote", "quote-1", first.token, now), false);
  assert.equal(verifyGuestAccessToken(grant, "quote", "quote-1", "invalid", now), false);
});

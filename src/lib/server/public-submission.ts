import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { getActiveEnvironment, getActiveSupabaseSecretKey } from "./environment";

const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

export function isAllowedSubmissionOrigin(request: Request): boolean {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;
  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }
  if (origin.origin !== originHeader || origin.username || origin.password) return false;
  const activeAppUrl = getActiveEnvironment().appUrl;
  const requestUrl = new URL(request.url);
  if (!activeAppUrl) return origin.origin === requestUrl.origin;
  if (origin.origin === new URL(activeAppUrl).origin) return true;
  if (!LOOPBACK_HOST.test(new URL(activeAppUrl).host)) return false;
  return [request.headers.get("x-forwarded-host"), request.headers.get("host")]
    .some((host) => host && LOOPBACK_HOST.test(host) && origin.host === host && origin.protocol === requestUrl.protocol);
}

export async function readLimitedBody(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return body + decoder.decode();
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
}

/** Returns null when there is no trusted ingress source; never trusts a local client IP header. */
export function abuseSourceHash(request: Request, scope: "contact" | "quote" | "financing" | "chat"): string | null {
  let source: string;
  if (process.env.VERCEL === "1") {
    // Vercel overwrites this ingress header, so the client cannot choose its quota key.
    source = request.headers.get("x-vercel-forwarded-for")?.trim() ?? "";
    if (isIP(source) === 0) return null;
  } else if (process.env.NODE_ENV !== "production") {
    // Local development has no trusted ingress IP. One shared durable quota is intentional.
    source = "local-development";
  } else {
    // Chat can run on any Next host. Without a verified ingress header use a
    // conservative shared quota; never accept a caller-supplied IP as identity.
    if (scope !== "chat") return null;
    source = "shared-untrusted-production-ingress";
  }
  return createHmac("sha256", getActiveSupabaseSecretKey())
    .update(`greenbel-${scope}-rate-v1\0`)
    .update(source)
    .digest("hex");
}

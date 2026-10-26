import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import {
  gmailConfig,
  GMAIL_STATE_COOKIE,
  GMAIL_SCOPE,
} from "@/lib/gmail/config";
import { gmailOAuth, validateGmailState } from "@/lib/gmail/oauth";
import { seal } from "@/lib/gmail/crypto";
import { saveGmailConnection } from "@/lib/gmail/repository";
export const runtime = "nodejs",
  dynamic = "force-dynamic";
export async function GET(request: Request) {
  let config;
  try {
    config = gmailConfig();
  } catch {
    return NextResponse.json(
      { error: "La configuración de Gmail no está disponible." },
      { status: 503 },
    );
  }
  function back(code: string) {
    const url = new URL("/admin/consultas", config!.origin);
    url.searchParams.set("gmail", code);
    const response = NextResponse.redirect(url, 303);
    response.cookies.set(GMAIL_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: config!.secureCookies,
      path: "/api/integrations/gmail",
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  try {
    const actor = await requireStaffActor(["admin"]),
      query = new URL(request.url).searchParams;
    const cookie = (await cookies()).get(GMAIL_STATE_COOKIE)?.value;
    if (
      !cookie ||
      query.getAll("state").length !== 1 ||
      query.getAll("code").length > 1 ||
      query.getAll("error").length > 1
    )
      return back("state_invalid");
    const flow = validateGmailState(
      config,
      cookie,
      query.get("state") ?? "",
      actor.userId,
    );
    if (query.has("error")) return back("authorization_denied");
    const code = query.get("code");
    if (!code || code.length > 4096) return back("authorization_failed");
    const oauth = gmailOAuth(config);
    const { tokens } = await oauth.getToken({
      code,
      codeVerifier: flow.verifier,
      redirect_uri: config.redirectUri,
    });
    if (!tokens.refresh_token || !tokens.access_token)
      return back("refresh_missing");
    const scopes =
      tokens.scope?.split(/\s+/).filter(Boolean) ??
      (await oauth.getTokenInfo(tokens.access_token)).scopes;
    if (scopes.length !== 1 || scopes[0] !== GMAIL_SCOPE)
      return back("scope_invalid");
    await saveGmailConnection({
      ciphertext: seal(
        tokens.refresh_token,
        config.encryptionKey,
        config.tokenContext,
      ),
      senderEmail: config.senderEmail,
      clientFingerprint: config.clientFingerprint,
      actorId: actor.userId,
      revision: flow.revision,
    });
    return back("connected");
  } catch {
    return back("authorization_failed");
  }
}

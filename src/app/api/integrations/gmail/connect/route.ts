import { NextResponse } from "next/server";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { isAllowedSubmissionOrigin } from "@/lib/server/public-submission";
import { gmailConfig, GMAIL_STATE_COOKIE } from "@/lib/gmail/config";
import { readGmailConnection } from "@/lib/gmail/repository";
import { prepareGmailAuthorization } from "@/lib/gmail/oauth";
export const runtime = "nodejs",
  dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!isAllowedSubmissionOrigin(request))
    return NextResponse.json(
      { error: "Origen no permitido." },
      { status: 403 },
    );
  try {
    const actor = await requireStaffActor(["admin"]),
      config = gmailConfig();
    const current = await readGmailConnection();
    const flow = prepareGmailAuthorization(
      config,
      actor.userId,
      current?.revision ?? null,
    );
    const response = request.headers.get("accept")?.includes("application/json")
      ? NextResponse.json({ authorizationUrl: flow.url })
      : NextResponse.redirect(flow.url, 303);
    response.cookies.set(GMAIL_STATE_COOKIE, flow.cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.secureCookies,
      path: "/api/integrations/gmail",
      maxAge: 600,
    });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    const status =
      error instanceof StaffAuthorizationError
        ? error.reason === "unauthenticated"
          ? 401
          : 403
        : 503;
    return NextResponse.json(
      {
        error:
          status === 503
            ? "No se pudo iniciar Gmail. Revisa la configuración administrativa."
            : "Se requiere una sesión administrativa activa.",
      },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import {
  isAllowedSubmissionOrigin,
  readLimitedBody,
} from "@/lib/server/public-submission";
import { deliverContactNotification } from "@/lib/gmail/deliver";
import { gmailConfig } from "@/lib/gmail/config";
export const runtime = "nodejs",
  dynamic = "force-dynamic",
  maxDuration = 60;
export async function POST(request: Request) {
  if (!isAllowedSubmissionOrigin(request))
    return NextResponse.json(
      { error: "Origen no permitido." },
      { status: 403 },
    );
  try {
    await requireStaffActor(["admin"]);
    const body = await readLimitedBody(request, 1024);
    if (body === null)
      return NextResponse.json(
        { error: "Solicitud inválida." },
        { status: 413 },
      );
    const data = request.headers
      .get("content-type")
      ?.startsWith("application/json")
      ? JSON.parse(body)
      : Object.fromEntries(new URLSearchParams(body));
    const parsed = z.object({ contactId: z.uuid() }).strict().safeParse(data);
    if (!parsed.success)
      return NextResponse.json(
        { error: "Solicitud inválida." },
        { status: 400 },
      );
    const result = await deliverContactNotification(
      parsed.data.contactId,
      true,
    );
    if (request.headers.get("accept")?.includes("application/json"))
      return NextResponse.json(
        { status: result },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const url = new URL("/admin/consultas", gmailConfig().origin);
    url.searchParams.set("gmail", `retry_${result}`);
    return NextResponse.redirect(url, 303);
  } catch (error) {
    return NextResponse.json(
      { error: "No se pudo procesar el reintento administrativo." },
      {
        status:
          error instanceof StaffAuthorizationError
            ? error.reason === "unauthenticated"
              ? 401
              : 403
            : 503,
      },
    );
  }
}

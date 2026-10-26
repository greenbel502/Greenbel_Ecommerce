import { NextResponse } from "next/server";
import {
  brandLogoResponse,
  BRAND_IMAGE_HEADERS,
} from "@/lib/server/brand-logo-response";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaffActor(["admin"]);
  } catch (error) {
    return new NextResponse(null, {
      status:
        error instanceof StaffAuthorizationError &&
        error.reason === "unavailable"
          ? 503
          : 403,
      headers: BRAND_IMAGE_HEADERS,
    });
  }
  return brandLogoResponse((await params).id, true);
}

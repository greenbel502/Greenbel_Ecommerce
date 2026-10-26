import { NextResponse } from "next/server";
import {
  requireStaffActor,
  StaffAuthorizationError,
} from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!IMAGE_ID.test(id))
    return new NextResponse(null, { status: 404, headers: HEADERS });
  try {
    // Draft media is private: authenticate and resolve current active staff privileges on every request.
    await requireStaffActor(["admin"]);
    const admin = createSupabaseAdminClient();
    const { data: image, error: readError } = await admin
      .from("product_images")
      .select("storage_path")
      .eq("id", id)
      .maybeSingle();
    if (readError)
      return new NextResponse(null, { status: 503, headers: HEADERS });
    if (!image)
      return new NextResponse(null, { status: 404, headers: HEADERS });

    const { data: file, error: downloadError } = await admin.storage
      .from("product-images")
      .download(image.storage_path);
    if (downloadError || !file)
      return new NextResponse(null, { status: 503, headers: HEADERS });
    if (
      !ALLOWED_MIME.has(file.type) ||
      file.size < 1 ||
      file.size > 8_000_000
    ) {
      return new NextResponse(null, { status: 503, headers: HEADERS });
    }
    return new NextResponse(file, {
      status: 200,
      headers: {
        ...HEADERS,
        "Content-Type": file.type,
        "Content-Length": String(file.size),
      },
    });
  } catch (error) {
    const status =
      error instanceof StaffAuthorizationError
        ? error.reason === "unauthenticated"
          ? 401
          : error.reason === "forbidden"
            ? 403
            : 503
        : 503;
    return new NextResponse(null, { status, headers: HEADERS });
  }
}

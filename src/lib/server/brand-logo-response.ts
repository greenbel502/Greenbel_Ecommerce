import "server-only";
import { NextResponse } from "next/server";
import {
  BRAND_LOGO_BUCKET,
  BRAND_LOGO_MAX_STORED,
  isBrandLogoPath,
} from "@/lib/brand-logo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const BRAND_IMAGE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function brandLogoResponse(id: string, preview: boolean) {
  const empty = (status: number) =>
    new NextResponse(null, { status, headers: BRAND_IMAGE_HEADERS });
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return empty(404);
  try {
    // The preview caller authorizes the administrator before reaching this helper.
    // Public metadata always passes through the existing active-brand RLS policy.
    const client = preview
      ? createSupabaseAdminClient()
      : createSupabasePublicClient();
    const { data: brand, error } = await client
      .from("brands")
      .select("id,logo_path")
      .eq("id", id)
      .maybeSingle();
    if (error) return empty(503);
    if (!brand || !isBrandLogoPath(brand.id, brand.logo_path))
      return empty(404);
    const { data: image, error: downloadError } =
      await createSupabaseAdminClient()
        .storage.from(BRAND_LOGO_BUCKET)
        .download(brand.logo_path);
    if (
      downloadError ||
      !image ||
      image.type !== "image/webp" ||
      image.size < 1 ||
      image.size > BRAND_LOGO_MAX_STORED
    )
      return empty(503);
    return new NextResponse(image, {
      headers: {
        ...BRAND_IMAGE_HEADERS,
        "Content-Type": "image/webp",
        "Content-Length": String(image.size),
      },
    });
  } catch {
    return empty(503);
  }
}

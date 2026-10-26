import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import {
  TRAINING_VIDEO_BUCKET,
  validTrainingVideoPath,
} from "@/lib/trainings/media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  if (!z.uuid().safeParse(rawId).success)
    return new NextResponse(null, { status: 404, headers });
  const id = rawId.toLowerCase();
  try {
    const pub = await createSupabasePublicClient()
      .from("catalog_trainings")
      .select("video_storage_path")
      .eq("id", id)
      .maybeSingle();
    if (pub.error) return new NextResponse(null, { status: 503, headers });
    let path = pub.data?.video_storage_path;
    const admin = createSupabaseAdminClient();
    if (!path) {
      try {
        await requireStaffActor(["admin"]);
      } catch {
        return new NextResponse(null, { status: 404, headers });
      }
      const row = await admin
        .from("trainings")
        .select("video_storage_path")
        .eq("id", id)
        .maybeSingle();
      path = row.data?.video_storage_path;
    }
    if (!path || !validTrainingVideoPath(id, path))
      return new NextResponse(null, { status: 404, headers });
    const range = request.headers.get("range");
    if (range && !/^bytes=\d*-\d*$/.test(range))
      return new NextResponse(null, { status: 416, headers });
    const signed = await admin.storage
      .from(TRAINING_VIDEO_BUCKET)
      .createSignedUrl(path, 60);
    if (signed.error) return new NextResponse(null, { status: 503, headers });
    const upstream = await fetch(signed.data.signedUrl, {
      headers: range ? { Range: range } : {},
      cache: "no-store",
      signal: request.signal,
    });
    if (![200, 206, 416].includes(upstream.status)) {
      await upstream.body?.cancel();
      return new NextResponse(null, { status: 404, headers });
    }
    const responseHeaders = new Headers({
      ...headers,
      "Content-Type": path.endsWith(".mp4") ? "video/mp4" : "video/webm",
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
    });
    for (const key of ["content-range", "content-length"]) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return new NextResponse(null, { status: 503, headers });
  }
}

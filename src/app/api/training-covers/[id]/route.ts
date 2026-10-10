import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffActor } from "@/lib/server/staff-authorization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const MIME: Record<string, string> = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif"
};

function missing() { return new NextResponse(null, { status: 404, headers: HEADERS }); }

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  if (!z.uuid().safeParse(rawId).success) return missing();
  const id = rawId.toLowerCase();
  let path: string | null = null;
  try {
    const publicClient = createSupabasePublicClient();
    const published = await publicClient.from("catalog_trainings")
      .select("cover_path").eq("id", id).maybeSingle();
    if (published.error) return missing();
    path = published.data?.cover_path ?? null;
    if (!path) {
      try {
        await requireStaffActor(["admin"]);
      } catch {
        return missing();
      }
      const admin = createSupabaseAdminClient();
      const draft = await admin.from("trainings").select("cover_path").eq("id", id).maybeSingle();
      if (draft.error) return missing();
      path = draft.data?.cover_path ?? null;
    }
    if (!path) return missing();
    const match = path.match(/^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/);
    if (!match || match[1] !== id) return missing();
    const admin = createSupabaseAdminClient();
    const downloaded = await admin.storage.from("training-covers").download(path);
    if (downloaded.error || !downloaded.data) return missing();
    return new NextResponse(await downloaded.data.arrayBuffer(), {
      status: 200,
      headers: { ...HEADERS, "Content-Type": MIME[match[2]], "Content-Disposition": "inline" }
    });
  } catch {
    return missing();
  }
}

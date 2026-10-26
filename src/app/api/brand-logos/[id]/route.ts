import { brandLogoResponse } from "@/lib/server/brand-logo-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return brandLogoResponse((await params).id, false);
}

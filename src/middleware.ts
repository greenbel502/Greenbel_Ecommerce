import { type NextRequest, NextResponse } from "next/server";
import { shouldUseSupabaseCatalog } from "@/lib/server/catalog-source";
import { refreshAuthSession } from "@/lib/supabase/middleware";
import { resolveAppEnvironment } from "@/lib/server/environment-policy";

export function middleware(request: NextRequest) {
  // Return a real 404 before streaming any production HTML for this internal demo.
  if (request.nextUrl.pathname === "/loader-demo" && resolveAppEnvironment(process.env) !== "DEV") {
    return new NextResponse(null, { status: 404, headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
  }
  // Product pages read the viewer's delivered purchases only with the real catalog.
  if (
    request.nextUrl.pathname.startsWith("/productos") &&
    !shouldUseSupabaseCatalog()
  ) {
    return NextResponse.next({ request });
  }
  return refreshAuthSession(request);
}

export const config = {
  matcher: [
    "/loader-demo",
    "/cuenta/:path*",
    "/auth/confirm",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/integrations/gmail/:path*",
    "/productos/:path*",
  ],
};

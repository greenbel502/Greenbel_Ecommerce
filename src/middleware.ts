import { type NextRequest, NextResponse } from "next/server";
import { shouldUseSupabaseCatalog } from "@/lib/server/catalog-source";
import { refreshAuthSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
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
    "/cuenta/:path*",
    "/auth/confirm",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/integrations/gmail/:path*",
    "/productos/:path*",
  ],
};

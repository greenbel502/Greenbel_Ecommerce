import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getActiveEnvironment } from "@/lib/server/environment";
import { authCookieOptions } from "@/lib/supabase/auth-cookie-options";

export async function GET(request: NextRequest) {
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/cuenta/ingresar?error=confirmacion" }
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");

  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!(code || (tokenHash && (type === "email" || type === "recovery")))) return response;

  const { url, publishableKey } = getActiveEnvironment().supabase;
  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      }
    }
  });

  try {
    const result = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type as "email" | "recovery" });
    if (!result.error && result.data.session && result.data.user) {
      const recovery = type === "recovery" || (code && request.nextUrl.searchParams.get("flow") === "recovery");
      response.headers.set("Location", recovery ? "/cuenta/restablecer"
        : request.nextUrl.searchParams.get("next") === "/checkout" ? "/checkout" : "/cuenta");
    }
  } catch {
    // Keep the fixed failure redirect; no token or auth error is logged.
  }

  return response;
}

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getActiveEnvironment } from "@/lib/server/environment";
import { authCookieOptions } from "@/lib/supabase/auth-cookie-options";
import { customerAuthDestination } from "@/lib/supabase/auth-navigation";

/** Google returns a single-use PKCE code, never a trusted role or customer ID. */
export async function GET(request: NextRequest) {
  const destination = customerAuthDestination(request.nextUrl.searchParams.get("next"));
  const retrySuffix = destination !== "/cuenta" ? `&next=${encodeURIComponent(destination)}` : "";
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/cuenta/ingresar?error=google${retrySuffix}`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer"
    }
  });
  const code = request.nextUrl.searchParams.get("code");
  if (!code || request.nextUrl.searchParams.has("error")) return response;

  try {
    const { url, publishableKey } = getActiveEnvironment().supabase;
    const supabase = createServerClient(url, publishableKey, {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies, headers) {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        }
      }
    });
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session || !data.user) return response;

    // Verify the identity remotely and use the profile/role provisioned by the DB trigger.
    // User-editable Google metadata must never grant staff access or reactivate a profile.
    const { data: verified, error: userError } = await supabase.auth.getUser();
    if (userError || !verified.user || verified.user.id !== data.user.id) {
      await supabase.auth.signOut({ scope: "local" });
      return response;
    }
    const [profile, role] = await Promise.all([
      supabase.from("profiles").select("active").eq("id", verified.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", verified.user.id).maybeSingle()
    ]);
    if (profile.error || role.error || !profile.data?.active || !["customer", "operator", "admin"].includes(role.data?.role ?? "")) {
      await supabase.auth.signOut({ scope: "local" });
      response.headers.set("Location", `/cuenta/ingresar?error=google_cuenta${retrySuffix}`);
      return response;
    }
    response.headers.set("Location", destination);
  } catch {
    // Do not log the authorization code, session, provider tokens or upstream details.
  }
  return response;
}

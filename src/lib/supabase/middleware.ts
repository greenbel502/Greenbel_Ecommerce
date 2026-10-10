import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getActiveEnvironment } from "@/lib/server/environment";
import { authCookieOptions } from "./auth-cookie-options";

const loopbackHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

function redirectBase(request: NextRequest, appUrl: string): string {
  const configured = new URL(appUrl);
  const requestHost = [request.headers.get("x-forwarded-host"), request.headers.get("host")]
    .find((host) => host && loopbackHost.test(host));
  // A local DEV server may run on a different port from DEV_APP_URL. Keep that
  // request origin only when both sides are explicitly loopback addresses.
  if (loopbackHost.test(configured.host) && requestHost) {
    return new URL(`${configured.protocol}//${requestHost}`).origin;
  }
  return configured.origin;
}

export async function refreshAuthSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const environment = getActiveEnvironment();
  const { url, publishableKey } = environment.supabase;

  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const nextResponse = NextResponse.next({ request });
        response.cookies.getAll().forEach((cookie) => nextResponse.cookies.set(cookie));
        for (const name of ["Cache-Control", "Expires", "Pragma"]) {
          const value = response.headers.get(name);
          if (value) nextResponse.headers.set(name, value);
        }
        response = nextResponse;
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      }
    }
  });

  // getUser verifies the token with Supabase Auth; getSession alone does not.
  const { data, error } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const protectedPath = path === "/cuenta" || path === "/cuenta/restablecer";
  const missingSession = !data.user && (!error || error.name === "AuthSessionMissingError");
  if (protectedPath && missingSession) {
    const destination = path === "/cuenta" ? "/cuenta/ingresar" : "/cuenta/recuperar";
    if (!environment.appUrl) {
      return new NextResponse("La URL de la aplicación no está configurada para Auth.", { status: 503 });
    }
    const redirect = NextResponse.redirect(new URL(destination, redirectBase(request, environment.appUrl)));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  return response;
}

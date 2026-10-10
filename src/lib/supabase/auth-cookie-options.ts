import type { CookieOptionsWithName } from "@supabase/ssr";
import { getActiveEnvironment } from "@/lib/server/environment";

/** Auth is handled only on the server; the browser never reads session cookies. */
export function authCookieOptions(): CookieOptionsWithName {
  const appUrl = getActiveEnvironment().appUrl;
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl ? new URL(appUrl).protocol === "https:" : process.env.NODE_ENV === "production",
    path: "/"
  };
}

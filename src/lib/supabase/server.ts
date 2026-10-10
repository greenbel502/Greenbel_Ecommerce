import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getActiveEnvironment } from "@/lib/server/environment";
import { authCookieOptions } from "./auth-cookie-options";

async function createClientWithCookies(writable: boolean) {
  const cookieStore = await cookies();
  const { url, publishableKey } = getActiveEnvironment().supabase;

  return createServerClient(url, publishableKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Server Components cannot write cookies; middleware refreshes them first.
        if (!writable) return;
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      }
    }
  });
}

/** Use only after auth middleware has refreshed the request cookies. */
export function createSupabaseReadClient() {
  return createClientWithCookies(false);
}

/** Server Actions and Route Handlers can write refreshed session cookies. */
export function createSupabaseActionClient() {
  return createClientWithCookies(true);
}

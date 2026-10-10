import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getActiveEnvironment } from "@/lib/server/environment";

/** Anonymous server client for public reads governed by Supabase RLS. */
export function createSupabasePublicClient() {
  const { url, publishableKey } = getActiveEnvironment().supabase;
  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

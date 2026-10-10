import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getActiveEnvironment, getActiveSupabaseSecretKey } from "@/lib/server/environment";

/** Privileged server client. Call only after validating a scoped server command. */
export function createSupabaseAdminClient() {
  const { url } = getActiveEnvironment().supabase;
  const secretKey = getActiveSupabaseSecretKey();
  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

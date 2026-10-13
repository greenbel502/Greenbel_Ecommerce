import "server-only";
import { createSupabaseActionClient } from "@/lib/supabase/server";

export class CustomerProfileError extends Error {
  constructor(readonly status: 401 | 403 | 503) { super("No se pudo comprobar tu cuenta."); }
}

export async function requireCustomerProfile() {
  const client = await createSupabaseActionClient();
  const { data, error } = await client.auth.getUser();
  if (error?.name === "AuthSessionMissingError" || !error && !data.user) throw new CustomerProfileError(401);
  if (error || !data.user) throw new CustomerProfileError(503);
  const profile = await client.from("profiles").select("id,display_name,phone,address_line,avatar_path,active,updated_at")
    .eq("id", data.user.id).maybeSingle();
  if (profile.error) throw new CustomerProfileError(503);
  if (!profile.data?.active) throw new CustomerProfileError(403);
  return { client, user: data.user, profile: profile.data };
}

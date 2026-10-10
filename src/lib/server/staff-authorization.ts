import "server-only";

import { createSupabaseReadClient } from "@/lib/supabase/server";

export type StaffRole = "operator" | "admin";

export type StaffActor = Readonly<{
  userId: string;
  role: StaffRole;
}>;

export class StaffAuthorizationError extends Error {
  constructor(readonly reason: "unauthenticated" | "forbidden" | "unavailable") {
    super(reason);
    this.name = "StaffAuthorizationError";
  }
}

/** Resolve the current Auth user and its database role on every privileged request. */
export async function requireStaffActor(allowedRoles: readonly StaffRole[]): Promise<StaffActor> {
  let client: Awaited<ReturnType<typeof createSupabaseReadClient>>;
  try {
    client = await createSupabaseReadClient();
  } catch {
    throw new StaffAuthorizationError("unavailable");
  }

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    throw new StaffAuthorizationError("unavailable");
  }
  const userId = authData.user?.id;
  if (!userId) throw new StaffAuthorizationError("unauthenticated");

  // This query uses the customer's session and the own-row RLS policy. Never trust user metadata.
  const [roleResult, profileResult] = await Promise.all([
    client.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    client.from("profiles").select("active").eq("id", userId).maybeSingle()
  ]);
  if (roleResult.error || profileResult.error) throw new StaffAuthorizationError("unavailable");
  if (profileResult.data?.active !== true) throw new StaffAuthorizationError("forbidden");
  const role = roleResult.data?.role;
  if (role !== "operator" && role !== "admin") {
    throw new StaffAuthorizationError("forbidden");
  }
  if (!allowedRoles.includes(role)) throw new StaffAuthorizationError("forbidden");
  return { userId, role };
}

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createSupabaseReadClient } from "@/lib/supabase/server";

export const CHAT_COOKIE = "greenbel-chat-session";
export class ChatFailure extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super("chat_unavailable");
  }
}
export async function readChatIdentity() {
  const client = await createSupabaseReadClient();
  const { data, error } = await client.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError")
    throw new ChatFailure(
      503,
      "No pudimos comprobar tu sesión. Inténtalo nuevamente.",
    );
  const userId = data.user?.id ?? null;
  if (userId) {
    const profile = await client
      .from("profiles")
      .select("active")
      .eq("id", userId)
      .maybeSingle();
    if (profile.error)
      throw new ChatFailure(503, "No pudimos comprobar tu cuenta.");
    if (!profile.data?.active)
      throw new ChatFailure(
        403,
        "Esta cuenta no está activa para usar el chat.",
      );
  }
  const current = (await cookies()).get(CHAT_COOKIE)?.value;
  const token =
    current && /^[A-Za-z0-9_-]{43}$/.test(current)
      ? current
      : randomBytes(32).toString("base64url");
  return {
    client,
    userId,
    token,
    hash: createHash("sha256").update(token).digest("hex"),
    identityHash: createHash("sha256")
      .update(userId ? `account:${userId}` : `visitor:${token}`)
      .digest("hex"),
  };
}

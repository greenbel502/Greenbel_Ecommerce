import { googleAvatarUrl, googleDisplayName } from "@/domain/account/profile";
import type { HeaderAccount } from "@/domain/account/header-account";
import { CustomerProfileError, requireCustomerProfile } from "@/lib/server/customer-profile";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Robots-Tag": "noindex", "X-Content-Type-Options": "nosniff" };

/** No user identifier is accepted from the browser. Never return tokens or metadata. */
export async function GET() {
  try {
    const { client, user, profile } = await requireCustomerProfile();
    const role = await client.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    const staffEntry: HeaderAccount["staffEntry"] = role.error ? null
      : role.data?.role === "admin" ? { href: "/admin/catalogo", label: "Panel administrativo" }
      : role.data?.role === "operator" ? { href: "/admin/inventario", label: "Panel de inventario" } : null;
    const account: HeaderAccount = {
      name: profile.display_name.trim() || googleDisplayName(user.user_metadata) || "Mi cuenta",
      email: user.email ?? "",
      avatarUrl: profile.avatar_path ? `/api/account/avatar?v=${encodeURIComponent(profile.updated_at)}` : googleAvatarUrl(user.user_metadata),
      staffEntry
    };
    return Response.json({ account }, { headers });
  } catch (error) {
    if (error instanceof CustomerProfileError && [401, 403].includes(error.status)) return Response.json({ account: null }, { headers });
    return Response.json({ error: "No pudimos consultar tu cuenta." }, { status: 503, headers });
  }
}

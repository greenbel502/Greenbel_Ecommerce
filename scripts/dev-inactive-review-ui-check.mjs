/** Targeted HTTP QA: inactive DEV profile cannot see the review selector. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

if (process.argv[2] !== "--run" || process.argv.length !== 3) {
  console.error("NO EJECUTADO: usar --run solo contra Next local + Supabase DEV.");
  process.exit(2);
}
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const appUrl = process.env.DEV_APP_URL?.trim();
const key = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secret = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && appUrl && key && secret && linked === ref);
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.ok(["localhost", "127.0.0.1"].includes(new URL(appUrl).hostname));
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled");
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
let userId = null;
try {
  const product = await db.from("catalog_products").select("slug").limit(1).maybeSingle();
  if (product.error || !product.data?.slug) throw new Error("No hay producto publicado para QA UI");
  const email = `prueba-dev-review-inactive-${randomUUID().slice(0, 8)}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { qa_marker: "PRUEBA DEV inactive review UI" } });
  if (created.error || !created.data.user?.id) throw new Error(`Auth QA: ${created.error?.code ?? "sin_usuario"}`);
  userId = created.data.user.id;
  const profile = await db.from("profiles").update({ active: false }).eq("id", userId).select("active").single();
  if (profile.error || profile.data?.active !== false) throw new Error(`Perfil QA: ${profile.error?.code ?? "sin_cambio"}`);
  const jar = new Map();
  const client = createServerClient(url, key, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: false, path: "/" },
    cookies: { getAll() { return [...jar.entries()].map(([name, value]) => ({ name, value })); },
      setAll(values) { for (const { name, value } of values) jar.set(name, value); } }
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error || jar.size === 0) throw new Error(`Sesión QA: ${signed.error?.code ?? "sin_cookie"}`);
  const cookie = [...jar.entries()].map(([name, value]) =>
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("; ");
  const response = await fetch(new URL(`/productos/${product.data.slug}`, appUrl), {
    headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(30_000)
  });
  const html = await response.text();
  const okay = response.status === 200
    && html.includes("Tu cuenta no está activa para registrar reseñas")
    && !html.includes("Selecciona un pedido</option>");
  console.log(`${okay ? "PASS" : "FAIL"}: perfil inactivo ve aviso y no selector de reseña en ficha DEV (${response.status}).`);
  if (!okay) process.exitCode = 1;
} catch (error) {
  console.error(`FAIL: QA UI reseña inactiva: ${error instanceof Error ? error.message.replace(/[^A-Za-z0-9:_ -]/g, "") : "desconocido"}`);
  process.exitCode = 1;
} finally {
  if (userId) {
    const role = await db.from("user_roles").delete().eq("user_id", userId);
    const profile = await db.from("profiles").delete().eq("id", userId);
    const auth = await db.auth.admin.deleteUser(userId);
    if (role.error || profile.error || auth.error) {
      console.error("FAIL: limpieza de cuenta UI temporal");
      process.exitCode = 1;
    } else console.log("PASS: cuenta UI temporal eliminada de DEV.");
  }
}

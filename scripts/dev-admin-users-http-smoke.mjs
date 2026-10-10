/** Short HTTP access check for /admin/usuarios against the linked DEV project. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

assert.equal(process.argv[2], "--run");
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const appUrl = process.env.DEV_APP_URL?.trim();
const key = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secret = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && appUrl && key && secret && linked === ref);
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.ok(["localhost", "127.0.0.1"].includes(new URL(appUrl).hostname));
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = `PRUEBA DEV users-http ${randomUUID().slice(0, 8)}`;
const createdIds = [];
const checks = [];
function check(label, ok) { checks.push(ok); console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); }
async function identity(role) {
  const email = `${tag.toLowerCase().replaceAll(" ", "-")}-${role}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { qa_marker: tag } });
  if (created.error || !created.data.user) throw new Error(`Auth ${role}: ${created.error?.code ?? "missing"}`);
  const id = created.data.user.id;
  createdIds.push(id);
  if (role !== "customer") {
    const assigned = await db.from("user_roles").update({ role }).eq("user_id", id);
    if (assigned.error) throw new Error(`Role ${role}: ${assigned.error.code}`);
  }
  const jar = new Map();
  const client = createServerClient(url, key, { cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (items) => items.forEach(({ name, value }) => jar.set(name, value))
  }});
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error(`Login ${role}: ${signed.error.code}`);
  const cookie = [...jar.entries()].map(([name, value]) =>
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("; ");
  const response = await fetch(new URL("/admin/usuarios", appUrl), {
    headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(30_000)
  });
  return { status: response.status, body: await response.text(), id, cookie };
}

try {
  const [admin, operator, customer] = await Promise.all([
    identity("admin"), identity("operator"), identity("customer")
  ]);
  check("admin ve panel de usuarios y registro propio", admin.status === 200
    && admin.body.includes("<h1>Acceso de usuarios</h1>")
    && admin.body.includes("Cuentas Auth") && admin.body.includes(admin.id)
    && !admin.body.includes("No se pudo consultar Auth"));
  check("operador no ve panel de usuarios", !operator.body.includes("<h1>Acceso de usuarios</h1>"));
  check("cliente no ve panel de usuarios", !customer.body.includes("<h1>Acceso de usuarios</h1>"));
  const oddResult = await fetch(new URL("/admin/usuarios?result=__proto__", appUrl), {
    headers: { Cookie: admin.cookie }, redirect: "manual", signal: AbortSignal.timeout(30_000)
  });
  const oddBody = await oddResult.text();
  check("resultado de URL no reconocido no rompe panel", oddResult.status === 200
    && oddBody.includes("<h1>Acceso de usuarios</h1>")
    && !oddBody.includes("Application error"));
  const anonymous = await fetch(new URL("/admin/usuarios", appUrl), { redirect: "manual" });
  const anonBody = await anonymous.text();
  check("anónimo no ve panel de usuarios", !anonBody.includes("<h1>Acceso de usuarios</h1>"));
} catch (error) {
  check(`ejecución completa (${error?.message?.slice(0, 100) ?? "error"})`, false);
} finally {
  for (const id of createdIds) {
    const role = await db.from("user_roles").delete().eq("user_id", id);
    const profile = await db.from("profiles").delete().eq("id", id);
    const removed = await db.auth.admin.deleteUser(id);
    check("cuenta temporal retirada", !role.error && !profile.error && !removed.error);
  }
  const failed = checks.filter((ok) => !ok).length;
  console.log(`${failed ? "FAIL" : "PASS"}: /admin/usuarios HTTP DEV ${checks.length - failed}/${checks.length}.`);
  if (failed) process.exitCode = 1;
}

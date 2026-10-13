/** DEV-only provisioning/role check, not a real Google OAuth consent test. No email is sent. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
assert.equal(process.env.APP_ENV, "DEV");
assert.ok(ref && url && process.env.SUPABASE_ACCESS_TOKEN && process.env.DEV_SUPABASE_SECRET_KEY && process.env.DEV_SUPABASE_PUBLISHABLE_KEY, "Configuración DEV incompleta");
assert.equal(new URL(url).hostname, `${ref}.supabase.co`, "Destino fuera de DEV");
assert.equal(readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim(), ref);
const headers = { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" };
const configResponse = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { headers });
assert.equal(configResponse.status, 200, "Lectura de configuración Auth DEV");
const config = await configResponse.json();
assert.equal(config.external_google_enabled, true, "Proveedor Google debe estar habilitado");
assert.ok(config.external_google_client_id && config.external_google_secret, "Proveedor Google incompleto");
assert.equal(config.mailer_autoconfirm, false, "Confirmación de correo debe seguir habilitada");
for (const port of [3000, 3001]) {
  for (const suffix of ["", "?next=%2Fcheckout"]) {
    assert.ok(config.uri_allow_list.split(",").includes(`http://localhost:${port}/auth/callback${suffix}`), "Retorno local Google no permitido");
  }
}
console.log("PASS DEV: Google configurado, retornos 3000/3001 permitidos y confirmación habilitada.");

const schema = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query/read-only`, {
  method: "POST", headers, body: JSON.stringify({ query: `select
    (select count(*)::int from pg_trigger where tgrelid='auth.users'::regclass and tgname='greenbel_auth_user_created' and tgenabled='O') as enabled,
    (select relrowsecurity from pg_class where oid='public.profiles'::regclass) as profile_rls,
    (select relrowsecurity from pg_class where oid='public.user_roles'::regclass) as role_rls` })
});
assert.equal(schema.status, 201);
assert.deepEqual(await schema.json(), [{ enabled: 1, profile_rls: true, role_rls: true }]);
console.log("PASS DEV: trigger real habilitado y RLS de perfiles/roles activo.");

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, process.env.DEV_SUPABASE_SECRET_KEY, options);
const customer = createClient(url, process.env.DEV_SUPABASE_PUBLISHABLE_KEY, options);
let id;
try {
  const email = `qa-greenbel-provider-profile-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { role: "admin", active: true, full_name: "PRUEBA DEV provisioning; no consentimiento Google" } });
  assert.equal(created.error, null, "Crear exclusivamente cuenta ficticia mediante Admin API");
  id = created.data.user.id;
  const login = await customer.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null, "Sesión de la cuenta ficticia");
  const profile = await customer.from("profiles").select("id,active").eq("id", id).single();
  const role = await customer.from("user_roles").select("role").eq("user_id", id).single();
  assert.equal(profile.error, null);
  assert.deepEqual(profile.data, { id, active: true });
  assert.equal(role.error, null);
  assert.equal(role.data.role, "customer");
  console.log("PASS DEV: una cuenta nueva obtiene perfil propio y customer; metadata admin ignorada.");
  assert.ok((await customer.from("user_roles").update({ role: "admin" }).eq("user_id", id)).error, "Ascenso de rol debe ser denegado");
  assert.ok((await customer.from("profiles").update({ active: false }).eq("id", id)).error, "Cliente no debe cambiar el acceso operativo");
  const unchanged = await admin.from("user_roles").select("role").eq("user_id", id).single();
  assert.equal(unchanged.data?.role, "customer");
  console.log("PASS DEV: cliente no puede ascender su rol ni cambiar active; permisos persistidos conservados.");
} finally {
  await customer.auth.signOut({ scope: "local" });
  if (id) {
    assert.equal((await admin.from("user_roles").delete().eq("user_id", id)).error, null);
    assert.equal((await admin.from("profiles").delete().eq("id", id)).error, null);
    assert.equal((await admin.auth.admin.deleteUser(id)).error, null);
    console.log("PASS DEV: retirada solo la cuenta efímera de esta prueba; fixtures existentes conservados.");
  }
}
console.log("NO EJECUTADO por este script: consentimiento Google, vinculación de identidad y retorno OAuth real.");

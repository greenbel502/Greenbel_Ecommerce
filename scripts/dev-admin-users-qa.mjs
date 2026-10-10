/** Real DEV Auth/RLS/RPC QA for migration 017. Leaves labelled QA users inactive. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.argv.length !== 3 || process.argv[2] !== "--run") {
  console.error("NO EJECUTADO: usar --run solo contra DEV después de 017.");
  process.exit(2);
}
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const secret = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const publicKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && secret && publicKey && linked === ref);
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled");

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, secret, options);
const makeClient = () => createClient(url, publicKey, options);
const tag = randomBytes(5).toString("hex");
const marker = `PRUEBA DEV usuarios ${tag}`;
const password = `${randomBytes(24).toString("base64url")}Aa1!`;
const accounts = [];
const results = [];
const code = (response) => response.error?.code ?? response.error?.status ?? "sin-codigo";
function need(response, label) {
  if (response.error || !response.data) throw new Error(`${label}: ${code(response)}`);
  return response.data;
}
function check(label, pass) {
  results.push(Boolean(pass));
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
}
async function createAccount(kind) {
  const email = `qa-greenbel-users-${tag}-${kind}@example.invalid`;
  const user = need(await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { qa_marker: marker }
  }), `Auth ${kind}`).user;
  accounts.push(user.id);
  const client = makeClient();
  const login = need(await client.auth.signInWithPassword({ email, password }), `login ${kind}`);
  assert.equal(login.user.id, user.id);
  return { id: user.id, client };
}
async function role(id) {
  return need(await admin.from("user_roles").select("role").eq("user_id", id).single(), "rol").role;
}
async function active(id) {
  return need(await admin.from("profiles").select("active").eq("id", id).single(), "perfil").active;
}
async function auditCount(id) {
  const result = await admin.from("audit_events")
    .select("id", { count: "exact", head: true }).eq("entity_type", "user")
    .eq("entity_id", id).eq("action", "access_changed");
  if (result.error) throw new Error(`auditoría: ${code(result)}`);
  return result.count ?? 0;
}
const args = (id, roleValue, activeValue, oldRole, oldActive) => ({
  p_user_id: id, p_role: roleValue, p_active: activeValue,
  p_expected_role: oldRole, p_expected_active: oldActive
});

try {
  const actor = await createAccount("admin");
  const target = await createAccount("target");
  const outsider = await createAccount("outsider");
  need(await admin.from("user_roles").update({ role: "admin" })
    .eq("user_id", actor.id).select("role").single(), "promoción QA");
  check("Auth DEV creó tres cuentas ficticias sin correo y roles iniciales",
    await role(actor.id) === "admin" && await role(target.id) === "customer"
    && await role(outsider.id) === "customer");

  const outsiderWrite = await outsider.client.rpc("set_user_access",
    args(target.id, "admin", true, "customer", true));
  check("cliente no puede elevar un rol ajeno", outsiderWrite.error?.code === "42501"
    && await role(target.id) === "customer");
  const anonWrite = await makeClient().rpc("set_user_access",
    args(target.id, "admin", true, "customer", true));
  check("anónimo no puede ejecutar cambio de acceso", Boolean(anonWrite.error));
  const direct = await outsider.client.from("user_roles")
    .update({ role: "admin" }).eq("user_id", outsider.id);
  check("DML directo del cliente sigue denegado", Boolean(direct.error)
    && await role(outsider.id) === "customer");

  const first = await actor.client.rpc("set_user_access",
    args(target.id, "operator", true, "customer", true));
  check("administrador asigna operador con persistencia y auditoría",
    !first.error && first.data?.changed === true && await role(target.id) === "operator"
    && await auditCount(target.id) === 1);
  const replay = await actor.client.rpc("set_user_access",
    args(target.id, "operator", true, "operator", true));
  check("reintento igual no duplica auditoría", !replay.error
    && replay.data?.changed === false && await auditCount(target.id) === 1);
  const stale = await actor.client.rpc("set_user_access",
    args(target.id, "admin", true, "customer", true));
  check("versión antigua no cambia rol", Boolean(stale.error)
    && await role(target.id) === "operator" && await auditCount(target.id) === 1);

  const self = await actor.client.rpc("set_user_access",
    args(actor.id, "customer", false, "admin", true));
  check("administrador no se desactiva ni se degrada", self.error?.code === "42501"
    && await role(actor.id) === "admin" && await active(actor.id) === true);
  const suspended = await actor.client.rpc("set_user_access",
    args(target.id, "operator", false, "operator", true));
  check("administrador suspende operaciones del usuario", !suspended.error
    && suspended.data?.changed === true && await active(target.id) === false
    && await auditCount(target.id) === 2);
  const inactiveAttempt = await target.client.rpc("set_user_access",
    args(outsider.id, "admin", true, "customer", true));
  check("operador suspendido no puede administrar", inactiveAttempt.error?.code === "42501"
    && await role(outsider.id) === "customer");
  const restore = await actor.client.rpc("set_user_access",
    args(target.id, "customer", false, "operator", false));
  check("administrador restaura rol cliente sin reactivar", !restore.error
    && await role(target.id) === "customer" && await active(target.id) === false);
} catch (error) {
  check(`ejecución ${error instanceof Error ? error.message : "desconocida"}`, false);
} finally {
  for (const id of accounts) {
    const profile = await admin.from("profiles").update({ active: false }).eq("id", id);
    const access = await admin.from("user_roles").update({ role: "customer" }).eq("user_id", id);
    if (profile.error || access.error) {
      check("desactivar cuenta ficticia al terminar", false);
    }
  }
  console.log("Cuentas PRUEBA DEV desactivadas; auditoría ficticia conservada.");
}
const failed = results.filter((pass) => !pass).length;
console.log(`Resultado usuarios 017: ${results.length - failed} PASS, ${failed} FAIL.`);
if (failed) process.exitCode = 1;

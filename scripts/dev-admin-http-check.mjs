/**
 * Authenticated HTTP checks against the local Next server backed by Supabase DEV.
 * Creates fictional, email-confirmed DEV users with random passwords held only
 * in this process, then removes them after checking public FK references.
 * Run with: node --env-file=.env scripts/dev-admin-http-check.mjs --run
 * To clean accounts from an interrupted older run: add --cleanup-previous.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
if (mode !== "--run" && mode !== "--cleanup-previous") {
  console.error("NO EJECUTADO: usa --run o --cleanup-previous solo en DEV.");
  process.exit(2);
}

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const appUrl = process.env.DEV_APP_URL?.trim();
const publishableKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secretKey = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && linked === ref, "DEV target preflight");
assert.ok(new URL(url).hostname === `${ref}.supabase.co`, "DEV URL/ref preflight");
assert.ok(appUrl && ["localhost", "127.0.0.1"].includes(new URL(appUrl).hostname), "Local app URL preflight");
assert.ok(publishableKey && secretKey, "DEV keys preflight");
assert.ok(process.env.SUPABASE_ACCESS_TOKEN?.trim(), "DEV read-only audit token preflight");
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled", "Email pause preflight");

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const marker = `DEV-QA-ADMIN-${randomUUID().slice(0, 8)}`;
const createdUsers = [];
const results = [];
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  results.push({ label, ok });
};
const renderedHeading = (html, heading) => html.includes(`<h1>${heading}</h1>`);
const cookieHeader = (jar) => [...jar.entries()]
  .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("; ");

async function session(role) {
  const email = `${marker.toLowerCase()}-${role}@example.invalid`;
  const password = randomBytes(30).toString("base64url");
  const { data: user, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { qa_marker: marker }
  });
  if (createError || !user.user?.id) throw new Error(`DEV Auth fixture ${role}: ${createError?.code || "missing_user"}`);
  createdUsers.push({ id: user.user.id, marker });
  if (role !== "customer") {
    const { error: roleError } = await admin.from("user_roles")
      .update({ role }).eq("user_id", user.user.id);
    if (roleError) throw new Error(`DEV role fixture ${role}: ${roleError.code || "update_failed"}`);
  }
  const jar = new Map();
  const client = createServerClient(url, publishableKey, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: false, path: "/" },
    cookies: {
      getAll() { return [...jar.entries()].map(([name, value]) => ({ name, value })); },
      setAll(toSet) { for (const { name, value } of toSet) jar.set(name, value); }
    }
  });
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session || jar.size === 0) {
    throw new Error(`DEV sign-in ${role}: ${signInError?.code || "missing_session"}`);
  }
  return jar;
}

async function get(path, jar) {
  const response = await fetch(new URL(path, appUrl), {
    headers: { ...(jar ? { Cookie: cookieHeader(jar) } : {}) },
    redirect: "manual", signal: AbortSignal.timeout(30_000)
  });
  return { status: response.status, location: response.headers.get("location"),
    type: response.headers.get("content-type"), text: await response.text() };
}

async function readOnlyQuery(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query/read-only`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json" },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(25_000)
  });
  if (response.status !== 201) throw new Error(`DEV read-only SQL HTTP ${response.status}`);
  return response.json();
}

async function publicUserReferences() {
  const rows = await readOnlyQuery(`
    select n.nspname as schema_name, c.relname as table_name, a.attname as column_name
    from pg_constraint fk
    join pg_class c on c.oid = fk.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join unnest(fk.conkey) as k(attnum) on true
    join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
    where fk.contype = 'f'
      and fk.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
      and n.nspname = 'public'
    order by n.nspname, c.relname, a.attname`);
  assert.ok(Array.isArray(rows) && rows.length > 2, "DEV FK audit unavailable");
  return rows.filter((row) => !(
    (row.table_name === "profiles" && row.column_name === "id")
    || (row.table_name === "user_roles" && row.column_name === "user_id")
  )).map((row) => {
    for (const value of [row.schema_name, row.table_name, row.column_name]) {
      assert.ok(/^[a-z][a-z0-9_]*$/.test(value), "Unexpected DEV FK identifier");
    }
    return row;
  });
}

async function hasOperationalReferences(userId, references) {
  assert.ok(/^[0-9a-f-]{36}$/.test(userId), "Invalid test user ID");
  const columns = references.map((row, index) =>
    `(select count(*)::int from "${row.schema_name}"."${row.table_name}" where "${row.column_name}" = '${userId}'::uuid) as c${index}`);
  const rows = await readOnlyQuery(`select ${columns.join(", ")}`);
  assert.ok(Array.isArray(rows) && rows.length === 1, "DEV FK count unavailable");
  return columns.some((_, index) => Number(rows[0][`c${index}`]) > 0);
}

async function cleanupQaAccount({ id, marker: expectedMarker }, references) {
  const { data: account, error: accountError } = await admin.auth.admin.getUserById(id);
  if (accountError || !account.user) throw new Error(`QA account lookup failed: ${accountError?.code || "missing"}`);
  const user = account.user;
  const expectedEmail = new RegExp(`^${expectedMarker.toLowerCase()}-(admin|operator|customer)@example\\.invalid$`);
  if (!/^DEV-QA-ADMIN-[0-9a-f]{8}$/.test(expectedMarker)
    || user.user_metadata?.qa_marker !== expectedMarker || !expectedEmail.test(user.email ?? "")) {
    throw new Error(`QA account identity mismatch: ${id}`);
  }
  if (await hasOperationalReferences(id, references)) {
    throw new Error(`QA account has operational references: ${id} (${expectedMarker})`);
  }
  const [roleResult, profileResult] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", id).maybeSingle(),
    admin.from("profiles").select("id,display_name,phone,active").eq("id", id).maybeSingle()
  ]);
  if (roleResult.error || profileResult.error) throw new Error(`QA account profile read failed: ${id}`);
  if (profileResult.data && (profileResult.data.display_name !== ""
    || profileResult.data.phone !== null || profileResult.data.active !== true)) {
    throw new Error(`QA account profile was edited: ${id} (${expectedMarker})`);
  }
  let roleDeleted = false;
  let profileDeleted = false;
  try {
    if (roleResult.data) {
      const { error } = await admin.from("user_roles").delete().eq("user_id", id);
      if (error) throw new Error(`role delete: ${error.code || "remote_error"}`);
      roleDeleted = true;
    }
    if (profileResult.data) {
      const { error } = await admin.from("profiles").delete().eq("id", id);
      if (error) throw new Error(`profile delete: ${error.code || "remote_error"}`);
      profileDeleted = true;
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) throw new Error(`Auth delete: ${deleteError.code || "remote_error"}`);
    return true;
  } catch (error) {
    // Restore the two local rows if Auth deletion did not complete.
    const { data: stillThere } = await admin.auth.admin.getUserById(id);
    if (stillThere?.user) {
      if (profileDeleted) await admin.from("profiles").insert(profileResult.data);
      if (roleDeleted) await admin.from("user_roles").insert({ user_id: id, role: roleResult.data.role });
    }
    throw new Error(`QA cleanup blocked: ${id} (${expectedMarker}); ${error.message}`);
  }
}

async function cleanupQaAccounts(accounts) {
  if (accounts.length === 0) {
    console.log("PASS: no hay cuentas DEV-QA-ADMIN pendientes de limpieza.");
    return;
  }
  const references = await publicUserReferences();
  let cleaned = 0;
  const blocked = [];
  for (const account of accounts) {
    try {
      await cleanupQaAccount(account, references);
      cleaned += 1;
    } catch (error) {
      blocked.push(error.message);
    }
  }
  console.log(`${blocked.length ? "FAIL" : "PASS"}: limpieza Auth DEV ${cleaned}/${accounts.length} cuentas QA sin referencias operativas.`);
  if (blocked.length) {
    for (const detail of blocked) console.error(`FAIL: ${detail}`);
    process.exitCode = 1;
  }
}

async function cleanupPreviousAccounts() {
  const accounts = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`DEV Auth list failed: ${error.code || "remote_error"}`);
    for (const user of data.users) {
      const qaMarker = user.user_metadata?.qa_marker;
      if (typeof qaMarker === "string" && /^DEV-QA-ADMIN-[0-9a-f]{8}$/.test(qaMarker)) {
        accounts.push({ id: user.id, marker: qaMarker });
      }
    }
    if (data.users.length < 1000) break;
    if (page === 100) throw new Error("DEV Auth pagination limit reached");
  }
  await cleanupQaAccounts(accounts);
}

async function runChecks() {
  const signedIn = await Promise.allSettled([
    session("admin"), session("operator"), session("customer")
  ]);
  if (signedIn.some((result) => result.status === "rejected")) {
    throw new Error("DEV QA session setup failed; created accounts will be cleaned.");
  }
  const [adminJar, operatorJar, customerJar] = signedIn.map((result) => result.value);
  check("tres cuentas ficticias DEV iniciaron sesión", [adminJar, operatorJar, customerJar]
    .every((jar) => jar.size > 0));

  const cases = [
    ["/admin/catalogo", "Catálogo GreenBel"],
    ["/admin/cotizaciones", "Cotizaciones registradas"],
    ["/admin/financiamiento", "Borradores de financiamiento"],
    ["/admin/inventario", "Inventario compartido"],
    ["/admin/entregas", "Entregas, zonas y medios"],
    ["/admin/ventas", "Ventas y posventa"]
  ];
  for (const [path, markerText] of cases) {
    const owner = await get(path, adminJar);
    check(`admin puede ver ${path}`, owner.status === 200 && renderedHeading(owner.text, markerText));
    const anon = await get(path);
    check(`anónimo no ve ${path}`, !renderedHeading(anon.text, markerText));
    const customer = await get(path, customerJar);
    check(`cliente no ve ${path}`, !renderedHeading(customer.text, markerText));
  }
  const operatorInventory = await get("/admin/inventario", operatorJar);
  check("operador puede ver inventario", operatorInventory.status === 200
    && renderedHeading(operatorInventory.text, "Inventario compartido"));
  for (const path of ["/admin/catalogo", "/admin/cotizaciones", "/admin/financiamiento", "/admin/consultas"]) {
    const page = await get(path, operatorJar);
    check(`operador no ve ${path}`, !renderedHeading(page.text, path === "/admin/catalogo"
      ? "Catálogo GreenBel" : path === "/admin/cotizaciones"
        ? "Cotizaciones registradas" : path === "/admin/financiamiento"
          ? "Borradores de financiamiento" : "Consultas registradas"));
  }

  const adminContacts = await get("/admin/consultas", adminJar);
  check("admin puede leer contactos persistidos", adminContacts.status === 200
    && renderedHeading(adminContacts.text, "Consultas registradas")
    && !adminContacts.text.includes("No se pudieron consultar los registros privados"));

  const { data: quote, error: quoteError } = await admin.from("quotes")
    .select("id").eq("stage", "issued").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (quoteError || !quote) throw new Error(`DEV quote fixture missing: ${quoteError?.code || "none"}`);
  const pdfPath = `/api/admin/cotizaciones/${quote.id}/pdf`;
  const adminPdf = await get(pdfPath, adminJar);
  check("admin puede descargar PDF privado", adminPdf.status === 200 && adminPdf.type === "application/pdf"
    && adminPdf.text.startsWith("%PDF-"));
  for (const [role, jar] of [["anónimo", null], ["operador", operatorJar], ["cliente", customerJar]]) {
    const pdf = await get(pdfPath, jar);
    check(`${role} no descarga PDF privado`, pdf.status !== 200 || pdf.type !== "application/pdf");
  }
  const failed = results.filter((result) => !result.ok);
  console.log(`${failed.length ? "FAIL" : "PASS"}: paneles HTTP DEV, ${results.length - failed.length}/${results.length} comprobaciones.`);
  if (failed.length) process.exitCode = 1;
}

async function main() {
  if (mode === "--cleanup-previous") return cleanupPreviousAccounts();
  try {
    await runChecks();
  } finally {
    await cleanupQaAccounts(createdUsers);
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error?.message?.slice(0, 160) || "admin HTTP DEV"}`);
  process.exitCode = 1;
});

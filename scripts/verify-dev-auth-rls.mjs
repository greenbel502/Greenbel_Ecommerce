import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Direct DEV Auth/RLS smoke test. Run with:
 *   node --env-file=.env scripts/verify-dev-auth-rls.mjs
 *
 * Creates two clearly fictitious users with confirmed email through the Auth
 * admin API (no message), then removes only those users and their own rows.
 * Never logs the project ref, URL, keys, passwords, emails or JWTs.
 */
const projectRef = process.env.SUPABASE_DEV_PROJECT_REF?.trim() ?? "";
const url = process.env.DEV_SUPABASE_URL?.trim() ?? "";
const publishableKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
const secretKey = process.env.DEV_SUPABASE_SECRET_KEY?.trim() ?? "";
const linkPath = resolve("supabase/.temp/project-ref");
const linkedRef = existsSync(linkPath) ? readFileSync(linkPath, "utf8").trim() : "";

let targetValid = process.env.APP_ENV === "DEV" && /^[a-z0-9-]{3,64}$/.test(projectRef)
  && linkedRef === projectRef && Boolean(publishableKey && secretKey);
try {
  const parsed = new URL(url);
  targetValid = targetValid && parsed.protocol === "https:"
    && parsed.hostname === `${projectRef}.supabase.co`
    && !parsed.username && !parsed.password;
} catch {
  targetValid = false;
}
if (!targetValid) {
  console.error("FAIL: selector, enlace real, URL DEV o claves para esta prueba no coinciden.");
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, secretKey, options);
const anon = createClient(url, publishableKey, options);
const results = [];
const createdIds = [];
const assert = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` (${detail})` : ""}`);
};
const errCode = (error) => error?.code || (error?.status ? `HTTP ${error.status}` : "sin código");
const expectDenied = (name, result) => assert(name, Boolean(result.error), errCode(result.error));

async function createTestUser(label) {
  const email = `qa-greenbel-rls-${label}-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user?.id) {
    assert(`Auth crea usuario ficticio ${label} sin correo`, false, errCode(created.error));
    return null;
  }
  const id = created.data.user.id;
  createdIds.push(id);
  assert(`Auth crea usuario ficticio ${label} sin correo`, true);
  const client = createClient(url, publishableKey, options);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert(`Auth inicia sesión de ${label}`, !signedIn.error && signedIn.data.user?.id === id,
    signedIn.error ? errCode(signedIn.error) : "");
  return signedIn.error ? null : { id, client };
}

async function cleanup() {
  for (const id of createdIds.reverse()) {
    const role = await admin.from("user_roles").delete().eq("user_id", id);
    const profile = await admin.from("profiles").delete().eq("id", id);
    const auth = await admin.auth.admin.deleteUser(id);
    assert("Retiro limitado a usuario ficticio creado en esta ejecución",
      !role.error && !profile.error && !auth.error,
      role.error ? errCode(role.error) : profile.error ? errCode(profile.error) : errCode(auth.error));
  }
}

try {
  const a = await createTestUser("a");
  const b = await createTestUser("b");
  if (a && b) {
    for (const [label, own, other] of [["A", a, b], ["B", b, a]]) {
      const profile = await own.client.from("profiles")
        .select("id,display_name,active").eq("id", own.id).single();
      assert(`${label} lee su perfil`, !profile.error && profile.data?.id === own.id);

      const otherProfile = await own.client.from("profiles")
        .select("id").eq("id", other.id);
      assert(`${label} no lee perfil ajeno`, !otherProfile.error && otherProfile.data?.length === 0);

      const role = await own.client.from("user_roles")
        .select("user_id,role").eq("user_id", own.id).single();
      assert(`${label} recibe rol customer mínimo`, !role.error && role.data?.role === "customer");

      const otherRole = await own.client.from("user_roles")
        .select("user_id").eq("user_id", other.id);
      assert(`${label} no lee rol ajeno`, !otherRole.error && otherRole.data?.length === 0);
    }

    const ownUpdate = await a.client.from("profiles")
      .update({ display_name: "Prueba ficticia GreenBel A" }).eq("id", a.id)
      .select("id,display_name").single();
    assert("Cliente modifica solo nombre propio", !ownUpdate.error
      && ownUpdate.data?.display_name === "Prueba ficticia GreenBel A");

    const foreignUpdate = await b.client.from("profiles")
      .update({ display_name: "Intento ajeno" }).eq("id", a.id)
      .select("id");
    assert("Cliente B no modifica perfil de A", !foreignUpdate.error
      && foreignUpdate.data?.length === 0);

    expectDenied("Cliente no modifica active", await a.client.from("profiles")
      .update({ active: false }).eq("id", a.id));
    expectDenied("Cliente no asciende su rol", await a.client.from("user_roles")
      .update({ role: "admin" }).eq("user_id", a.id));
    const unchanged = await a.client.from("user_roles")
      .select("role").eq("user_id", a.id).single();
    assert("Rol permanece customer tras intento", !unchanged.error
      && unchanged.data?.role === "customer");

    expectDenied("Cliente no escribe catálogo", await a.client.from("brands")
      .insert({ name: "QA no autorizada", slug: `qa-no-write-${randomUUID()}` }));
    expectDenied("Cliente no lee cotizaciones privadas directamente", await a.client.from("quotes")
      .select("id").limit(1));
    expectDenied("Cliente no lee contactos privados", await a.client.from("contact_messages")
      .select("id").limit(1));
    expectDenied("Cliente no lee borradores de financiamiento", await a.client.from("financing_requests")
      .select("id").limit(1));
    expectDenied("Cliente no lee grants de invitado", await a.client.from("guest_access_grants")
      .select("id").limit(1));

    expectDenied("Cliente no invoca RPC privada de grants", await a.client
      .rpc("consume_guest_access_grant", {
        p_token_sha256: "0".repeat(64), p_quote_id: randomUUID()
      }));
    const primaryImage = await a.client.rpc("set_product_primary_image", {
      p_product_id: randomUUID(), p_image_id: randomUUID(), p_expected_primary_id: null
    });
    assert("Cliente no invoca RPC de portada administrativa",
      Boolean(primaryImage.error) && primaryImage.error.code === "42501",
      errCode(primaryImage.error));
    const inventory = await a.client.rpc("record_inventory_change", {
      p_product_id: randomUUID(), p_kind: "stock_entry", p_quantity_delta: 1,
      p_reason: "Prueba de permiso", p_reference: "QA ficticia",
      p_idempotency_key: `qa-denied-${randomUUID()}`
    });
    assert("Cliente no registra inventario físico", Boolean(inventory.error)
      && inventory.error.code === "42501", errCode(inventory.error));

    expectDenied("Anónimo no lee perfiles", await anon.from("profiles")
      .select("id").eq("id", a.id));
    expectDenied("Anónimo no lee roles", await anon.from("user_roles")
      .select("user_id").eq("user_id", a.id));
    const catalog = await anon.from("catalog_products").select("id").limit(1);
    assert("Anónimo puede consultar catálogo público", !catalog.error);
  } else {
    assert("Pruebas cruzadas requieren ambas sesiones Auth", false);
  }
} catch (error) {
  assert("Prueba DEV sin excepción inesperada", false, error?.name || "Error");
} finally {
  await cleanup();
  const passCount = results.filter((result) => result.pass).length;
  console.log(`RESULTADO: ${passCount}/${results.length} PASS; ${results.length - passCount} FAIL.`);
  if (passCount !== results.length) process.exitCode = 1;
}

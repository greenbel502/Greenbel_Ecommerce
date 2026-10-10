import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Direct DEV order RLS test. This leaves one labeled fictitious draft order and
 * its Auth customer because service_role has no order DELETE grant. It removes
 * the second test customer. Run only against the verified DEV link:
 *   node --env-file=.env scripts/verify-dev-order-rls.mjs
 * Do not persist or print generated passwords, keys or sessions.
 */
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim() ?? "";
const url = process.env.DEV_SUPABASE_URL?.trim() ?? "";
const publicKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
const secretKey = process.env.DEV_SUPABASE_SECRET_KEY?.trim() ?? "";
const linkPath = resolve("supabase/.temp/project-ref");
const linked = existsSync(linkPath) ? readFileSync(linkPath, "utf8").trim() : "";
let safe = process.env.APP_ENV === "DEV" && /^[a-z0-9-]{3,64}$/.test(ref)
  && linked === ref && Boolean(publicKey && secretKey);
try {
  const parsed = new URL(url);
  safe = safe && parsed.protocol === "https:"
    && parsed.hostname === `${ref}.supabase.co`
    && !parsed.username && !parsed.password;
} catch {
  safe = false;
}
if (!safe) {
  console.error("FAIL: destino DEV o enlace CLI no coinciden; no se crearon datos.");
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, secretKey, options);
const anon = createClient(url, publicKey, options);
const checks = [];
const created = [];
let order = null;
const code = (error) => error?.code || (error?.status ? `HTTP ${error.status}` : "sin código");
const check = (label, pass, detail = "") => {
  checks.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${detail ? ` (${detail})` : ""}`);
};

async function makeCustomer(label) {
  const email = `qa-greenbel-order-rls-${label}-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error || !made.data.user?.id) {
    check(`Crear cliente ficticio ${label}`, false, code(made.error));
    return null;
  }
  const id = made.data.user.id;
  created.push({ id, email });
  check(`Crear cliente ficticio ${label}`, true);
  const client = createClient(url, publicKey, options);
  const login = await client.auth.signInWithPassword({ email, password });
  check(`Sesión real de cliente ${label}`, !login.error && login.data.user?.id === id,
    login.error ? code(login.error) : "");
  return login.error ? null : { id, client };
}

async function removeCustomer(customer) {
  const role = await admin.from("user_roles").delete().eq("user_id", customer.id);
  const profile = await admin.from("profiles").delete().eq("id", customer.id);
  const auth = await admin.auth.admin.deleteUser(customer.id);
  check("Retirar solo cliente de prueba sin pedido", !role.error && !profile.error && !auth.error,
    role.error ? code(role.error) : profile.error ? code(profile.error) : code(auth.error));
}

try {
  const a = await makeCustomer("a");
  const b = await makeCustomer("b");
  if (a && b) {
    const reference = `DEV-QA-RLS-${randomUUID()}`;
    const inserted = await admin.from("orders").insert({
      reference,
      idempotency_key: `dev-qa-order-rls-${randomUUID()}`,
      customer_id: a.id,
      stage: "draft",
      currency: "GTQ",
      customer_snapshot: { note: "Solo datos ficticios de QA DEV" },
      billing_snapshot: {
        schema_version: 1,
        type: "cf",
        first_name: "Prueba",
        last_name: "Ficticia",
        phone: "00000000"
      }
    }).select("id,reference,customer_id,stage,confirmed_at").single();
    order = inserted.error ? null : inserted.data;
    check("Crear pedido borrador ficticio sin confirmación", Boolean(order)
      && order.stage === "draft" && order.confirmed_at === null,
    inserted.error ? code(inserted.error) : "");

    if (order) {
      const own = await a.client.from("orders")
        .select("id,reference,customer_id,stage,billing_snapshot")
        .eq("id", order.id).single();
      check("Cliente A lee su pedido y datos de facturación", !own.error
        && own.data?.id === order.id
        && own.data?.customer_id === a.id
        && own.data?.billing_snapshot?.first_name === "Prueba");

      const foreign = await b.client.from("orders")
        .select("id,reference,customer_id,stage,billing_snapshot")
        .eq("id", order.id);
      check("Cliente B no lee pedido ni facturación de A", !foreign.error
        && foreign.data?.length === 0);

      const allB = await b.client.from("orders").select("id");
      check("Listado de B no incluye pedido de A", !allB.error
        && !allB.data?.some((row) => row.id === order.id));

      const directWrite = await b.client.from("orders")
        .update({ stage: "cancelled" }).eq("id", order.id);
      check("B no cambia pedido ajeno por tabla", Boolean(directWrite.error)
        && directWrite.error.code === "42501", code(directWrite.error));

      const wrongCancel = await b.client.rpc("cancel_unprepared_draft_order", {
        p_order_id: order.id,
        p_reason: "Intento ficticio ajeno",
        p_idempotency_key: `qa-denied-${randomUUID()}`
      });
      check("B no cancela borrador ajeno por RPC", Boolean(wrongCancel.error)
        && wrongCancel.error.code === "42501", code(wrongCancel.error));

      const anonymous = await anon.from("orders").select("id").eq("id", order.id);
      check("Anónimo no lee pedido", Boolean(anonymous.error)
        && anonymous.error.code === "42501", code(anonymous.error));

      const after = await admin.from("orders")
        .select("id,stage,confirmed_at").eq("id", order.id).single();
      check("Pedido permanece borrador no confirmado", !after.error
        && after.data?.stage === "draft" && after.data?.confirmed_at === null);
    }
  } else {
    check("La prueba requiere dos sesiones Auth", false);
  }
} catch (error) {
  check("Sin excepción inesperada", false, error?.name || "Error");
} finally {
  for (const customer of created) {
    if (order && customer.id === order.customer_id) continue;
    await removeCustomer(customer);
  }
  if (order) {
    console.log(`FIXTURE DEV PERSISTENTE: order_id=${order.id}; reference=${order.reference}; customer_id=${order.customer_id}; stage=draft; sin ítems, reserva ni pago.`);
  } else {
    console.log("FIXTURE DEV PERSISTENTE: ninguno.");
  }
  const passed = checks.filter(Boolean).length;
  console.log(`RESULTADO: ${passed}/${checks.length} PASS; ${checks.length - passed} FAIL.`);
  if (passed !== checks.length) process.exitCode = 1;
}

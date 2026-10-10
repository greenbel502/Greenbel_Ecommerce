/** Direct DEV concurrency and stale commercial terms QA. Leaves isolated named fixtures. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.argv.length !== 3 || process.argv[2] !== "--run") {
  console.error("NO EJECUTADO: indicar --run para fixture de concurrencia PRUEBA DEV.");
  process.exit(2);
}
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const publicKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secretKey = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && publicKey && secretKey && linked === ref);
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
const tag = `PRUEBA DEV carrera checkout ${randomUUID().slice(0, 8)}`;
const slug = tag.toLowerCase().replaceAll(" ", "-");
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, secretKey, opts);
const users = [];
const results = [];
function check(label, pass, code = "") {
  results.push(Boolean(pass));
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${code ? ` (${code})` : ""}`);
}
function need(response, label) {
  if (response.error || !response.data) throw new Error(`${label}: ${response.error?.code ?? "sin_datos"}`);
  return response.data;
}
async function user(label, role) {
  const email = `${slug}-${label}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const created = need(await service.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { test_fixture: tag } }), `Auth ${label}`).user;
  users.push({ id: created.id, role });
  if (role === "admin") need(await service.from("user_roles").update({ role }).eq("user_id", created.id)
    .select("role").single(), "rol admin");
  const client = createClient(url, publicKey, opts);
  need(await client.auth.signInWithPassword({ email, password }), `sesión ${label}`);
  return { id: created.id, client };
}
function intent(productId) {
  return { lines: [{ productId, quantity: 1 }],
    billing: { kind: "cf", firstName: "Cliente", lastName: "PRUEBA DEV", phone: "5555 5555" },
    delivery: { kind: "pickup", serviceId: "a1000000-0000-4000-8000-000000000001" },
    paymentOptionId: "a4000000-0000-4000-8000-000000000001" };
}
async function review(client, selection, reviewId = null) {
  return client.rpc("review_checkout", { p_intent: selection, p_review_key: randomUUID(), p_review_id: reviewId });
}
function confirmation(selection, reviewed) {
  return { p_review_id: reviewed.reviewId, p_intent: selection,
    p_accepted_revision: reviewed.revision, p_accepted_total: reviewed.total,
    p_idempotency_key: randomUUID() };
}

try {
  const admin = await user("admin", "admin");
  const customer = await user("customer", "customer");
  const category = need(await service.from("categories").insert({ name: tag, slug, active: true })
    .select("id").single(), "categoría");
  async function product(suffix) {
    return need(await service.from("products").insert({
      kind: "equipment", category_id: category.id,
      sku: `QA-CH-${slug.slice(-8).toUpperCase()}-${suffix}`,
      slug: `${slug}-${suffix.toLowerCase()}`, name: `${tag} ${suffix}`,
      short_description: "Producto ficticio exclusivo QA DEV.",
      publication_status: "published", regular_price: "60.00", currency: "GTQ"
    }).select("id").single(), `producto ${suffix}`);
  }
  const lastUnit = await product("RACE");
  const changed = await product("TERMS");
  for (const [p, quantity] of [[lastUnit, 1], [changed, 2]]) {
    need(await admin.client.rpc("record_inventory_change", {
      p_product_id: p.id, p_kind: "stock_entry", p_quantity_delta: quantity,
      p_reason: tag, p_reference: tag, p_idempotency_key: randomUUID()
    }), "entrada stock");
  }
  check("Dos SKUs aislados con saldos inicializados", true);

  const raceIntent = intent(lastUnit.id);
  const raceReview = need(await review(customer.client, raceIntent), "review carrera");
  check("Revisión de última unidad Q60", raceReview.total === "60.00");
  const [web, physical] = await Promise.all([
    customer.client.rpc("confirm_checkout", confirmation(raceIntent, raceReview)),
    admin.client.rpc("record_inventory_change", {
      p_product_id: lastUnit.id, p_kind: "physical_sale", p_quantity_delta: -1,
      p_reason: `${tag} venta física concurrente`, p_reference: tag, p_idempotency_key: randomUUID()
    })
  ]);
  const webWins = !web.error;
  const physicalWins = !physical.error;
  check("Última unidad: exactamente una operación vence", webWins !== physicalWins,
    web.error?.code ?? physical.error?.code);
  const raceBalance = need(await service.from("inventory_balances").select("stock_balance,reserved")
    .eq("product_id", lastUnit.id).single(), "balance carrera");
  check("Saldos conservan una única unidad comprometida", webWins
    ? Number(raceBalance.stock_balance) === 1 && Number(raceBalance.reserved) === 1
    : Number(raceBalance.stock_balance) === 0 && Number(raceBalance.reserved) === 0);
  const raceOrder = need(await service.from("orders").select("stage")
    .eq("id", raceReview.reviewId).single(), "pedido carrera");
  check("Pedido sólo confirmado cuando gana web", webWins
    ? raceOrder.stage === "confirmed" : raceOrder.stage === "draft");

  const changeIntent = intent(changed.id);
  const first = need(await review(customer.client, changeIntent), "review precio inicial");
  check("Precio original Q60", first.total === "60.00");
  need(await service.from("products").update({ regular_price: "65.00" }).eq("id", changed.id)
    .select("id").single(), "subir precio ficticio");
  const stalePrice = await customer.client.rpc("confirm_checkout", confirmation(changeIntent, first));
  check("Precio cambiado invalida aceptación anterior", stalePrice.error?.code === "P0001", stalePrice.error?.code);
  const second = need(await review(customer.client, changeIntent, first.reviewId), "review precio nuevo");
  check("Nueva revisión presenta Q65 y versión nueva", second.total === "65.00"
    && second.revision > first.revision);
  const now = Date.now();
  need(await service.from("product_offers").insert({ product_id: changed.id,
    kind: "fixed_price", value: "55.00", starts_at: new Date(now - 60_000).toISOString(),
    ends_at: new Date(now + 86_400_000).toISOString(), enabled: true, created_by: admin.id
  }).select("id").single(), "oferta ficticia");
  const staleOffer = await customer.client.rpc("confirm_checkout", confirmation(changeIntent, second));
  check("Oferta cambiada invalida aceptación anterior", staleOffer.error?.code === "P0001", staleOffer.error?.code);
  const third = need(await review(customer.client, changeIntent, first.reviewId), "review oferta nueva");
  check("Nueva revisión presenta Q55 y versión nueva", third.total === "55.00"
    && third.revision > second.revision);
  const confirmed = await customer.client.rpc("confirm_checkout", confirmation(changeIntent, third));
  check("Sólo precio y oferta aceptados finalmente reservan", !confirmed.error
    && confirmed.data?.stage === "confirmed" && confirmed.data?.total === "55.00", confirmed.error?.code);
  const changedBalance = need(await service.from("inventory_balances").select("stock_balance,reserved")
    .eq("product_id", changed.id).single(), "balance precio");
  check("Cambios obsoletos no reservaron inventario", Number(changedBalance.stock_balance) === 2
    && Number(changedBalance.reserved) === 1);
} catch (error) {
  check("Prueba sin excepción", false,
    error instanceof Error ? error.message.replace(/[^A-Za-z0-9:_ -]/g, "") : "error");
} finally {
  for (const actor of users) {
    let roleOkay = true;
    if (actor.role === "admin") {
      const role = await service.from("user_roles").update({ role: "customer" }).eq("user_id", actor.id)
        .select("role").single();
      roleOkay = !role.error && role.data?.role === "customer";
    }
    const profile = await service.from("profiles").update({ active: false }).eq("id", actor.id)
      .select("active").single();
    check("Cuenta QA cerrada y rol admin retirado", roleOkay && !profile.error && profile.data?.active === false,
      roleOkay ? profile.error?.code : "role_cleanup");
  }
  const passed = results.filter(Boolean).length;
  console.log(`RESULTADO ${passed}/${results.length} PASS; fixture ${tag}; sin correo/cobro/despacho real.`);
  if (passed !== results.length) process.exitCode = 1;
}

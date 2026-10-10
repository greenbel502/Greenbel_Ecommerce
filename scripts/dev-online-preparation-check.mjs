/** Isolated DEV QA of 016, including one-minute expiry. Restores policy. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const phase = process.argv[2];
if (!["--fresh", "--expired"].includes(phase) || process.argv.length !== 3) {
  console.error("NO EJECUTADO: usar --fresh; --expired solo sin otro QA checkout concurrente.");
  process.exit(2);
}
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const publicKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secret = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && publicKey && secret && linked === ref);
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled");
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(url, secret, opts);
const tag = `PRUEBA DEV online-prep ${randomUUID().slice(0, 8)}`;
const slug = tag.toLowerCase().replaceAll(" ", "-");
const users = [];
const products = [];
let categoryId = null;
let oldMinutes = null;
let policyShortened = false;
const results = [];
function check(label, okay, code = "") {
  results.push(Boolean(okay));
  console.log(`${okay ? "PASS" : "FAIL"}: ${label}${code ? ` (${code})` : ""}`);
}
function need(result, label) {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${label}: ${result.error?.code ?? "sin_datos"}`);
  }
  return result.data;
}
async function createUser(label, role = "customer") {
  const email = `${slug}-${label}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const created = need(await db.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { qa_marker: tag } }), `Auth ${label}`).user;
  users.push(created.id);
  if (role !== "customer") need(await db.from("user_roles")
    .update({ role }).eq("user_id", created.id).select("role").single(), `rol ${label}`);
  const client = createClient(url, publicKey, opts);
  need(await client.auth.signInWithPassword({ email, password }), `login ${label}`);
  return { id: created.id, client };
}
async function createProduct(label, operator) {
  const product = need(await db.from("products").insert({
    kind: "equipment", category_id: categoryId,
    sku: `QA-ONLINE-PREP-${slug.slice(-8).toUpperCase()}-${label}`,
    slug: `${slug}-${label}`, name: `${tag} ${label}`,
    short_description: "Producto ficticio DEV; no vendible fuera de esta prueba.",
    publication_status: "published", regular_price: "60.00", currency: "GTQ"
  }).select("id").single(), `producto ${label}`);
  products.push(product.id);
  need(await operator.client.rpc("record_inventory_change", {
    p_product_id: product.id, p_kind: "stock_entry", p_quantity_delta: 3,
    p_reason: tag, p_reference: tag, p_idempotency_key: randomUUID()
  }), `inventario ${label}`);
  return product.id;
}
async function confirmedOrder(customer, productId) {
  const intent = { lines: [{ productId, quantity: 1 }],
    billing: { kind: "cf", firstName: "Cliente", lastName: "PRUEBA DEV", phone: "5555 5555" },
    delivery: { kind: "pickup", serviceId: "a1000000-0000-4000-8000-000000000001" },
    paymentOptionId: "a4000000-0000-4000-8000-000000000003" };
  const reviewed = need(await customer.client.rpc("review_checkout", {
    p_intent: intent, p_review_key: randomUUID(), p_review_id: null
  }), "revisión online");
  const confirmed = need(await customer.client.rpc("confirm_checkout", {
    p_review_id: reviewed.reviewId, p_intent: intent,
    p_accepted_revision: reviewed.revision, p_accepted_total: reviewed.total,
    p_idempotency_key: randomUUID()
  }), "confirmación online");
  return confirmed.orderId;
}
function prepareArgs(orderId) {
  return { p_order_id: orderId, p_event: "prepare", p_tracking_number: null,
    p_tracking_url: null, p_evidence_reference: `${tag} preparar`,
    p_idempotency_key: randomUUID() };
}
async function attempt(orderId) {
  return need(await db.rpc("create_dev_online_payment_attempt", {
    p_order_id: orderId, p_idempotency_key: randomUUID()
  }), "intento online").paymentId;
}
async function event(paymentId, outcome) {
  return need(await db.rpc("record_dev_online_payment_event", {
    p_payment_id: paymentId, p_event_key: randomUUID(), p_outcome: outcome,
    p_evidence_reference: `PRUEBA DEV: ${tag} ${outcome}`
  }), `evento ${outcome}`);
}
async function setMinutes(value) {
  const row = need(await db.from("checkout_settings")
    .update({ online_reservation_minutes: value }).eq("id", true)
    .select("online_reservation_minutes").single(), "política online");
  assert.equal(row.online_reservation_minutes, value);
}

try {
  console.log(`Fixture ficticia ${tag}`);
  const operator = await createUser("operator", "operator");
  const customer = await createUser("customer");
  categoryId = need(await db.from("categories").insert({
    name: `${tag} categoría`, slug, active: true
  }).select("id").single(), "categoría").id;
  const policy = need(await db.from("checkout_settings")
    .select("online_reservation_minutes,simulated_gateway_enabled")
    .eq("id", true).single(), "política inicial");
  oldMinutes = policy.online_reservation_minutes;
  assert.ok(Number.isInteger(oldMinutes) && oldMinutes >= 1 && policy.simulated_gateway_enabled);

  if (phase === "--fresh") {
  // A fresh unpaid online reservation may be prepared, then paid and handed over.
  const freshProduct = await createProduct("fresh", operator);
  const freshOrder = await confirmedOrder(customer, freshProduct);
  const customerPrepare = await customer.client.rpc("record_staff_shipment_event", prepareArgs(freshOrder));
  const freshPrepared = await operator.client.rpc("record_staff_shipment_event", prepareArgs(freshOrder));
  check("reserva online vigente permite preparar solo a operador", customerPrepare.error?.code === "42501"
    && !freshPrepared.error && Boolean(freshPrepared.data), freshPrepared.error?.code);
  const freshAttempt = await attempt(freshOrder);
  const freshSuccess = await event(freshAttempt, "success");
  check("éxito posterior a preparación consume inventario", freshSuccess.processingResult === "succeeded");
  need(await operator.client.rpc("record_staff_shipment_event", {
    ...prepareArgs(freshOrder), p_event: "ready_for_pickup"
  }), "retiro listo");
  need(await operator.client.rpc("record_staff_shipment_event", {
    ...prepareArgs(freshOrder), p_event: "deliver"
  }), "entrega online");

  // Contradictory online event must block preparation even while stock is reserved.
  const reviewProduct = await createProduct("review", operator);
  const reviewOrder = await confirmedOrder(customer, reviewProduct);
  const reviewAttempt = await attempt(reviewOrder);
  await event(reviewAttempt, "rejected");
  const late = await event(reviewAttempt, "success");
  const reviewPrepare = await operator.client.rpc("record_staff_shipment_event", prepareArgs(reviewOrder));
  const reviewShipment = await db.from("shipments").select("id").eq("order_id", reviewOrder);
  check("evento online contradictorio impide preparar", late.processingResult === "late_success_review"
    && Boolean(reviewPrepare.error) && !reviewShipment.error && reviewShipment.data?.length === 0,
    reviewPrepare.error?.code);

  // If the success consumes stock before staff begins, preparation still works.
  const paidProduct = await createProduct("paid", operator);
  const paidOrder = await confirmedOrder(customer, paidProduct);
  const paidAttempt = await attempt(paidOrder);
  const paidEvent = await event(paidAttempt, "success");
  const paidPrepare = await operator.client.rpc("record_staff_shipment_event", prepareArgs(paidOrder));
  const paidBalance = need(await db.from("inventory_balances")
    .select("stock_balance,reserved").eq("product_id", paidProduct).single(), "saldo online pagado");
  check("pago puntual con stock consumido permite preparar", paidEvent.processingResult === "succeeded"
    && !paidPrepare.error && Number(paidBalance.stock_balance) === 2
    && Number(paidBalance.reserved) === 0, paidPrepare.error?.code);
  }

  if (phase === "--expired") {
  // This one-minute policy is isolated to the creation of this fixture and
  // restored before waiting or making any other checkout request.
  await setMinutes(1);
  policyShortened = true;
  let expiredOrder;
  try {
    const expiredProduct = await createProduct("expired", operator);
    expiredOrder = await confirmedOrder(customer, expiredProduct);
  } finally {
    await setMinutes(oldMinutes);
    policyShortened = false;
  }
  const reservation = need(await db.from("stock_reservations")
    .select("expires_at,order_items!inner(order_id)")
    .eq("order_items.order_id", expiredOrder).single(), "reserva de un minuto");
  const remaining = Date.parse(reservation.expires_at) - Date.now();
  if (remaining > 0) {
    console.log(`Esperando ${Math.ceil(remaining / 1000) + 2} s para vencer solo la reserva ficticia; política DEV ya restaurada.`);
    await new Promise((resolve) => setTimeout(resolve, remaining + 2000));
  }
  const expiredPrepare = await operator.client.rpc("record_staff_shipment_event", prepareArgs(expiredOrder));
  const expiredShipment = await db.from("shipments").select("id").eq("order_id", expiredOrder);
  check("reserva online vencida no permite preparar", Boolean(expiredPrepare.error)
    && !expiredShipment.error && expiredShipment.data?.length === 0, expiredPrepare.error?.code);
  const cancellation = await customer.client.rpc("cancel_unprepared_confirmed_order", {
    p_order_id: expiredOrder, p_reason: `${tag} cerrar reserva vencida de prueba`,
    p_idempotency_key: randomUUID()
  });
  check("fixture vencida cancela y libera reserva sin cobro", !cancellation.error && Boolean(cancellation.data),
    cancellation.error?.code);
  }
} catch (error) {
  check("suite sin excepción", false,
    error instanceof Error ? error.message.replace(/[^A-Za-z0-9:_ -]/g, "") : "desconocido");
} finally {
  if (policyShortened && oldMinutes !== null) {
    try { await setMinutes(oldMinutes); }
    catch { check("restauración de política online", false); }
  }
  for (const id of products) {
    const row = await db.from("products").update({ publication_status: "draft" }).eq("id", id);
    if (row.error) check("producto QA despublicado", false, row.error.code);
  }
  if (categoryId) {
    const row = await db.from("categories").update({ active: false }).eq("id", categoryId);
    if (row.error) check("categoría QA desactivada", false, row.error.code);
  }
  for (const id of users) {
    const profile = await db.from("profiles").update({ active: false }).eq("id", id);
    const role = await db.from("user_roles").update({ role: "customer" }).eq("user_id", id);
    if (profile.error || role.error) check("cuenta QA desactivada", false,
      profile.error?.code ?? role.error?.code);
  }
  const passed = results.filter(Boolean).length;
  console.log(`${passed === results.length ? "PASS" : "FAIL"}: guard de preparación online DEV ${phase} ${passed}/${results.length}; ${tag}.`);
  console.log("Sin correos, cobros reales ni despacho físico; política online restaurada y fixtures despublicadas.");
  if (passed !== results.length) process.exitCode = 1;
}

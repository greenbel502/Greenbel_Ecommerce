/** DEV-only QA for migration 020. Stage an old-policy order before applying 020. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const phase = process.argv[2];
const stagedPath = process.argv[3];
if (!(phase === "--stage" && process.argv.length === 3
  || phase === "--verify" && process.argv.length === 4)) {
  console.error("NO EJECUTADO: --stage antes de 020; --verify /private/tmp/greenbel-prep-020-*.json después de 020.");
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
const tag = `PRUEBA DEV prep-020 ${randomUUID().slice(0, 8)}`;
const slug = tag.toLowerCase().replaceAll(" ", "-");
const users = [];
const products = [];
let categoryId = null;
const checks = [];
const pickupService = "a1000000-0000-4000-8000-000000000001";
const ownService = "a1000000-0000-4000-8000-000000000002";
const fixedZone = "a2000000-0000-4000-8000-000000000001";
const onlineOption = "a4000000-0000-4000-8000-000000000003";
const ownCashOption = "a4000000-0000-4000-8000-000000000004";
const ownOnlineOption = "a4000000-0000-4000-8000-000000000006";

function check(name, okay, code = "") {
  checks.push(Boolean(okay));
  console.log(`${okay ? "PASS" : "FAIL"}: ${name}${code ? ` (${code})` : ""}`);
}
function need(response, label) {
  if (response.error || response.data === null || response.data === undefined) {
    throw new Error(`${label}: ${response.error?.code ?? "sin_datos"}`);
  }
  return response.data;
}
async function account(label, role = "customer") {
  const email = `${slug}-${label}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const user = need(await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { qa_marker: tag }
  }), `Auth ${label}`).user;
  users.push(user.id);
  if (role !== "customer") need(await db.from("user_roles")
    .update({ role }).eq("user_id", user.id).select("role").single(), `rol ${label}`);
  const client = createClient(url, publicKey, opts);
  need(await client.auth.signInWithPassword({ email, password }), `sesión ${label}`);
  return { id: user.id, client };
}
async function product(label, operator) {
  const row = need(await db.from("products").insert({
    kind: "equipment", category_id: categoryId,
    sku: `QA-PREP020-${slug.slice(-8).toUpperCase()}-${label}`,
    slug: `${slug}-${label}`, name: `${tag} ${label}`,
    short_description: "Producto ficticio exclusivo DEV; sin mercancía real.",
    publication_status: "published", regular_price: "60.00", currency: "GTQ"
  }).select("id").single(), `producto ${label}`);
  products.push(row.id);
  need(await operator.client.rpc("record_inventory_change", {
    p_product_id: row.id, p_kind: "stock_entry", p_quantity_delta: 3,
    p_reason: tag, p_reference: tag, p_idempotency_key: randomUUID()
  }), `inventario ${label}`);
  return row.id;
}
function selection(productId, delivery, paymentOptionId) {
  return { lines: [{ productId, quantity: 1 }],
    billing: { kind: "cf", firstName: "Cliente", lastName: "PRUEBA DEV", phone: "5555 5555" },
    delivery, paymentOptionId };
}
async function order(customer, intent) {
  const reviewed = need(await customer.client.rpc("review_checkout", {
    p_intent: intent, p_review_key: randomUUID(), p_review_id: null
  }), "revisión checkout");
  return need(await customer.client.rpc("confirm_checkout", {
    p_review_id: reviewed.reviewId, p_intent: intent,
    p_accepted_revision: reviewed.revision, p_accepted_total: reviewed.total,
    p_idempotency_key: randomUUID()
  }), "confirmación checkout").orderId;
}
function shipmentArgs(orderId, event, key = randomUUID()) {
  return { p_order_id: orderId, p_event: event, p_tracking_number: null,
    p_tracking_url: null, p_evidence_reference: `${tag} ${event}`,
    p_idempotency_key: key };
}
async function paymentSuccess(orderId) {
  const attempt = need(await db.rpc("create_dev_online_payment_attempt", {
    p_order_id: orderId, p_idempotency_key: randomUUID()
  }), "intento online");
  return need(await db.rpc("record_dev_online_payment_event", {
    p_payment_id: attempt.paymentId, p_event_key: randomUUID(), p_outcome: "success",
    p_evidence_reference: `PRUEBA DEV: ${tag} pago simulado confirmado`
  }), "evento online");
}
async function balance(productId) {
  return need(await db.from("inventory_balances")
    .select("stock_balance,reserved").eq("product_id", productId).single(), "saldo");
}
async function closeFixtures() {
  for (const id of products) {
    const result = await db.from("products").update({ publication_status: "draft" }).eq("id", id);
    if (result.error) check("producto QA despublicado", false, result.error.code);
  }
  if (categoryId) {
    const result = await db.from("categories").update({ active: false }).eq("id", categoryId);
    if (result.error) check("categoría QA desactivada", false, result.error.code);
  }
  for (const id of users) {
    const profile = await db.from("profiles").update({ active: false }).eq("id", id);
    const role = await db.from("user_roles").update({ role: "customer" }).eq("user_id", id);
    const banned = await db.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    if (profile.error || role.error || banned.error) check("cuenta QA desactivada", false,
      profile.error?.code ?? role.error?.code ?? banned.error?.code);
  }
}

try {
  if (phase === "--stage") {
    const operator = await account("stage-operator", "operator");
    const customer = await account("stage-customer");
    categoryId = need(await db.from("categories").insert({
      name: `${tag} categoría`, slug, active: true
    }).select("id").single(), "categoría").id;
    const productId = await product("historico-retiro", operator);
    const orderId = await order(customer, selection(productId,
      { kind: "pickup", serviceId: pickupService }, onlineOption));
    const prepared = need(await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(orderId, "prepare")), "preparación histórica antes de 020");
    const currentBalance = await balance(productId);
    const ownProductId = await product("historico-envio", operator);
    const ownOrderId = await order(customer, selection(ownProductId, {
      kind: "shipping", serviceId: ownService, zoneId: fixedZone,
      chargeMode: "with_order", recipientName: "Cliente PRUEBA DEV",
      recipientPhone: "5555 5555", addressLine: "Dirección ficticia; no entregar mercancía"
    }, ownOnlineOption));
    const ownShipmentId = need(await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(ownOrderId, "prepare")), "preparación histórica de envío");
    const ownBalance = await balance(ownProductId);
    const file = `/private/tmp/greenbel-prep-020-${randomUUID()}.json`;
    writeFileSync(file, JSON.stringify({ marker: "PRUEBA DEV prep-020", ref,
      pickup: { orderId, productId, shipmentId: prepared },
      own: { orderId: ownOrderId, productId: ownProductId, shipmentId: ownShipmentId }
    }), { mode: 0o600, flag: "wx" });
    check("fixtures históricas online preparadas sin pago antes de 020",
      Number(currentBalance.stock_balance) === 3 && Number(currentBalance.reserved) === 1
      && Number(ownBalance.stock_balance) === 3 && Number(ownBalance.reserved) === 1);
    console.log(`Archivo de fixture (IDs sin credenciales): ${file}`);
  } else {
    const staged = JSON.parse(readFileSync(stagedPath, "utf8"));
    assert.equal(staged.marker, "PRUEBA DEV prep-020");
    assert.equal(staged.ref, ref);
    for (const fixture of [staged.pickup, staged.own])
      for (const key of ["orderId", "productId", "shipmentId"])
        assert.match(fixture[key], /^[0-9a-f-]{36}$/i);
    const operator = await account("verify-operator", "operator");
    const customer = await account("verify-customer");
    categoryId = need(await db.from("categories").insert({
      name: `${tag} categoría`, slug, active: true
    }).select("id").single(), "categoría").id;

    const oldUnpaid = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(staged.pickup.orderId, "ready_for_pickup"));
    const oldEarlyDelivery = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(staged.pickup.orderId, "deliver"));
    const oldShipment = need(await db.from("shipments")
      .select("status").eq("id", staged.pickup.shipmentId).single(), "retiro histórico");
    check("retiro online histórico no pasa a listo ni entregado impagado",
      Boolean(oldUnpaid.error) && Boolean(oldEarlyDelivery.error)
      && oldShipment.status === "preparing", oldUnpaid.error?.code);
    const oldDispatch = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(staged.own.orderId, "dispatch"));
    const ownEarlyDelivery = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(staged.own.orderId, "deliver"));
    const ownOldShipment = need(await db.from("shipments")
      .select("status").eq("id", staged.own.shipmentId).single(), "envío propio histórico");
    check("envío online histórico no pasa a despacho ni entrega impagado",
      Boolean(oldDispatch.error) && Boolean(ownEarlyDelivery.error)
      && ownOldShipment.status === "preparing", oldDispatch.error?.code);
    const oldSuccess = await paymentSuccess(staged.pickup.orderId);
    const oldReady = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(staged.pickup.orderId, "ready_for_pickup"));
    check("pedido histórico avanza solo tras pago confirmado y consumo",
      oldSuccess.processingResult === "succeeded" && !oldReady.error, oldReady.error?.code);
    const ownSuccess = await paymentSuccess(staged.own.orderId);
    const ownDispatch = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(staged.own.orderId, "dispatch"));
    check("envío online histórico despacha tras pago confirmado y consumo",
      ownSuccess.processingResult === "succeeded" && !ownDispatch.error,
      ownDispatch.error?.code);

    const onlineProduct = await product("online-nuevo", operator);
    const onlineOrder = await order(customer, selection(onlineProduct,
      { kind: "pickup", serviceId: pickupService }, onlineOption));
    const deniedCustomer = await customer.client.rpc("record_staff_shipment_event",
      shipmentArgs(onlineOrder, "prepare"));
    check("cliente no prepara su propio pedido", deniedCustomer.error?.code === "42501",
      deniedCustomer.error?.code);
    const prepareKey = randomUUID();
    const beforePayment = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(onlineOrder, "prepare", prepareKey));
    const noShipment = await db.from("shipments").select("id").eq("order_id", onlineOrder);
    const beforeBalance = await balance(onlineProduct);
    check("reserva online vigente sola no permite preparar",
      Boolean(beforePayment.error) && !noShipment.error && noShipment.data?.length === 0
      && Number(beforeBalance.stock_balance) === 3 && Number(beforeBalance.reserved) === 1,
      beforePayment.error?.code);
    const onlineSuccess = await paymentSuccess(onlineOrder);
    const prepared = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(onlineOrder, "prepare", prepareKey));
    const replay = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(onlineOrder, "prepare", prepareKey));
    const afterBalance = await balance(onlineProduct);
    check("pago confirmado permite preparar una sola vez",
      onlineSuccess.processingResult === "succeeded" && !prepared.error && !replay.error
      && prepared.data === replay.data && Number(afterBalance.stock_balance) === 2
      && Number(afterBalance.reserved) === 0, prepared.error?.code ?? replay.error?.code);

    const codProduct = await product("cod", operator);
    const codOrder = await order(customer, selection(codProduct, {
      kind: "shipping", serviceId: ownService, zoneId: fixedZone,
      chargeMode: "with_order", recipientName: "Cliente PRUEBA DEV",
      recipientPhone: "5555 5555", addressLine: "Dirección ficticia; no entregar mercancía"
    }, ownCashOption));
    const codPrepared = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(codOrder, "prepare"));
    const codReserved = await balance(codProduct);
    check("contra entrega permite preparación con reserva y sin pago",
      !codPrepared.error && Number(codReserved.stock_balance) === 3
      && Number(codReserved.reserved) === 1, codPrepared.error?.code);
    const codDispatchKey = randomUUID();
    const codDispatched = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(codOrder, "dispatch", codDispatchKey));
    const codReplay = await operator.client.rpc("record_staff_shipment_event",
      shipmentArgs(codOrder, "dispatch", codDispatchKey));
    const codAfter = await balance(codProduct);
    const codPayments = await db.from("payments").select("id").eq("order_id", codOrder)
      .eq("status", "test_succeeded");
    check("contra entrega despacha y consolida stock antes de cobrar una vez",
      !codDispatched.error && !codReplay.error && codDispatched.data === codReplay.data
      && Number(codAfter.stock_balance) === 2 && Number(codAfter.reserved) === 0
      && !codPayments.error && codPayments.data?.length === 0,
      codDispatched.error?.code ?? codReplay.error?.code);

    if (checks.every(Boolean)) unlinkSync(stagedPath);
  }
} catch (error) {
  check("suite sin excepción", false,
    error instanceof Error ? error.message.replace(/[^A-Za-z0-9:_ -]/g, "") : "desconocido");
} finally {
  await closeFixtures();
  const passed = checks.filter(Boolean).length;
  console.log(`${passed === checks.length ? "PASS" : "FAIL"}: preparación online/COD DEV ${phase} ${passed}/${checks.length}; ${tag}.`);
  console.log("Sin credenciales publicadas, correos, cobros reales ni despacho físico; fixtures despublicadas y cuentas desactivadas.");
  if (passed !== checks.length) process.exitCode = 1;
}

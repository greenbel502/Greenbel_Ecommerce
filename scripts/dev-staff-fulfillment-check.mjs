/** Direct, isolated DEV QA of 012. Leaves fictional inactive audit fixtures. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.argv[2] !== "--run" || process.argv.length !== 3) {
  console.error("NO EJECUTADO: usar --run solamente contra DEV enlazado.");
  process.exit(2);
}
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const key = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secret = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && key && secret && linked === ref);
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled");

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(url, secret, opts);
const anon = createClient(url, key, opts);
const tag = `PRUEBA DEV staff ${randomUUID().slice(0, 8)}`;
const slug = tag.toLowerCase().replaceAll(" ", "-");
const ids = {
  pickup: "a1000000-0000-4000-8000-000000000001",
  own: "a1000000-0000-4000-8000-000000000002",
  external: "a1000000-0000-4000-8000-000000000003",
  fixedZone: "a2000000-0000-4000-8000-000000000001",
  manualZone: "a2000000-0000-4000-8000-000000000002",
  pickupCash: "a4000000-0000-4000-8000-000000000001",
  ownCash: "a4000000-0000-4000-8000-000000000004",
  externalCod: "a4000000-0000-4000-8000-000000000008"
};
const users = [];
const products = [];
let categoryId = null;
const checks = [];
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
  const created = need(await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { qa_marker: tag }
  }), `Auth ${label}`).user;
  users.push(created.id);
  if (role !== "customer") need(await db.from("user_roles")
    .update({ role }).eq("user_id", created.id).select("role").single(), `rol ${label}`);
  const client = createClient(url, key, opts);
  need(await client.auth.signInWithPassword({ email, password }), `sesión ${label}`);
  return { id: created.id, client };
}
async function product(label, staff) {
  const name = `${tag} ${label}`;
  const row = need(await db.from("products").insert({
    kind: "equipment", category_id: categoryId, sku: `QA-STAFF-${slug.slice(-8).toUpperCase()}-${label}`,
    slug: `${slug}-${label}`, name, short_description: "Producto ficticio exclusivo DEV.",
    publication_status: "published", regular_price: "60.00", currency: "GTQ"
  }).select("id").single(), `producto ${label}`);
  products.push(row.id);
  need(await staff.client.rpc("record_inventory_change", {
    p_product_id: row.id, p_kind: "stock_entry", p_quantity_delta: 3,
    p_reason: tag, p_reference: tag, p_idempotency_key: randomUUID()
  }), `inventario ${label}`);
  return row.id;
}
function shipping(kind, serviceId, zoneId, chargeMode) {
  return { kind: "shipping", serviceId, zoneId, chargeMode,
    recipientName: "Cliente PRUEBA DEV", recipientPhone: "5555 5555",
    addressLine: "Dirección ficticia PRUEBA DEV; no entregar mercancía" };
}
function intent(productId, delivery, paymentOptionId) {
  return { lines: [{ productId, quantity: 1 }],
    billing: { kind: "cf", firstName: "Cliente", lastName: "PRUEBA DEV", phone: "5555 5555" },
    delivery, paymentOptionId };
}
async function review(customer, selection, reviewId = null) {
  return need(await customer.client.rpc("review_checkout", {
    p_intent: selection, p_review_key: randomUUID(), p_review_id: reviewId
  }), "revisión checkout");
}
async function confirm(customer, selection, reviewed) {
  return need(await customer.client.rpc("confirm_checkout", {
    p_review_id: reviewed.reviewId, p_intent: selection,
    p_accepted_revision: reviewed.revision, p_accepted_total: reviewed.total,
    p_idempotency_key: randomUUID()
  }), "confirmación checkout");
}
function shipmentArgs(orderId, event, keyValue = randomUUID(), tracking = null) {
  return { p_order_id: orderId, p_event: event,
    p_tracking_number: tracking, p_tracking_url: null,
    p_evidence_reference: `${tag} ${event}`, p_idempotency_key: keyValue };
}
async function shipment(staff, orderId, event, tracking = null) {
  return need(await staff.client.rpc("record_staff_shipment_event",
    shipmentArgs(orderId, event, randomUUID(), tracking)), `envío ${event}`);
}
function paymentArgs(orderId, method, outcome, keyValue = randomUUID()) {
  return { p_order_id: orderId, p_method: method, p_outcome: outcome,
    p_evidence_reference: `${tag} cobro ${outcome}`, p_idempotency_key: keyValue };
}
async function balance(productId) {
  return need(await db.from("inventory_balances")
    .select("stock_balance,reserved").eq("product_id", productId).single(), "balance");
}
async function movementCount(productId, kind) {
  const row = await db.from("inventory_movements")
    .select("id", { count: "exact", head: true }).eq("product_id", productId).eq("kind", kind);
  if (row.error) throw new Error(`movimientos: ${row.error.code}`);
  return row.count;
}

try {
  console.log(`Fixture ficticia ${tag}`);
  const operator = await account("operator", "operator");
  const customer = await account("customer");
  const stranger = await account("stranger");
  categoryId = need(await db.from("categories").insert({
    name: `${tag} categoría`, slug, active: true
  }).select("id").single(), "categoría").id;
  const pickupProduct = await product("pickup", operator);
  const ownProduct = await product("own", operator);
  const codProduct = await product("cod", operator);

  // Retiro: terminal/efectivo rechazado remains unpaid; successful later
  // observation and handover consume precisely one reserved unit.
  const pickupIntent = intent(pickupProduct, { kind: "pickup", serviceId: ids.pickup }, ids.pickupCash);
  const pickupReview = await review(customer, pickupIntent);
  const pickupOrder = (await confirm(customer, pickupIntent, pickupReview)).orderId;
  const customerDenied = await customer.client.rpc("record_staff_shipment_event",
    shipmentArgs(pickupOrder, "prepare"));
  const strangerRead = await stranger.client.from("orders").select("id").eq("id", pickupOrder);
  check("cliente no opera envío y otro cliente no ve pedido", customerDenied.error?.code === "42501"
    && !strangerRead.error && strangerRead.data?.length === 0, customerDenied.error?.code);
  const prepared = shipmentArgs(pickupOrder, "prepare");
  const firstPrep = need(await operator.client.rpc("record_staff_shipment_event", prepared), "preparación retiro");
  const repeatPrep = need(await operator.client.rpc("record_staff_shipment_event", prepared), "reintento preparación");
  check("preparación de retiro idempotente", firstPrep === repeatPrep);
  await shipment(operator, pickupOrder, "ready_for_pickup");
  const rejected = need(await operator.client.rpc("record_staff_test_payment",
    paymentArgs(pickupOrder, "cash", "failed")), "efectivo rechazado");
  const rejectedRow = need(await db.from("payments")
    .select("status,paid_at").eq("id", rejected).single(), "pago rechazado");
  check("resultado rechazado no se marca pagado", rejectedRow.status === "test_failed"
    && rejectedRow.paid_at === null);
  const paidArgs = paymentArgs(pickupOrder, "cash", "succeeded");
  const paid = need(await operator.client.rpc("record_staff_test_payment", paidArgs), "efectivo aprobado");
  const paidAgain = need(await operator.client.rpc("record_staff_test_payment", paidArgs), "reintento efectivo");
  check("cobro ficticio presencial idempotente", paid === paidAgain);
  const pickupHandover = shipmentArgs(pickupOrder, "deliver");
  const handover = need(await operator.client.rpc("record_staff_shipment_event", pickupHandover), "entrega retiro");
  const handoverAgain = need(await operator.client.rpc("record_staff_shipment_event", pickupHandover), "reintento entrega");
  const pickupBalance = await balance(pickupProduct);
  check("retiro consume una vez al cobrar y entregar", handover === handoverAgain
    && Number(pickupBalance.stock_balance) === 2 && Number(pickupBalance.reserved) === 0
    && await movementCount(pickupProduct, "pickup_handover") === 1);

  const pickupLine = need(await db.from("order_items")
    .select("id").eq("order_id", pickupOrder).single(), "línea retiro");
  const reviewRow = await db.from("reviews").insert({ customer_id: customer.id,
    product_id: pickupProduct, order_item_id: pickupLine.id, rating: 2,
    comment: `${tag} reseña ficticia`, moderation_status: "pending" }).select("id").single();
  const strangerReview = await db.from("reviews").insert({ customer_id: stranger.id,
    product_id: pickupProduct, order_item_id: pickupLine.id, rating: 5,
    comment: `${tag} reseña ajena`, moderation_status: "pending" });
  const publicReview = await anon.from("reviews").select("id").eq("id", reviewRow.data?.id ?? randomUUID());
  check("reseña entregada entra pendiente y ajena se rechaza", !reviewRow.error
    && Boolean(strangerReview.error) && !publicReview.error && publicReview.data?.length === 0,
    reviewRow.error?.code);
  const caseResult = await operator.client.rpc("register_manual_service_case", {
    p_order_id: pickupOrder, p_kind: "warranty", p_reason: `${tag} garantía ficticia`,
    p_items: [{ order_item_id: pickupLine.id, quantity: 1 }], p_idempotency_key: randomUUID()
  });
  check("operador abre garantía tras entrega sin reembolso", !caseResult.error && Boolean(caseResult.data),
    caseResult.error?.code);

  // Mensajería propia: concurrent dispatch attempts serialize at the order.
  const ownIntent = intent(ownProduct, shipping("own_delivery", ids.own, ids.fixedZone, "with_order"), ids.ownCash);
  const ownOrder = (await confirm(customer, ownIntent, await review(customer, ownIntent))).orderId;
  await shipment(operator, ownOrder, "prepare");
  const concurrent = await Promise.all([
    operator.client.rpc("record_staff_shipment_event", shipmentArgs(ownOrder, "dispatch")),
    operator.client.rpc("record_staff_shipment_event", shipmentArgs(ownOrder, "dispatch"))
  ]);
  const ownBalance = await balance(ownProduct);
  check("despachos concurrentes consumen una sola vez", concurrent.filter((row) => !row.error).length === 1
    && Number(ownBalance.stock_balance) === 2 && Number(ownBalance.reserved) === 0
    && await movementCount(ownProduct, "cod_dispatch") === 1);
  const earlyDelivery = await operator.client.rpc("record_staff_shipment_event", shipmentArgs(ownOrder, "deliver"));
  check("mensajería propia no entrega antes del cobro de prueba", Boolean(earlyDelivery.error));
  need(await operator.client.rpc("record_staff_test_payment",
    paymentArgs(ownOrder, "cash", "succeeded")), "cobro mensajería");
  await shipment(operator, ownOrder, "deliver");
  check("mensajería propia conserva pago/entrega separados", true);

  // External COD: dispatch consumes stock before collection. A post-delivery
  // return cannot erase the carrier's later report or recorded deposit.
  const codIntent = intent(codProduct, shipping("external", ids.external, ids.fixedZone, "at_destination"), ids.externalCod);
  const codOrder = (await confirm(customer, codIntent, await review(customer, codIntent))).orderId;
  await shipment(operator, codOrder, "prepare");
  const noGuide = await operator.client.rpc("record_staff_shipment_event", shipmentArgs(codOrder, "dispatch"));
  check("transportadora externa exige guía", Boolean(noGuide.error));
  await shipment(operator, codOrder, "dispatch", `${tag} guía ficticia`);
  const codBalance = await balance(codProduct);
  check("COD despachado descuenta antes del cobro", Number(codBalance.stock_balance) === 2
    && Number(codBalance.reserved) === 0 && await movementCount(codProduct, "cod_dispatch") === 1);
  await shipment(operator, codOrder, "deliver");
  await shipment(operator, codOrder, "returned");
  const codPayment = need(await operator.client.rpc("record_staff_test_payment",
    paymentArgs(codOrder, "carrier_cod", "succeeded")), "COD reportado");
  const codShipment = need(await db.from("shipments")
    .select("id,cod_amount,status,delivered_at").eq("order_id", codOrder).single(), "envío COD");
  const statementArgs = { p_shipment_id: codShipment.id, p_gross_collected: "99.00",
    p_commission: "4.00", p_shipping_deducted: "40.00", p_other_deductions: "0.00",
    p_commission_notes: `${tag} comisión ficticia`, p_deduction_notes: `${tag} flete ficticio`,
    p_variance_notes: `${tag} diferencia ficticia de Q1`, p_idempotency_key: randomUUID() };
  const statement = need(await operator.client.rpc("record_staff_carrier_statement", statementArgs), "reporte transportadora");
  const statementAgain = need(await operator.client.rpc("record_staff_carrier_statement", statementArgs), "reintento reporte");
  const statementRow = need(await db.from("carrier_settlements")
    .select("status,payment_id,expected_net").eq("id", statement).single(), "liquidación");
  check("reporte tras retorno conserva discrepancia y vínculo de cobro", statement === statementAgain
    && codShipment.status === "returned" && codShipment.delivered_at !== null
    && statementRow.status === "disputed" && statementRow.payment_id === codPayment
    && Number(statementRow.expected_net) === 55);
  const receiptArgs = { p_statement_id: statement, p_amount: "25.00",
    p_bank_reference: `${tag} depósito ficticio`, p_idempotency_key: randomUUID() };
  const receipt = need(await operator.client.rpc("record_staff_carrier_receipt", receiptArgs), "depósito parcial");
  const receiptAgain = need(await operator.client.rpc("record_staff_carrier_receipt", receiptArgs), "reintento depósito");
  const settled = need(await db.from("carrier_settlements")
    .select("status").eq("id", statement).single(), "diferencia posterior");
  check("depósito idempotente no borra discrepancia", receipt === receiptAgain && settled.status === "disputed");

  // Manual shipping offer is only transport acceptance; later review owns
  // price/stock and still creates no reservation until confirmation.
  const manualIntent = intent(ownProduct,
    shipping("own_delivery", ids.own, ids.manualZone, "with_order"), ids.ownCash);
  const pending = await review(customer, manualIntent);
  check("tarifa manual deja pedido pendiente sin total", pending.stage === "pending_shipping"
    && pending.total === null);
  const offerArgs = { p_order_id: pending.reviewId, p_fee: "27.00",
    p_charge_mode: "with_order", p_terms: `${tag} transporte ficticio`, p_idempotency_key: randomUUID() };
  const offer = need(await operator.client.rpc("offer_staff_shipping_proposal", offerArgs), "propuesta manual");
  const offerReplay = need(await operator.client.rpc("offer_staff_shipping_proposal", offerArgs), "reintento propuesta");
  const foreignAcceptance = await stranger.client.rpc("accept_shipping_proposal", { p_proposal_id: offer });
  const accepted = need(await customer.client.rpc("accept_shipping_proposal", { p_proposal_id: offer }), "aceptación transporte");
  const beforeReviewBalance = await balance(ownProduct);
  const finalReview = await review(customer, manualIntent, pending.reviewId);
  const afterReviewBalance = await balance(ownProduct);
  check("propuesta manual propia, sin reserva, exige revisión nueva", offer === offerReplay
    && foreignAcceptance.error?.code === "42501" && accepted === offer
    && finalReview.stage === "draft" && Number(finalReview.total) === 87
    && Number(beforeReviewBalance.reserved) === Number(afterReviewBalance.reserved));
} catch (error) {
  check("suite sin excepción", false,
    error instanceof Error ? error.message.replace(/[^A-Za-z0-9:_ -]/g, "") : "desconocido");
} finally {
  for (const productId of products) {
    const result = await db.from("products").update({ publication_status: "draft" }).eq("id", productId);
    if (result.error) check("producto ficticio despublicado", false, result.error.code);
  }
  if (categoryId) {
    const result = await db.from("categories").update({ active: false }).eq("id", categoryId);
    if (result.error) check("categoría ficticia desactivada", false, result.error.code);
  }
  for (const id of users) {
    const profile = await db.from("profiles").update({ active: false }).eq("id", id);
    const role = await db.from("user_roles").update({ role: "customer" }).eq("user_id", id);
    if (profile.error || role.error) check("cuenta QA desactivada", false,
      profile.error?.code ?? role.error?.code);
  }
  const passed = checks.filter(Boolean).length;
  console.log(`${passed === checks.length ? "PASS" : "FAIL"}: staff fulfillment DEV ${passed}/${checks.length}; ${tag}.`);
  console.log("Fixture auditada: productos/categoría inactivos y cuentas desactivadas; ningún correo, cobro real o despacho físico.");
  if (passed !== checks.length) process.exitCode = 1;
}

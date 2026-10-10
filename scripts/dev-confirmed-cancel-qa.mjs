import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Explicit DEV-only write QA of direct confirmed cancellation. Rows are
// fictitious and labelled; no real charge, email, dispatch or refund occurs.
if (process.argv.length !== 3 || process.argv[2] !== "--write-fixtures") {
  throw new Error("Se requiere --write-fixtures para esta QA de escritura en DEV.");
}
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
const publicKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secretKey = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
if (process.env.APP_ENV !== "DEV" || !ref || !url || linked !== ref
  || !publicKey || !secretKey || new URL(url).protocol !== "https:"
  || new URL(url).hostname !== `${ref}.supabase.co`
  || (process.env.DEV_EMAIL_DELIVERY_MODE && process.env.DEV_EMAIL_DELIVERY_MODE !== "disabled")) {
  throw new Error("Enlace, URL, claves o pausa de correo DEV no coinciden.");
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, secretKey, options);
const anon = createClient(url, publicKey, options);
const tag = `qa-devcancel-${randomBytes(5).toString("hex")}`;
const results = [];
const accounts = [];
const fixture = { productId: null, orders: [] };
const code = (error) => error?.code ?? (error?.status ? `HTTP ${error.status}` : "sin-codigo");
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` (${detail})` : ""}`);
}
function need(result, label) {
  if (result.error || !result.data) throw new Error(`${label}: ${code(result.error)}`);
  return result.data;
}
function rejected(result) {
  return Boolean(result.error?.code && result.error.code !== "PGRST000");
}
function count(rows) { return rows?.length ?? -1; }
async function account(label, role = "customer") {
  const email = `${tag}-${label}@example.invalid`;
  const password = `${randomBytes(25).toString("base64url")}Aa1!`;
  const user = need(await service.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { test_fixture: `PRUEBA DEV ${tag}` }
  }), `Auth ${label}`).user;
  if (!user?.id) throw new Error(`Auth ${label}: sin identidad`);
  accounts.push(user.id);
  need(await service.from("profiles").update({ display_name: `PRUEBA DEV ${tag} ${label}` })
    .eq("id", user.id).select("id").single(), `perfil ${label}`);
  if (role !== "customer") {
    need(await service.from("user_roles").update({ role }).eq("user_id", user.id)
      .select("user_id").single(), `rol ${label}`);
  }
  const client = createClient(url, publicKey, options);
  const session = need(await client.auth.signInWithPassword({ email, password }), `ingreso ${label}`);
  if (session.user?.id !== user.id) throw new Error(`ingreso ${label}: identidad distinta`);
  return { id: user.id, client };
}
async function balance() {
  return need(await service.from("inventory_balances")
    .select("stock_balance,reserved").eq("product_id", fixture.productId).single(), "balance");
}
async function reservation(orderId) {
  const item = need(await service.from("order_items").select("id").eq("order_id", orderId).single(), "línea");
  return need(await service.from("stock_reservations")
    .select("id,status,expires_at,close_operation_id")
    .eq("order_item_id", item.id).single(), "reserva");
}
async function checkout(client, pickupId, optionId, label) {
  const intent = {
    lines: [{ productId: fixture.productId, quantity: 1 }],
    billing: { kind: "cf", firstName: "PRUEBA", lastName: `DEV ${label}`, phone: "55555555" },
    delivery: { kind: "pickup", serviceId: pickupId }, paymentOptionId: optionId
  };
  const review = need(await client.rpc("review_checkout", {
    p_intent: intent, p_review_key: randomUUID(), p_review_id: null
  }), `revisión ${label}`);
  if (review.stage !== "draft" || Number(review.total) !== 90) {
    throw new Error(`revisión ${label}: importe o etapa inesperados`);
  }
  const confirmed = need(await client.rpc("confirm_checkout", {
    p_review_id: review.reviewId, p_intent: intent,
    p_accepted_revision: review.revision, p_accepted_total: review.total,
    p_idempotency_key: randomUUID()
  }), `confirmación ${label}`);
  if (confirmed.stage !== "confirmed" || confirmed.orderId !== review.reviewId
    || confirmed.paymentStatus !== "pending" || !confirmed.reservationId) {
    throw new Error(`confirmación ${label}: estado inesperado`);
  }
  fixture.orders.push(confirmed.orderId);
  return confirmed.orderId;
}
function cancel(client, orderId, reason, key) {
  return client.rpc("cancel_unprepared_confirmed_order", {
    p_order_id: orderId, p_reason: reason, p_idempotency_key: key
  });
}

console.log("Supabase DEV: QA 013 de cancelación directa de pedido confirmado.");
console.log(`Fixture auditable PRUEBA DEV: ${tag}`);
try {
  const [settings, pickup, cash, online] = await Promise.all([
    service.from("checkout_settings").select("simulated_gateway_enabled,online_reservation_minutes")
      .eq("id", true).single(),
    service.from("delivery_services").select("id,kind,active")
      .eq("id", "a1000000-0000-4000-8000-000000000001").single(),
    service.from("service_payment_options").select("id,service_id,method,timing,active")
      .eq("id", "a4000000-0000-4000-8000-000000000001").single(),
    service.from("service_payment_options").select("id,service_id,method,timing,active")
      .eq("id", "a4000000-0000-4000-8000-000000000003").single()
  ]);
  for (const [result, label] of [[settings, "política"], [pickup, "retiro"],
    [cash, "cash"], [online, "online"]]) need(result, label);
  if (!settings.data.simulated_gateway_enabled || pickup.data.kind !== "pickup"
    || !pickup.data.active || !cash.data.active || !online.data.active
    || cash.data.service_id !== pickup.data.id || online.data.service_id !== pickup.data.id
    || cash.data.method !== "cash" || cash.data.timing !== "on_pickup"
    || online.data.method !== "online_gateway" || online.data.timing !== "prepaid") {
    throw new Error("Configuración PRUEBA DEV de retiro y pagos no disponible");
  }
  check("configuración y enlace DEV verificados", true,
    `reserva online ${settings.data.online_reservation_minutes} min`);

  const [a, b, staff] = await Promise.all([
    account("a"), account("b"), account("staff", "operator")
  ]);
  check("Auth: A, B y operador ficticios con sesión", true);
  const category = need(await service.from("categories").insert({
    name: `PRUEBA DEV ${tag} categoría`, slug: `${tag}-categoria`, active: true
  }).select("id").single(), "categoría");
  const product = need(await service.from("products").insert({
    sku: `QA-DEV-CANCEL-${tag.toUpperCase()}`, slug: `${tag}-producto`,
    name: `PRUEBA DEV ${tag} producto inexistente`, kind: "equipment",
    category_id: category.id, regular_price: "90.00", currency: "GTQ",
    publication_status: "published", short_description: "PRUEBA DEV: no existe ni se despacha."
  }).select("id").single(), "producto");
  fixture.productId = product.id;
  need(await staff.client.rpc("record_inventory_change", {
    p_product_id: product.id, p_kind: "stock_entry", p_quantity_delta: 5,
    p_reason: `PRUEBA DEV ${tag} stock ficticio`, p_reference: tag,
    p_idempotency_key: randomUUID()
  }), "stock inicial");
  const initial = await balance();
  check("SKU ficticio inicia 5 disponibles, 0 reservados",
    Number(initial.stock_balance) === 5 && Number(initial.reserved) === 0);

  const [cancelOrder, paymentBlockOrder, preparedOrder, expiryOrder] = [
    await checkout(a.client, pickup.data.id, cash.data.id, "cancelación"),
    await checkout(a.client, pickup.data.id, online.data.id, "pago pendiente"),
    await checkout(a.client, pickup.data.id, cash.data.id, "preparación"),
    await checkout(a.client, pickup.data.id, online.data.id, "expiración")
  ];
  const afterConfirm = await balance();
  check("cuatro pedidos confirmados reservan cuatro unidades sin consumo",
    Number(afterConfirm.stock_balance) === 5 && Number(afterConfirm.reserved) === 4);

  const unauthorized = await Promise.all([
    cancel(b.client, cancelOrder, `PRUEBA DEV ${tag} intruso B`, `${tag}-b`),
    cancel(staff.client, cancelOrder, `PRUEBA DEV ${tag} intruso staff`, `${tag}-staff`),
    cancel(anon, cancelOrder, `PRUEBA DEV ${tag} intruso anon`, `${tag}-anon`)
  ]);
  check("B, operador ajeno y anónimo no cancelan pedido de A",
    unauthorized.every(rejected), unauthorized.map((r) => code(r.error)).join(","));
  const foreign = await b.client.from("orders").select("id").eq("id", cancelOrder);
  check("RLS oculta pedido de A al cliente B", !foreign.error && count(foreign.data) === 0);

  const cancellationKey = `${tag}-direct-confirmed`;
  const reason = `PRUEBA DEV ${tag}: cliente desiste antes de preparación y pago`;
  const first = need(await cancel(a.client, cancelOrder, reason, cancellationKey), "cancelación A");
  const replay = need(await cancel(a.client, cancelOrder, reason, cancellationKey), "reintento A");
  const changed = await cancel(a.client, cancelOrder, `${reason} distinto`, cancellationKey);
  const another = await cancel(a.client, cancelOrder, reason, `${tag}-other-key`);
  check("reintento exacto devuelve el mismo caso y claves alteradas fallan",
    first === replay && rejected(changed) && rejected(another),
    `${code(changed.error)}/${code(another.error)}`);

  const [orderAfter, caseAfter, releaseOps, reserveAfter, noPayment, noShipment,
    auditAfter, balanceAfter] = await Promise.all([
    service.from("orders").select("stage,customer_id,confirmation_key")
      .eq("id", cancelOrder).single(),
    service.from("service_cases").select("id,kind,status,intake_path,reason,order_id,requested_by,closed_at")
      .eq("order_id", cancelOrder),
    service.from("inventory_operations").select("id,kind,idempotency_key")
      .eq("order_id", cancelOrder).eq("kind", "release"),
    reservation(cancelOrder),
    service.from("payments").select("id").eq("order_id", cancelOrder),
    service.from("shipments").select("id").eq("order_id", cancelOrder),
    service.from("audit_events").select("id,action,correlation_key")
      .eq("entity_id", cancelOrder).eq("action", "direct_confirmed_cancellation"),
    balance()
  ]);
  const readsOkay = [orderAfter, caseAfter, releaseOps, noPayment, noShipment, auditAfter]
    .every((r) => !r.error);
  check("cancelación cerró pedido y un caso directo con auditoría", readsOkay
    && orderAfter.data?.stage === "cancelled"
    && caseAfter.data.length === 1 && caseAfter.data[0].id === first
    && caseAfter.data[0].status === "closed"
    && caseAfter.data[0].intake_path === "direct_confirmed"
    && caseAfter.data[0].kind === "cancellation"
    && caseAfter.data[0].requested_by === a.id
    && Boolean(caseAfter.data[0].closed_at)
    && auditAfter.data.length === 1
    && auditAfter.data[0].correlation_key === cancellationKey);
  check("una liberación restaura disponible y no crea pago ni envío",
    releaseOps.data?.length === 1
    && releaseOps.data[0].idempotency_key === `direct-confirmed-release:${cancellationKey}`
    && reserveAfter.status === "released"
    && reserveAfter.close_operation_id === releaseOps.data[0].id
    && Number(balanceAfter.stock_balance) === 5 && Number(balanceAfter.reserved) === 3
    && count(noPayment.data) === 0 && count(noShipment.data) === 0);
  const ownerCase = await a.client.from("service_cases").select("id,status").eq("id", first);
  const foreignCase = await b.client.from("service_cases").select("id").eq("id", first);
  check("RLS muestra caso propio y oculta caso ajeno", !ownerCase.error && count(ownerCase.data) === 1
    && !foreignCase.error && count(foreignCase.data) === 0);

  const pendingPayment = need(await service.rpc("create_dev_online_payment_attempt", {
    p_order_id: paymentBlockOrder, p_idempotency_key: randomUUID()
  }), "intento online pendiente");
  const blockedByPayment = await cancel(a.client, paymentBlockOrder,
    `PRUEBA DEV ${tag} pago pendiente`, `${tag}-blocked-payment`);
  check("pago test_created impide cancelación directa", pendingPayment.status === "test_created"
    && rejected(blockedByPayment) && code(blockedByPayment.error) === "P0001");

  const preparedShipment = need(await staff.client.rpc("record_staff_shipment_event", {
    p_order_id: preparedOrder, p_event: "prepare", p_tracking_number: null,
    p_tracking_url: null, p_evidence_reference: `PRUEBA DEV ${tag} preparación sin despacho`,
    p_idempotency_key: `${tag}-prepare`
  }), "preparación ficticia");
  const blockedByPreparation = await cancel(a.client, preparedOrder,
    `PRUEBA DEV ${tag} preparado`, `${tag}-blocked-preparation`);
  const preparedState = need(await service.from("shipments").select("id,status")
    .eq("order_id", preparedOrder).single(), "estado preparación");
  check("envío preparado impide cancelación directa", Boolean(preparedShipment)
    && preparedState.status === "preparing" && rejected(blockedByPreparation)
    && code(blockedByPreparation.error) === "P0001");

  const expiryPayment = need(await service.rpc("create_dev_online_payment_attempt", {
    p_order_id: expiryOrder, p_idempotency_key: randomUUID()
  }), "intento para vencimiento real");
  const expiryReservation = await reservation(expiryOrder);
  if (expiryPayment.status !== "test_created" || expiryReservation.status !== "active"
    || !expiryReservation.expires_at) throw new Error("Fixture de expiración no quedó pendiente");
  const expiryPath = `/private/tmp/greenbel-dev-payment-expiry-${tag}.json`;
  writeFileSync(expiryPath, JSON.stringify({
    label: `PRUEBA DEV ${tag}`, orderId: expiryOrder,
    paymentId: expiryPayment.paymentId, productId: product.id,
    reservationId: expiryReservation.id, expiresAt: expiryReservation.expires_at,
    expectedStockBalance: "5.000", expectedReservedBeforeExpiry: "3.000",
    note: "Simulador DEV 011; evento expired solo tras expiresAt. No liberar stock automáticamente."
  }, null, 2) + "\n", { mode: 0o600 });
  check("fixture independiente de expiración real registrada sin secretos", true, expiryPath);
  const finalBalance = await balance();
  const finalMovements = need(await service.from("inventory_movements")
    .select("id,kind").eq("product_id", product.id), "movimientos finales");
  check("sin venta/cobro/consumo en QA de cancelación", Number(finalBalance.stock_balance) === 5
    && Number(finalBalance.reserved) === 3
    && finalMovements.length === 1 && finalMovements[0].kind === "stock_entry");
  console.log(`IDs de auditoría: producto ${product.id}; cancelado ${cancelOrder}; `
    + `pago pendiente ${paymentBlockOrder}; preparado ${preparedOrder}; vencimiento ${expiryOrder}.`);
} catch (error) {
  check("ejecución QA 013", false, error instanceof Error ? error.message : "error-desconocido");
} finally {
  for (const id of accounts) {
    const profile = await service.from("profiles").update({ active: false })
      .eq("id", id).select("active").single();
    const banned = await service.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    check(`cuenta ficticia ${id} desactivada`, !profile.error && profile.data?.active === false
      && !banned.error);
  }
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`Resultado QA 013: ${passed} PASS, ${failed} FAIL; fixtures PRUEBA DEV conservadas.`);
  if (failed) process.exitCode = 1;
}

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Direct, destructive-to-fixtures DEV integration QA. Run only with the explicit
// flag. All catalog, Auth, order and payment records are labelled PRUEBA DEV.
// No external provider, live charge, business email, dispatch or refund.
if (process.argv.length !== 3 || process.argv[2] !== "--write-fixtures") {
  throw new Error("Se requiere --write-fixtures para probar pagos simulados en DEV.");
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
const tag = `qa-devpay-${randomBytes(5).toString("hex")}`;
const tests = [];
const accounts = [];
const fixture = { categoryId: null, productId: null, orders: [] };

const code = (error) => error?.code ?? (error?.status ? `HTTP ${error.status}` : "sin-codigo");
function check(name, pass, detail = "") {
  tests.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` (${detail})` : ""}`);
}
function need(result, label) {
  if (result.error || !result.data) throw new Error(`${label}: ${code(result.error)}`);
  return result.data;
}
function rejected(result) {
  return Boolean(result.error?.code && result.error.code !== "PGRST000");
}
function money(value) { return Number(value); }

async function account(label, role) {
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
  if (role === "admin") {
    need(await service.from("user_roles").update({ role: "admin" })
      .eq("user_id", user.id).select("user_id").single(), `rol ${label}`);
  }
  const client = createClient(url, publicKey, options);
  const session = need(await client.auth.signInWithPassword({ email, password }), `sesión ${label}`);
  if (session.user?.id !== user.id) throw new Error(`sesión ${label}: identidad distinta`);
  return { id: user.id, client };
}

async function balance() {
  return need(await service.from("inventory_balances")
    .select("stock_balance,reserved").eq("product_id", fixture.productId).single(), "balance");
}
async function movements(kind) {
  return need(await service.from("inventory_movements")
    .select("id,quantity_delta,operation_id,order_item_id")
    .eq("product_id", fixture.productId).eq("kind", kind), `movimientos ${kind}`);
}
async function order(customer, optionId, pickupId, label) {
  const intent = {
    lines: [{ productId: fixture.productId, quantity: 1 }],
    billing: { kind: "cf", firstName: "PRUEBA", lastName: `DEV ${label}`, phone: "55555555" },
    delivery: { kind: "pickup", serviceId: pickupId },
    paymentOptionId: optionId
  };
  const review = need(await customer.rpc("review_checkout", {
    p_intent: intent, p_review_key: randomUUID(), p_review_id: null
  }), `revisión ${label}`);
  if (review.stage !== "draft" || money(review.total) !== 75) {
    throw new Error(`revisión ${label}: total o etapa inesperados`);
  }
  const confirmed = need(await customer.rpc("confirm_checkout", {
    p_review_id: review.reviewId, p_intent: intent,
    p_accepted_revision: review.revision, p_accepted_total: review.total,
    p_idempotency_key: randomUUID()
  }), `confirmación ${label}`);
  if (confirmed.stage !== "confirmed" || confirmed.orderId !== review.reviewId
    || !confirmed.reservationId || confirmed.paymentStatus !== "pending") {
    throw new Error(`confirmación ${label}: reserva o pago inesperados`);
  }
  fixture.orders.push(confirmed.orderId);
  return confirmed.orderId;
}
async function attempt(orderId, key = randomUUID()) {
  return need(await service.rpc("create_dev_online_payment_attempt", {
    p_order_id: orderId, p_idempotency_key: key
  }), "intento online");
}
async function event(paymentId, outcome, key = randomUUID(), evidence = `PRUEBA DEV: ${tag} ${outcome}`) {
  return need(await service.rpc("record_dev_online_payment_event", {
    p_payment_id: paymentId, p_event_key: key,
    p_outcome: outcome, p_evidence_reference: evidence
  }), `evento ${outcome}`);
}

console.log("Supabase DEV: QA 011 de pagos online simulados; sin cobros ni correos reales.");
console.log(`Fixture auditable PRUEBA DEV: ${tag}`);
try {
  const settings = need(await service.from("checkout_settings")
    .select("simulated_gateway_enabled,online_reservation_minutes").eq("id", true).single(), "política DEV");
  const pickup = need(await service.from("delivery_services")
    .select("id,active,kind").eq("id", "a1000000-0000-4000-8000-000000000001").single(), "retiro DEV");
  const option = need(await service.from("service_payment_options")
    .select("id,service_id,active,method,timing")
    .eq("id", "a4000000-0000-4000-8000-000000000003").single(), "medio online DEV");
  if (!settings.simulated_gateway_enabled || pickup.active !== true || pickup.kind !== "pickup"
    || option.active !== true || option.service_id !== pickup.id
    || option.method !== "online_gateway" || option.timing !== "prepaid") {
    throw new Error("Configuración PRUEBA DEV online no está activa; no se crearán pedidos");
  }
  check("destino y configuración de retiro online DEV verificados", true,
    `reserva ${settings.online_reservation_minutes} min`);

  const [admin, a, b] = await Promise.all([
    account("admin", "admin"), account("a", "customer"), account("b", "customer")
  ]);
  check("Auth: admin y dos clientes ficticios con sesión", true);

  const category = need(await service.from("categories").insert({
    name: `PRUEBA DEV ${tag} categoría`, slug: `${tag}-categoria`, active: true
  }).select("id").single(), "categoría");
  fixture.categoryId = category.id;
  const product = need(await service.from("products").insert({
    sku: `QA-DEV-PAY-${tag.toUpperCase()}`, slug: `${tag}-producto`,
    name: `PRUEBA DEV ${tag} producto inexistente`, kind: "equipment",
    category_id: category.id, regular_price: "75.00", currency: "GTQ",
    publication_status: "published", short_description: "PRUEBA DEV: producto ficticio, no comprar."
  }).select("id").single(), "producto");
  fixture.productId = product.id;
  need(await admin.client.rpc("record_inventory_change", {
    p_product_id: product.id, p_kind: "stock_entry", p_quantity_delta: 5,
    p_reason: `PRUEBA DEV ${tag} existencia ficticia`, p_reference: tag,
    p_idempotency_key: randomUUID()
  }), "stock inicial");
  check("producto ficticio y stock inicial 5/0", money((await balance()).stock_balance) === 5
    && money((await balance()).reserved) === 0);

  const [orderA, orderB, orderC] = [
    await order(a.client, option.id, pickup.id, "A"),
    await order(a.client, option.id, pickup.id, "B"),
    await order(a.client, option.id, pickup.id, "C")
  ];
  const afterConfirm = await balance();
  check("checkout 010 reservó tres unidades sin cobrarlas", money(afterConfirm.stock_balance) === 5
    && money(afterConfirm.reserved) === 3);

  const unauthorized = await Promise.all([
    a.client.rpc("create_dev_online_payment_attempt", { p_order_id: orderA, p_idempotency_key: randomUUID() }),
    b.client.rpc("record_dev_online_payment_event", {
      p_payment_id: randomUUID(), p_event_key: randomUUID(), p_outcome: "success",
      p_evidence_reference: `PRUEBA DEV: ${tag} intruso`
    }),
    anon.rpc("create_dev_online_payment_attempt", { p_order_id: orderA, p_idempotency_key: randomUUID() }),
    service.from("payments").insert({ order_id: orderA, method: "online_gateway", amount: 1,
      idempotency_key: `PRUEBA DEV ${tag} directo`, request_fingerprint: "0".repeat(64) })
  ]);
  check("cliente, anónimo y DML directo no pueden crear/registrar pagos", unauthorized.every(rejected),
    unauthorized.map((r) => code(r.error)).join(","));
  const foreign = await b.client.from("orders").select("id").in("id", [orderA, orderB, orderC]);
  check("RLS oculta pedidos del otro cliente", !foreign.error && foreign.data.length === 0);

  const keyA = randomUUID();
  const payA = await attempt(orderA, keyA);
  const replayA = await attempt(orderA, keyA);
  check("intento online idempotente y sin éxito inferido", payA.status === "test_created"
    && replayA.paymentId === payA.paymentId && replayA.alreadyCreated === true
    && payA.amount === "75.00" && payA.currency === "GTQ");
  const beforeEarlyExpire = await service.rpc("record_dev_online_payment_event", {
    p_payment_id: payA.paymentId, p_event_key: randomUUID(), p_outcome: "expired",
    p_evidence_reference: `PRUEBA DEV: ${tag} expiración temprana`
  });
  check("expiración temprana no cierra reserva activa", rejected(beforeEarlyExpire), code(beforeEarlyExpire.error));

  const eventKeyA = randomUUID();
  const evidenceA = `PRUEBA DEV: ${tag} éxito A`;
  const successA = await event(payA.paymentId, "success", eventKeyA, evidenceA);
  const replayEventA = await event(payA.paymentId, "success", eventKeyA, evidenceA);
  const alteredReplay = await service.rpc("record_dev_online_payment_event", {
    p_payment_id: payA.paymentId, p_event_key: eventKeyA,
    p_outcome: "rejected", p_evidence_reference: evidenceA
  });
  const secondSuccessA = await event(payA.paymentId, "success");
  const balA = await balance();
  const onlineMovesA = await movements("online_payment");
  check("éxito puntual consolida una sola unidad", successA.processingResult === "succeeded"
    && successA.paymentStatus === "test_succeeded"
    && Boolean(successA.consolidationOperationId)
    && money(balA.stock_balance) === 4 && money(balA.reserved) === 2
    && onlineMovesA.length === 1);
  check("evento repetido conserva respuesta; nueva clave no duplica stock",
    JSON.stringify(replayEventA) === JSON.stringify(successA)
    && rejected(alteredReplay) && secondSuccessA.processingResult === "duplicate_success"
    && (await movements("online_payment")).length === 1);

  const firstB = await attempt(orderB);
  const rejectB = await event(firstB.paymentId, "rejected");
  const unchangedB = await balance();
  check("rechazo deja pago fallido y reserva intacta", rejectB.processingResult === "rejected"
    && rejectB.paymentStatus === "test_failed"
    && money(unchangedB.stock_balance) === 4 && money(unchangedB.reserved) === 2);
  const secondB = await attempt(orderB);
  const successB = await event(secondB.paymentId, "success");
  const balB = await balance();
  check("nuevo intento tras rechazo consolida una vez", secondB.paymentId !== firstB.paymentId
    && secondB.status === "test_created" && successB.processingResult === "succeeded"
    && money(balB.stock_balance) === 3 && money(balB.reserved) === 1
    && (await movements("online_payment")).length === 2);
  const lateB = await event(firstB.paymentId, "success");
  const reviewB = need(await service.from("payments")
    .select("status,order_id,amount").eq("id", lateB.reviewPaymentId).single(), "alerta B");
  check("éxito tardío del intento fallido genera revisión visible sin doble venta",
    lateB.processingResult === "late_success_review"
    && lateB.paymentStatus === "test_failed"
    && lateB.reviewPaymentId !== firstB.paymentId
    && reviewB.status === "test_review_required" && reviewB.order_id === orderB
    && money(reviewB.amount) === 75
    && (await movements("online_payment")).length === 2);

  const firstC = await attempt(orderC);
  await event(firstC.paymentId, "rejected");
  const lateC = await event(firstC.paymentId, "success");
  const reviewC = need(await service.from("payments")
    .select("status,order_id").eq("id", lateC.reviewPaymentId).single(), "alerta C");
  const balC = await balance();
  check("éxito tardío sin segundo cobro exige revisión y no consume stock",
    lateC.processingResult === "late_success_review" && lateC.reviewPaymentId !== firstC.paymentId
    && reviewC.status === "test_review_required" && reviewC.order_id === orderC
    && money(balC.stock_balance) === 3 && money(balC.reserved) === 1);

  const [storedPayments, storedEvents, storedMoves, reservationA, reservationB, reservationC] = await Promise.all([
    service.from("payments").select("id,order_id,status,test_mode,provider,amount")
      .in("order_id", [orderA, orderB, orderC]),
    service.from("dev_payment_events")
      .select("event_key,payment_id,processing_result,consolidation_operation_id,review_payment_id")
      .in("payment_id", [payA.paymentId, firstB.paymentId, secondB.paymentId, firstC.paymentId]),
    service.from("inventory_movements").select("id,kind,quantity_delta,operation_id")
      .eq("product_id", product.id),
    service.from("stock_reservations").select("status,order_items!inner(order_id)")
      .eq("order_items.order_id", orderA),
    service.from("stock_reservations").select("status,order_items!inner(order_id)")
      .eq("order_items.order_id", orderB),
    service.from("stock_reservations").select("status,order_items!inner(order_id)")
      .eq("order_items.order_id", orderC)
  ]);
  const allRead = [storedPayments, storedEvents, storedMoves, reservationA, reservationB, reservationC]
    .every((r) => !r.error);
  const online = storedMoves.data?.filter((m) => m.kind === "online_payment") ?? [];
  const uniqueOps = new Set(online.map((m) => m.operation_id));
  check("ledger, pagos, reservas y movimientos persistidos en DEV", allRead
    && storedPayments.data.length === 6
    && storedPayments.data.every((p) => p.test_mode === true && p.provider === "DEV_SIMULATOR")
    && storedEvents.data.length === 7
    && storedMoves.data.length === 3 && online.length === 2 && uniqueOps.size === 2
    && reservationA.data.length === 1 && reservationA.data[0].status === "consumed"
    && reservationB.data.length === 1 && reservationB.data[0].status === "consumed"
    && reservationC.data.length === 1 && reservationC.data[0].status === "active",
    allRead ? "lecturas completas" : [storedPayments, storedEvents, storedMoves,
      reservationA, reservationB, reservationC].map((r) => code(r.error)).join(","));
  console.log(`IDs de auditoría: producto ${product.id}; pedidos ${fixture.orders.join(", ")}.`);
} catch (error) {
  check("ejecución QA 011", false, error instanceof Error ? error.message : "error-desconocido");
} finally {
  for (const id of accounts) {
    const profile = await service.from("profiles").update({ active: false })
      .eq("id", id).select("id,active").single();
    const banned = await service.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    check(`cuenta ficticia ${id} desactivada`, !profile.error && profile.data?.active === false
      && !banned.error, [code(profile.error), code(banned.error)].join("/"));
  }
  const passed = tests.filter((t) => t.pass).length;
  const failed = tests.length - passed;
  console.log(`Resultado QA 011: ${passed} PASS, ${failed} FAIL; fixtures de negocio auditables PRUEBA DEV.`);
  if (failed) process.exitCode = 1;
}

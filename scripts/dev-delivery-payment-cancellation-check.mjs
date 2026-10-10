import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Deliberate DEV write fixture. No checkout confirmation, provider call, email,
// dispatch, refund or real service is performed. Rows remain labelled in DEV;
// public delivery configuration is disabled again in finally.
if (!process.argv.includes("--write-fixtures")) {
  throw new Error("Se requiere --write-fixtures para esta prueba de escritura en DEV.");
}

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim() ?? "";
const url = process.env.DEV_SUPABASE_URL?.trim() ?? "";
const publishableKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
const secretKey = process.env.DEV_SUPABASE_SECRET_KEY?.trim() ?? "";
const linkPath = resolve("supabase/.temp/project-ref");
const linked = existsSync(linkPath) ? readFileSync(linkPath, "utf8").trim() : "";
let safeTarget = process.env.APP_ENV === "DEV"
  && /^[a-z0-9-]{3,64}$/.test(ref) && linked === ref
  && Boolean(publishableKey && secretKey);
try {
  const parsed = new URL(url);
  safeTarget = safeTarget && parsed.protocol === "https:"
    && parsed.hostname === `${ref}.supabase.co`
    && !parsed.username && !parsed.password;
} catch {
  safeTarget = false;
}
if (!safeTarget) throw new Error("Selector, enlace real, URL o claves DEV no coinciden.");

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, secretKey, options);
const anon = createClient(url, publishableKey, options);
const tag = `qa-dev-dpc-${randomBytes(5).toString("hex")}`;
const fingerprint = createHash("sha256").update(tag).digest("hex");
const results = [];
const config = { pickup: null, own: null, external: null, zone: null, rate: null, paymentOption: null };
const users = [];
const code = (error) => error?.code ?? (error?.status ? `HTTP ${error.status}` : "sin-codigo");

function check(label, pass, detail = "") {
  results.push({ label, pass });
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${detail ? ` (${detail})` : ""}`);
}

function need(result, label) {
  if (result.error || !result.data) throw new Error(`${label}: ${code(result.error)}`);
  return result.data;
}

function expectRejected(label, result) {
  // A transport failure is not evidence of a DB permission or constraint.
  const pass = Boolean(result.error?.code) && result.error.code !== "PGRST000";
  check(label, pass, result.error ? code(result.error) : "aceptado inesperadamente");
}

async function createUser(label, role = "customer") {
  const email = `${tag}-${label}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const created = need(await service.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { test_fixture: tag }
  }), `Auth ${label}`);
  const id = created.user?.id;
  if (!id) throw new Error(`Auth ${label}: sin-identidad`);
  users.push(id);
  need(await service.from("profiles").update({ display_name: `PRUEBA DEV ${tag} ${label}` })
    .eq("id", id).select("id").single(), `perfil ${label}`);
  if (role !== "customer") {
    need(await service.from("user_roles").update({ role }).eq("user_id", id)
      .select("user_id").single(), `rol ${label}`);
  }
  const client = createClient(url, publishableKey, options);
  const signed = need(await client.auth.signInWithPassword({ email, password }), `login ${label}`);
  if (signed.user?.id !== id) throw new Error(`login ${label}: identidad-incorrecta`);
  return { id, client };
}

async function disableFixtures() {
  const actions = [
    ["service_payment_options", config.paymentOption],
    ["service_zone_rates", config.rate],
    ["delivery_services", config.pickup],
    ["delivery_services", config.own],
    ["delivery_services", config.external],
    ["delivery_zones", config.zone]
  ];
  for (const [table, id] of actions) {
    if (!id) continue;
    const result = await service.from(table).update({ active: false }).eq("id", id).select("id").single();
    check(`fixture ${table} desactivada`, !result.error && result.data?.id === id,
      result.error ? code(result.error) : "");
  }
}

console.log("Supabase DEV: entrega, pagos exclusivamente de prueba y cancelación de borrador.");
console.log(`Fixture ficticia: ${tag}`);
try {
  const tables = ["delivery_services", "delivery_zones", "service_zone_rates",
    "service_payment_options", "shipping_proposals", "shipments", "payments",
    "carrier_settlements", "settlement_receipts", "service_cases"];
  for (const table of tables) {
    const probe = await service.from(table).select("id", { count: "exact", head: true });
    check(`tabla DEV ${table} consultable`, !probe.error, probe.error ? code(probe.error) : "");
    if (probe.error) throw new Error(`Tabla requerida ausente: ${table}`);
  }

  const [a, b, staff] = await Promise.all([
    createUser("a"), createUser("b"), createUser("staff", "admin")
  ]);
  check("Auth crea dos clientes y un admin ficticios sin correo", Boolean(a.id && b.id && staff.id));

  const orderA = need(await service.from("orders").insert({
    reference: `${tag}-order-a`, customer_id: a.id,
    stage: "draft", currency: "GTQ", idempotency_key: `${tag}-order-a`
  }).select("id,stage").single(), "pedido A");
  const orderB = need(await service.from("orders").insert({
    reference: `${tag}-order-b`, customer_id: b.id,
    stage: "draft", currency: "GTQ", idempotency_key: `${tag}-order-b`
  }).select("id,stage").single(), "pedido B");
  check("pedidos ficticios nacen como borrador", orderA.stage === "draft" && orderB.stage === "draft");

  const [aOwn, aForeign, bOwn, bForeign, staffBoth] = await Promise.all([
    a.client.from("orders").select("id").eq("id", orderA.id),
    a.client.from("orders").select("id").eq("id", orderB.id),
    b.client.from("orders").select("id").eq("id", orderB.id),
    b.client.from("orders").select("id").eq("id", orderA.id),
    staff.client.from("orders").select("id").in("id", [orderA.id, orderB.id])
  ]);
  check("RLS pedidos propios y ajenos A/B", !aOwn.error && aOwn.data.length === 1
    && !aForeign.error && aForeign.data.length === 0
    && !bOwn.error && bOwn.data.length === 1
    && !bForeign.error && bForeign.data.length === 0);
  check("admin activo lee ambos pedidos", !staffBoth.error && staffBoth.data.length === 2);
  expectRejected("cliente no inserta pedido ni importe directo", await a.client.from("orders").insert({
    reference: `${tag}-forged`, customer_id: a.id, stage: "draft",
    subtotal: 1, idempotency_key: `${tag}-forged`
  }));
  expectRejected("puerta checkout impide confirmar pedido", await service.from("orders")
    .update({ stage: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", orderB.id).select("id"));

  expectRejected("retiro activo exige ubicación y horario", await service.from("delivery_services")
    .insert({ name: `PRUEBA DEV ${tag} retiro inválido`, kind: "pickup", active: true }));
  const pickup = need(await service.from("delivery_services").insert({
    name: `PRUEBA DEV ${tag} retiro`, kind: "pickup", active: false,
    created_by: staff.id
  }).select("id").single(), "retiro ficticio");
  config.pickup = pickup.id;
  const own = need(await service.from("delivery_services").insert({
    name: `PRUEBA DEV ${tag} mensajería`, kind: "own_delivery",
    active: false, created_by: staff.id
  }).select("id").single(), "mensajería ficticia");
  config.own = own.id;
  const external = need(await service.from("delivery_services").insert({
    name: `PRUEBA DEV ${tag} externa`, kind: "external",
    carrier_name: "PRUEBA DEV transportista inexistente", active: false,
    created_by: staff.id
  }).select("id").single(), "externa ficticia");
  config.external = external.id;
  const zone = need(await service.from("delivery_zones").insert({
    code: `QA_${randomBytes(5).toString("hex").toUpperCase()}`,
    name: `PRUEBA DEV ${tag} zona`, department: "PRUEBA DEV",
    municipality: "PRUEBA DEV", active: false
  }).select("id").single(), "zona ficticia");
  config.zone = zone.id;

  expectRejected("retiro no admite tarifa zonal", await service.from("service_zone_rates").insert({
    service_id: pickup.id, zone_id: zone.id, pricing_mode: "manual",
    shipping_fee: null, shipping_charge_mode: "with_order"
  }));
  expectRejected("tarifa manual no finge cero", await service.from("service_zone_rates").insert({
    service_id: own.id, zone_id: zone.id, pricing_mode: "manual",
    shipping_fee: 0, shipping_charge_mode: "with_order"
  }));
  const rate = need(await service.from("service_zone_rates").insert({
    service_id: own.id, zone_id: zone.id, pricing_mode: "manual",
    shipping_fee: null, shipping_charge_mode: "with_order", active: false
  }).select("id,shipping_fee").single(), "tarifa manual ficticia");
  config.rate = rate.id;
  check("tarifa manual persiste como NULL", rate.shipping_fee === null);
  expectRejected("terminal externa no se infiere", await service.from("service_payment_options")
    .insert({ service_id: external.id, method: "terminal", timing: "on_delivery", active: false }));
  expectRejected("COD externo sin contrato no se activa", await service.from("delivery_services")
    .update({ cod_enabled: true }).eq("id", external.id).select("id"));
  const paymentOption = need(await service.from("service_payment_options").insert({
    service_id: own.id, method: "cash", timing: "on_delivery", active: false
  }).select("id").single(), "medio ficticio");
  config.paymentOption = paymentOption.id;

  const inactivePublic = await anon.from("delivery_services").select("id")
    .in("id", [pickup.id, own.id, external.id]);
  check("RLS oculta servicios ficticios inactivos", !inactivePublic.error
    && inactivePublic.data.length === 0);
  const pickupDetails = {
    address: "PRUEBA DEV: dirección inexistente",
    hours: "PRUEBA DEV: horario ficticio",
    instructions: "PRUEBA DEV: no acudir ni solicitar retiro"
  };
  need(await service.from("delivery_services").update({
    pickup_details: pickupDetails, active: true
  }).eq("id", pickup.id).select("id").single(), "activar retiro ficticio");
  expectRejected("solo un retiro activo", await service.from("delivery_services").insert({
    name: `PRUEBA DEV ${tag} segundo retiro`, kind: "pickup", active: true,
    pickup_details: pickupDetails
  }));
  need(await service.from("delivery_services").update({ active: true })
    .eq("id", own.id).select("id").single(), "activar mensajería ficticia");
  need(await service.from("delivery_zones").update({ active: true })
    .eq("id", zone.id).select("id").single(), "activar zona ficticia");
  need(await service.from("service_zone_rates").update({ active: true })
    .eq("id", rate.id).select("id").single(), "activar tarifa manual ficticia");
  need(await service.from("service_payment_options").update({ active: true })
    .eq("id", paymentOption.id).select("id").single(), "activar medio ficticio");
  const [publicRate, publicOption, privateCommission] = await Promise.all([
    anon.from("service_zone_rates").select("id,shipping_fee").eq("id", rate.id).single(),
    anon.from("service_payment_options").select("id,method,timing").eq("id", paymentOption.id).single(),
    anon.from("delivery_services").select("commission_percent").eq("id", external.id)
  ]);
  check("tarifa manual pública conserva costo desconocido", !publicRate.error
    && publicRate.data?.shipping_fee === null);
  check("medio público coincide con servicio activo", !publicOption.error
    && publicOption.data?.method === "cash" && publicOption.data?.timing === "on_delivery");
  expectRejected("anónimo no lee comisión contractual", privateCommission);

  expectRejected("envío exige pedido confirmado", await service.from("shipments").insert({
    order_id: orderB.id, service_id: pickup.id, status: "preparing"
  }));
  expectRejected("cliente no registra pago", await a.client.from("payments").insert({
    order_id: orderA.id, method: "cash", test_mode: true,
    amount: 10, idempotency_key: `${tag}-client-pay`, request_fingerprint: fingerprint
  }));
  expectRejected("base rechaza test_mode=false", await service.from("payments").insert({
    order_id: orderA.id, method: "cash", test_mode: false,
    amount: 10, idempotency_key: `${tag}-live-pay`, request_fingerprint: fingerprint
  }));
  const paymentKey = `${tag}-test-pay`;
  const payment = need(await service.from("payments").insert({
    order_id: orderA.id, method: "cash", test_mode: true,
    amount: 10, idempotency_key: paymentKey, request_fingerprint: fingerprint
  }).select("id,status,test_mode").single(), "pago de prueba");
  check("pago nace como test_created", payment.test_mode === true
    && payment.status === "test_created");
  expectRejected("clave de pago duplicada no crea segundo intento", await service.from("payments")
    .insert({ order_id: orderA.id, method: "cash", test_mode: true,
      amount: 10, idempotency_key: paymentKey, request_fingerprint: fingerprint }));
  expectRejected("éxito de prueba exige pedido confirmado", await service.from("payments")
    .update({ status: "test_succeeded", paid_at: new Date().toISOString(),
      test_evidence_reference: `${tag}-evidence` })
    .eq("id", payment.id).select("id"));
  need(await service.from("payments").update({ status: "test_failed" })
    .eq("id", payment.id).select("id").single(), "cerrar intento ficticio");
  expectRejected("pago terminal no se reabre", await service.from("payments")
    .update({ status: "test_created" }).eq("id", payment.id).select("id"));
  const [ownPayment, foreignPayment, staffPayment, paymentAfter] = await Promise.all([
    a.client.from("payments").select("id,test_mode,status").eq("id", payment.id),
    b.client.from("payments").select("id").eq("id", payment.id),
    staff.client.from("payments").select("id").eq("id", payment.id),
    service.from("payments").select("status").eq("id", payment.id).single()
  ]);
  check("RLS pago propio visible y ajeno oculto", !ownPayment.error
    && ownPayment.data.length === 1 && !foreignPayment.error
    && foreignPayment.data.length === 0);
  check("admin ve pago de prueba", !staffPayment.error && staffPayment.data.length === 1);
  check("intento rechazado conserva estado fallido", !paymentAfter.error
    && paymentAfter.data.status === "test_failed");

  const pending = need(await service.from("orders").update({ stage: "pending_shipping" })
    .eq("id", orderA.id).select("id,stage").single(), "pedido pendiente de envío");
  check("borrador puede esperar cotización de envío", pending.stage === "pending_shipping");
  const proposal = need(await service.from("shipping_proposals").insert({
    order_id: orderA.id, revision: 1, fee: 5, currency: "GTQ",
    charge_mode: "with_order", status: "offered", proposed_by: staff.id,
    terms_snapshot: `PRUEBA DEV ${tag}: tarifa ficticia, sin entrega real`
  }).select("id,status").single(), "propuesta ficticia");
  const [ownProposal, foreignProposal] = await Promise.all([
    a.client.from("shipping_proposals").select("id").eq("id", proposal.id),
    b.client.from("shipping_proposals").select("id").eq("id", proposal.id)
  ]);
  check("RLS propuesta propia visible y ajena oculta", !ownProposal.error
    && ownProposal.data.length === 1 && !foreignProposal.error
    && foreignProposal.data.length === 0);
  expectRejected("cliente B no acepta envío ajeno", await b.client.rpc("accept_shipping_proposal", {
    p_proposal_id: proposal.id
  }));
  const accept1 = await a.client.rpc("accept_shipping_proposal", { p_proposal_id: proposal.id });
  const accept2 = await a.client.rpc("accept_shipping_proposal", { p_proposal_id: proposal.id });
  check("aceptación de tarifa es idempotente", !accept1.error && !accept2.error
    && accept1.data === proposal.id && accept2.data === proposal.id);
  const afterAcceptance = need(await service.from("orders")
    .select("stage,confirmed_at").eq("id", orderA.id).single(), "estado tras propuesta");
  check("aceptar tarifa no confirma ni cobra", afterAcceptance.stage === "pending_shipping"
    && afterAcceptance.confirmed_at === null);

  expectRejected("cliente B no cancela pedido de A", await b.client.rpc(
    "cancel_unprepared_draft_order", {
      p_order_id: orderA.id, p_reason: "PRUEBA DEV ajena", p_idempotency_key: `${tag}-foreign-cancel`
    }
  ));
  expectRejected("solicitud pospreparación no aplica a borrador", await a.client.rpc(
    "request_order_cancellation", {
      p_order_id: orderA.id, p_reason: "PRUEBA DEV borrador", p_idempotency_key: `${tag}-wrong-path`
    }
  ));
  const cancelInput = {
    p_order_id: orderA.id, p_reason: "PRUEBA DEV cancelación de borrador",
    p_idempotency_key: `${tag}-cancel`
  };
  const cancel1 = await a.client.rpc("cancel_unprepared_draft_order", cancelInput);
  const cancel2 = await a.client.rpc("cancel_unprepared_draft_order", cancelInput);
  check("cancelación de borrador y reintento comparten caso", !cancel1.error
    && !cancel2.error && cancel1.data === cancel2.data);
  expectRejected("clave de cancelación con motivo distinto se rechaza", await a.client.rpc(
    "cancel_unprepared_draft_order", { ...cancelInput, p_reason: "PRUEBA DEV distinto" }
  ));
  expectRejected("pedido cancelado no crea segundo caso", await a.client.rpc(
    "cancel_unprepared_draft_order", { ...cancelInput, p_idempotency_key: `${tag}-cancel-2` }
  ));
  const [cancelled, cases, bCases] = await Promise.all([
    service.from("orders").select("stage").eq("id", orderA.id).single(),
    service.from("service_cases").select("id,status,intake_path").eq("order_id", orderA.id),
    b.client.from("service_cases").select("id").eq("order_id", orderA.id)
  ]);
  // Refunds refer to a case, not directly to an order.
  const noRefunds = cases.data?.length === 1
    ? await service.from("refunds").select("id").eq("case_id", cases.data[0].id)
    : { data: null, error: { code: "fixture-case-count" } };
  check("cancelación persiste una vez y sin reembolso ficticio", !cancelled.error
    && cancelled.data.stage === "cancelled" && !cases.error
    && cases.data.length === 1 && cases.data[0].status === "closed"
    && cases.data[0].intake_path === "direct_draft" && !noRefunds.error
    && noRefunds.data.length === 0);
  check("RLS oculta caso de cancelación a cliente B", !bCases.error
    && bCases.data.length === 0);
  console.log("NO EJECUTADO: despacho, entrega, liquidación y reembolso de pedido confirmado; checkout gate vigente.");
} catch (error) {
  check("ejecución completa", false, error instanceof Error
    ? error.message.replace(/https?:\/\/\S+/g, "<URL oculta>") : "error-desconocido");
} finally {
  await disableFixtures();
  console.log(`Fixture persistente: ${tag}; ${users.length} identidades ficticias y pedidos de prueba.`);
  const failed = results.filter((result) => !result.pass).length;
  console.log(`Resultado: ${results.length - failed} PASS, ${failed} FAIL.`);
  if (failed) process.exitCode = 1;
}

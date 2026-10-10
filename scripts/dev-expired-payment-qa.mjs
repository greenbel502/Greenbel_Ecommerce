import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Run only after the real reservation deadline. Preflight is read-only; the
// single write is the explicit DEV simulator event, replayed with the same key.
if (process.argv.length !== 4 || process.argv[2] !== "--run") {
  throw new Error("Uso: node --env-file=.env scripts/dev-expired-payment-qa.mjs --run /private/tmp/greenbel-dev-payment-expiry-<tag>.json");
}
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
const secretKey = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
if (process.env.APP_ENV !== "DEV" || !ref || !url || linked !== ref || !secretKey
  || new URL(url).protocol !== "https:"
  || new URL(url).hostname !== `${ref}.supabase.co`
  || (process.env.DEV_EMAIL_DELIVERY_MODE && process.env.DEV_EMAIL_DELIVERY_MODE !== "disabled")) {
  throw new Error("Enlace, URL, clave o pausa de correo DEV no coinciden.");
}
const fixturePath = process.argv[3];
if (!fixturePath.startsWith("/private/tmp/greenbel-dev-payment-expiry-")) {
  throw new Error("Se requiere el archivo de fixture PRUEBA DEV en /private/tmp.");
}
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (!String(fixture.label).startsWith("PRUEBA DEV qa-devcancel-")
  || ![fixture.orderId, fixture.paymentId, fixture.productId, fixture.reservationId].every((id) => uuid.test(id))
  || !Number.isFinite(Date.parse(fixture.expiresAt))
  || Number(fixture.expectedStockBalance) !== 5
  || Number(fixture.expectedReservedBeforeExpiry) !== 3) {
  throw new Error("Fixture de expiración DEV incompleta o no reconocida.");
}
if (Date.now() < Date.parse(fixture.expiresAt) + 2_000) {
  console.log(`NO EJECUTADO: esperar hasta después de ${fixture.expiresAt} UTC; no hubo escritura.`);
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, secretKey, options);
const raw = createHash("sha256").update(`greenbel-dev-expired:${fixture.paymentId}`).digest("hex").slice(0, 32);
const eventKey = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
const evidence = `PRUEBA DEV: vencimiento real ${fixture.paymentId}`;
const results = [];
const code = (error) => error?.code ?? (error?.status ? `HTTP ${error.status}` : "sin-codigo");
function need(result, label) {
  if (result.error || !result.data) throw new Error(`${label}: ${code(result.error)}`);
  return result.data;
}
function check(label, pass) {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
}
async function snapshot() {
  const [order, payment, reserve, balance, moves, releaseOps, ledger] = await Promise.all([
    service.from("orders").select("id,stage,amount_due_greenbel,payment_method_snapshot")
      .eq("id", fixture.orderId).single(),
    service.from("payments").select("id,order_id,status,provider,test_mode,amount,paid_at")
      .eq("id", fixture.paymentId).single(),
    service.from("stock_reservations").select("id,status,expires_at,close_operation_id")
      .eq("id", fixture.reservationId).single(),
    service.from("inventory_balances").select("stock_balance,reserved")
      .eq("product_id", fixture.productId).single(),
    service.from("inventory_movements").select("id,kind,operation_id")
      .eq("product_id", fixture.productId),
    service.from("inventory_operations").select("id")
      .eq("order_id", fixture.orderId).eq("kind", "release"),
    service.from("dev_payment_events")
      .select("event_key,payment_id,requested_outcome,evidence_reference,processing_result")
      .eq("event_key", eventKey)
  ]);
  return {
    order: need(order, "pedido"), payment: need(payment, "pago"),
    reserve: need(reserve, "reserva"), balance: need(balance, "balance"),
    moves: need(moves, "movimientos"), releaseOps: need(releaseOps, "liberaciones"),
    ledger: need(ledger, "ledger")
  };
}

console.log("Supabase DEV: vencimiento real de reserva online ficticia; sin cobro ni correo.");
console.log(`Fixture ${fixture.label}; pedido ${fixture.orderId}; evento ${eventKey}.`);
try {
  const before = await snapshot();
  const previousEvent = before.ledger[0];
  const validFirst = before.payment.status === "test_created" && before.ledger.length === 0;
  const validReplay = before.payment.status === "test_review_required"
    && before.ledger.length === 1
    && previousEvent.payment_id === fixture.paymentId
    && previousEvent.requested_outcome === "expired"
    && previousEvent.evidence_reference === evidence
    && previousEvent.processing_result === "expired_review";
  check("preflight: pedido y pago simulados coinciden", before.order.stage === "confirmed"
    && before.order.payment_method_snapshot?.method === "online_gateway"
    && before.payment.order_id === fixture.orderId
    && before.payment.provider === "DEV_SIMULATOR" && before.payment.test_mode === true
    && Number(before.payment.amount) === Number(before.order.amount_due_greenbel)
    && before.payment.paid_at === null && (validFirst || validReplay));
  check("preflight: plazo vencido, reserva activa, sin liberación",
    Date.now() >= Date.parse(before.reserve.expires_at)
    && before.reserve.id === fixture.reservationId
    && before.reserve.status === "active" && before.reserve.close_operation_id === null
    && before.releaseOps.length === 0);
  check("preflight: saldo esperado y sin consumo online", Number(before.balance.stock_balance) === 5
    && Number(before.balance.reserved) === 3
    && before.moves.length === 1 && before.moves[0].kind === "stock_entry");
  if (results.some((pass) => !pass)) throw new Error("Preflight no coincide; evento omitido");

  const args = {
    p_payment_id: fixture.paymentId, p_event_key: eventKey,
    p_outcome: "expired", p_evidence_reference: evidence
  };
  const first = need(await service.rpc("record_dev_online_payment_event", args), "evento expired");
  const replay = need(await service.rpc("record_dev_online_payment_event", args), "replay expired");
  const after = await snapshot();
  check("evento vencido exige revisión del pago", first.processingResult === "expired_review"
    && first.paymentStatus === "test_review_required"
    && first.consolidationOperationId === null
    && first.reviewPaymentId === null
    && after.payment.status === "test_review_required" && after.payment.paid_at === null);
  check("replay exacto conserva respuesta y un único evento", JSON.stringify(first) === JSON.stringify(replay)
    && after.ledger.length === 1 && after.ledger[0].processing_result === "expired_review");
  check("reserva, saldo y movimientos siguen intactos; sin release",
    after.reserve.status === "active" && after.reserve.close_operation_id === null
    && Number(after.balance.stock_balance) === Number(before.balance.stock_balance)
    && Number(after.balance.reserved) === Number(before.balance.reserved)
    && after.moves.length === before.moves.length
    && after.moves.every((m) => before.moves.some((old) => old.id === m.id))
    && after.releaseOps.length === 0);
} catch (error) {
  check(`ejecución: ${error instanceof Error ? error.message : "error-desconocido"}`, false);
}
const failed = results.filter((pass) => !pass).length;
console.log(`Resultado expiración 011: ${results.length - failed} PASS, ${failed} FAIL.`);
if (failed) process.exitCode = 1;

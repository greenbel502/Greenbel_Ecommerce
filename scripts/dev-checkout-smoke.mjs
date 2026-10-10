/** Isolated direct Supabase DEV checkout smoke. Leaves its named fixture for audit. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const publicKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secretKey = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && publicKey && secretKey && linked === ref);
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
const http = process.argv.includes("--http");
if (process.argv[2] !== "--run" || process.argv.length !== (http ? 4 : 3)
  || (http && process.argv[3] !== "--http")) {
  console.error("NO EJECUTADO: indicar --run [--http] para crear fixture DEV aislada.");
  process.exit(2);
}

const tag = `PRUEBA DEV checkout ${randomUUID().slice(0, 8)}`;
const slug = tag.toLowerCase().replaceAll(" ", "-");
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, secretKey, opts);
const result = [];
const createdUsers = [];
const check = (name, okay, code = "") => {
  result.push(Boolean(okay));
  console.log(`${okay ? "PASS" : "FAIL"}: ${name}${code ? ` (${code})` : ""}`);
};
function need(response, label) {
  if (response.error || !response.data) throw new Error(`${label}: ${response.error?.code ?? "sin_datos"}`);
  return response.data;
}
async function user(label, role = "customer") {
  const email = `${slug}-${label}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const created = need(await service.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { test_fixture: tag } }), `Auth ${label}`).user;
  createdUsers.push({ id: created.id, role });
  if (role !== "customer") need(await service.from("user_roles").update({ role }).eq("user_id", created.id).select("role").single(), `rol ${label}`);
  const client = createClient(url, publicKey, opts);
  need(await client.auth.signInWithPassword({ email, password }), `sesión ${label}`);
  return { id: created.id, client };
}

async function cookieFor(signedInClient) {
  const session = (await signedInClient.auth.getSession()).data.session;
  if (!session) throw new Error("Sesión HTTP no disponible");
  const jar = new Map();
  const browserSession = createServerClient(url, publicKey, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: false, path: "/" },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (set) => set.forEach(({ name, value }) => jar.set(name, value))
    }
  });
  need(await browserSession.auth.setSession({
    access_token: session.access_token, refresh_token: session.refresh_token
  }), "cookie Auth HTTP");
  if (jar.size === 0) throw new Error("No se creó cookie Auth HTTP");
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function httpCheck(a, b, product) {
  const base = new URL(process.env.DEV_APP_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname)
    && base.protocol === "http:" && base.port === "3000",
    "HTTP QA exige aplicación local DEV");
  const [aCookie, bCookie] = await Promise.all([cookieFor(a.client), cookieFor(b.client)]);
  const get = (path, cookie) => fetch(new URL(path, base), {
    headers: { Cookie: cookie }, redirect: "manual", cache: "no-store",
    signal: AbortSignal.timeout(30_000)
  });
  const post = (path, cookie, body) => fetch(new URL(path, base), {
    method: "POST", headers: { Cookie: cookie, Origin: base.origin,
      "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "manual", cache: "no-store",
    signal: AbortSignal.timeout(30_000)
  });
  const options = await get("/api/checkout/options", aCookie);
  const choices = await options.json();
  check("HTTP A ve opciones DEV propias", options.status === 200
    && choices.environment === "DEV" && choices.services?.length >= 3);
  const intent = { lines: [{ productId: product.id, quantity: 1 }],
    billing: { kind: "cf", firstName: "HTTP", lastName: "PRUEBA DEV", phone: "5555 5555" },
    delivery: { kind: "pickup", serviceId: "a1000000-0000-4000-8000-000000000001" },
    paymentOptionId: "a4000000-0000-4000-8000-000000000001" };
  const reviewRequest = { intent, reviewKey: randomUUID(), reviewId: null };
  const reviewed = await post("/api/checkout/review", aCookie, reviewRequest);
  const reviewBody = await reviewed.json();
  check("HTTP A revisa total autoritativo", reviewed.status === 200
    && reviewBody.review?.total === "60.00");
  if (reviewed.status !== 200) throw new Error(`HTTP review: ${reviewed.status}`);
  const replayReview = await post("/api/checkout/review", aCookie, reviewRequest);
  const replayBody = await replayReview.json();
  check("HTTP revisión repetida devuelve mismo ID", replayReview.status === 200
    && replayBody.review?.reviewId === reviewBody.review.reviewId);
  const own = await get(`/api/checkout/review?id=${reviewBody.review.reviewId}`, aCookie);
  const foreign = await get(`/api/checkout/review?id=${reviewBody.review.reviewId}`, bCookie);
  check("HTTP recuperación propia y ajena protegida", own.status === 200 && foreign.status === 404);
  const confirmation = { reviewId: reviewBody.review.reviewId, review: intent,
    acceptedRevision: reviewBody.review.revision, acceptedTotal: reviewBody.review.total,
    idempotencyKey: randomUUID() };
  const badTotal = await post("/api/checkout/confirm", aCookie, { ...confirmation, acceptedTotal: "61.00" });
  check("HTTP total alterado rechazado", badTotal.status === 409);
  const wrongOwner = await post("/api/checkout/confirm", bCookie, confirmation);
  check("HTTP B no confirma A", wrongOwner.status === 403);
  const confirmed = await post("/api/checkout/confirm", aCookie, confirmation);
  const orderBody = await confirmed.json();
  check("HTTP A confirma y obtiene reserva", confirmed.status === 200
    && orderBody.order?.stage === "confirmed" && Boolean(orderBody.order?.reservationId));
  if (confirmed.status !== 200) throw new Error(`HTTP confirm: ${confirmed.status}`);
  const replay = await post("/api/checkout/confirm", aCookie, confirmation);
  const repeated = await replay.json();
  check("HTTP confirm repetida no crea pedido", replay.status === 200
    && repeated.order?.orderId === orderBody.order.orderId
    && repeated.order?.reservationId === orderBody.order.reservationId
    && repeated.order?.alreadyConfirmed === true);
}

try {
  const admin = await user("admin", "admin");
  const a = await user("a");
  const b = await user("b");
  check("Auth A/B/admin ficticios sin correo", true);
  const category = need(await service.from("categories").insert({
    name: tag, slug, active: true
  }).select("id").single(), "categoría");
  const product = need(await service.from("products").insert({
    kind: "equipment", category_id: category.id,
    sku: `QA-CHECKOUT-${slug.slice(-8).toUpperCase()}`,
    slug: `${slug}-producto`, name: `${tag} producto`, short_description: "Producto ficticio exclusivo para QA DEV.",
    publication_status: "published", regular_price: "60.00", currency: "GTQ"
  }).select("id").single(), "producto");
  check("SKU PRUEBA DEV aislado y publicado", Boolean(product.id));
  need(await admin.client.rpc("record_inventory_change", {
    p_product_id: product.id, p_kind: "stock_entry", p_quantity_delta: 3,
    p_reason: tag, p_reference: tag, p_idempotency_key: randomUUID()
  }), "inventario");
  const intent = {
    lines: [{ productId: product.id, quantity: 1 }],
    billing: { kind: "cf", firstName: "Cliente", lastName: "PRUEBA DEV", phone: "5555 5555" },
    delivery: { kind: "pickup", serviceId: "a1000000-0000-4000-8000-000000000001" },
    paymentOptionId: "a4000000-0000-4000-8000-000000000001"
  };
  const reviewKey = randomUUID();
  const reviewed = await a.client.rpc("review_checkout", {
    p_intent: intent, p_review_key: reviewKey, p_review_id: null
  });
  check("A revisa precio/stock en DEV", !reviewed.error && reviewed.data?.stage === "draft"
    && reviewed.data?.total === "60.00", reviewed.error?.code);
  if (reviewed.error || !reviewed.data?.reviewId) throw new Error(`review_checkout: ${reviewed.error?.code ?? "sin_id"}`);
  const replayReview = await a.client.rpc("review_checkout", {
    p_intent: intent, p_review_key: reviewKey, p_review_id: null
  });
  check("Reintento de revisión devuelve mismo pedido", !replayReview.error
    && replayReview.data?.reviewId === reviewed.data.reviewId, replayReview.error?.code);
  const foreign = await b.client.rpc("confirm_checkout", {
    p_review_id: reviewed.data.reviewId, p_intent: intent,
    p_accepted_revision: reviewed.data.revision, p_accepted_total: reviewed.data.total,
    p_idempotency_key: randomUUID()
  });
  check("B no confirma revisión ajena", foreign.error?.code === "42501", foreign.error?.code);
  const confirmationKey = randomUUID();
  const confirmArgs = { p_review_id: reviewed.data.reviewId, p_intent: intent,
    p_accepted_revision: reviewed.data.revision, p_accepted_total: reviewed.data.total,
    p_idempotency_key: confirmationKey };
  const confirmed = await a.client.rpc("confirm_checkout", confirmArgs);
  check("A confirma y reserva una unidad", !confirmed.error && confirmed.data?.stage === "confirmed"
    && confirmed.data?.orderId === reviewed.data.reviewId && Boolean(confirmed.data.reservationId), confirmed.error?.code);
  if (confirmed.error) throw new Error(`confirm_checkout: ${confirmed.error.code}`);
  const replay = await a.client.rpc("confirm_checkout", confirmArgs);
  check("Reintento no duplica pedido ni reserva", !replay.error
    && replay.data?.orderId === confirmed.data.orderId
    && replay.data?.reservationId === confirmed.data.reservationId
    && replay.data?.alreadyConfirmed === true, replay.error?.code);
  const balance = need(await service.from("inventory_balances").select("stock_balance,reserved")
    .eq("product_id", product.id).single(), "balance");
  check("Balance único 3 físico, 1 reservado", Number(balance.stock_balance) === 3 && Number(balance.reserved) === 1);
  const own = await a.client.from("orders").select("id").eq("id", reviewed.data.reviewId);
  const other = await b.client.from("orders").select("id").eq("id", reviewed.data.reviewId);
  check("RLS: A lee propio y B no lee ajeno", !own.error && own.data?.length === 1
    && !other.error && other.data?.length === 0);
  if (http) await httpCheck(a, b, product);
} catch (error) {
  check("Smoke sin excepción", false, error instanceof Error ? error.message.replace(/[^A-Za-z0-9:_ -]/g, "") : "error");
} finally {
  for (const user of createdUsers) {
    let roleOkay = true;
    if (user.role === "admin") {
      const role = await service.from("user_roles").update({ role: "customer" })
        .eq("user_id", user.id).select("role").single();
      roleOkay = !role.error && role.data?.role === "customer";
    }
    const profile = await service.from("profiles").update({ active: false })
      .eq("id", user.id).select("active").single();
    check("Cierre de cuenta temporal y rol admin", roleOkay && !profile.error && profile.data?.active === false,
      roleOkay ? profile.error?.code : "role_cleanup");
  }
  const passed = result.filter(Boolean).length;
  console.log(`RESULTADO ${passed}/${result.length} PASS; fixture ${tag}; sin correo/cobro/despacho real.`);
  if (passed !== result.length) process.exitCode = 1;
}

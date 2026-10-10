/** Targeted retest of 014 using the already-delivered fictional 012 fixture. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.argv[2] !== "--run" || process.argv.length !== 3) {
  console.error("NO EJECUTADO: usar --run solo después de aplicar 014 en DEV.");
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
const marker = "PRUEBA DEV staff 6300cb43";
const sku = "QA-STAFF-6300CB43-pickup";
function need(result, label) {
  if (result.error || !result.data) throw new Error(`${label}: ${result.error?.code ?? "sin_datos"}`);
  return result.data;
}

try {
  const product = need(await db.from("products").select("id").eq("sku", sku).single(), "producto ficticio");
  const item = need(await db.from("order_items").select("id,order_id")
    .eq("product_id", product.id).single(), "línea entregada");
  const order = need(await db.from("orders").select("customer_id")
    .eq("id", item.order_id).single(), "cliente de compra");
  const shipment = need(await db.from("shipments").select("delivered_at")
    .eq("order_id", item.order_id).single(), "entrega");
  assert.ok(shipment.delivered_at, "Entrega ficticia debe estar registrada");

  let strangerId = null;
  for (let page = 1; page <= 100 && !strangerId; page += 1) {
    const users = need(await db.auth.admin.listUsers({ page, perPage: 1000 }), "Auth QA").users;
    strangerId = users.find((user) => user.user_metadata?.qa_marker === marker
      && user.email?.endsWith("-stranger@example.invalid"))?.id ?? null;
    if (users.length < 1000) break;
  }
  assert.ok(strangerId && strangerId !== order.customer_id, "Segundo cliente ficticio requerido");
  const denied = await db.from("reviews").insert({
    customer_id: strangerId, product_id: product.id, order_item_id: item.id,
    rating: 5, comment: `${marker} reseña ajena`, moderation_status: "pending"
  });
  console.log(`${denied.error ? "PASS" : "FAIL"}: trigger niega compra ajena (${denied.error?.code ?? "aceptada"}).`);

  const comment = `${marker} reseña ficticia válida tras 014`;
  let review = need(await db.from("reviews").select("id,moderation_status")
    .eq("order_item_id", item.id).eq("comment", comment), "búsqueda de reseña")[0];
  if (!review) {
    review = need(await db.from("reviews").insert({
      customer_id: order.customer_id, product_id: product.id, order_item_id: item.id,
      rating: 2, comment, moderation_status: "pending"
    }).select("id,moderation_status").single(), "reseña entregada");
  }
  const publicResult = await anon.from("reviews").select("id").eq("id", review.id);
  const unauthorizedModeration = await db.from("reviews").update({
    moderation_status: "visible", moderated_by: strangerId,
    moderated_at: new Date().toISOString()
  }).eq("id", review.id);
  const directDml = await db.from("order_items").update({ quantity: 1 })
    .eq("id", randomUUID());
  const okay = Boolean(denied.error) && review.moderation_status === "pending"
    && !publicResult.error && publicResult.data?.length === 0
    && Boolean(unauthorizedModeration.error)
    && directDml.error?.code === "42501";
  console.log(`${okay ? "PASS" : "FAIL"}: reseña entregada pendiente y oculta; moderación ajena y DML directo de order_items denegados.`);
  if (!okay) process.exitCode = 1;
} catch (error) {
  console.error(`FAIL: retest 014: ${error instanceof Error ? error.message.replace(/[^A-Za-z0-9:_ -]/g, "") : "desconocido"}`);
  process.exitCode = 1;
}

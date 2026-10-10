/** Directed DEV QA after 015; restores fictional profile activity in finally. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.argv[2] !== "--run" || process.argv.length !== 3) {
  console.error("NO EJECUTADO: usar --run solo contra DEV después de 015.");
  process.exit(2);
}
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const secret = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && secret && linked === ref);
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled");
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const marker = "PRUEBA DEV staff 6300cb43";
const sku = "QA-STAFF-6300CB43-own";
let ownerId = null;
let strangerId = null;
function need(response, label) {
  if (response.error || !response.data) throw new Error(`${label}: ${response.error?.code ?? "sin_datos"}`);
  return response.data;
}
async function setActive(id, active) {
  const row = need(await db.from("profiles").update({ active }).eq("id", id)
    .select("active").single(), `perfil ${active ? "activo" : "inactivo"}`);
  assert.equal(row.active, active);
}
function payload(customerId, productId, itemId, label) {
  return { customer_id: customerId, product_id: productId,
    order_item_id: itemId, rating: 3,
    comment: `${marker} ${label}`, moderation_status: "pending" };
}

try {
  const product = need(await db.from("products").select("id")
    .eq("sku", sku).single(), "producto own ficticio");
  const items = need(await db.from("order_items").select("id,order_id")
    .eq("product_id", product.id), "líneas propias ficticias");
  let delivered = null;
  for (const item of items) {
    const shipment = await db.from("shipments").select("delivered_at")
      .eq("order_id", item.order_id).maybeSingle();
    if (shipment.error) throw new Error(`entrega propia: ${shipment.error.code}`);
    if (shipment.data?.delivered_at) { delivered = item; break; }
  }
  assert.ok(delivered, "Compra de mensajería propia entregada requerida");
  ownerId = need(await db.from("orders").select("customer_id")
    .eq("id", delivered.order_id).single(), "dueño de compra").customer_id;
  for (let page = 1; page <= 100 && !strangerId; page += 1) {
    const users = need(await db.auth.admin.listUsers({ page, perPage: 1000 }), "Auth QA").users;
    strangerId = users.find((user) => user.user_metadata?.qa_marker === marker
      && user.email?.endsWith("-stranger@example.invalid"))?.id ?? null;
    if (users.length < 1000) break;
  }
  assert.ok(strangerId && strangerId !== ownerId);
  const profiles = need(await db.from("profiles").select("id,active")
    .in("id", [ownerId, strangerId]), "perfiles ficticios");
  assert.equal(profiles.length, 2);
  assert.ok(profiles.every((row) => row.active === false), "Fixture QA debe iniciar desactivada");

  const inactive = await db.from("reviews").insert(payload(ownerId, product.id, delivered.id,
    "reseña inactiva denegada"));
  console.log(`${inactive.error?.code === "42501" ? "PASS" : "FAIL"}: perfil inactivo rechazado (${inactive.error?.code ?? "aceptado"}).`);

  await setActive(ownerId, true);
  const own = await db.from("reviews").insert(payload(ownerId, product.id, delivered.id,
    "reseña activa válida")).select("id,moderation_status").single();
  console.log(`${!own.error && own.data?.moderation_status === "pending" ? "PASS" : "FAIL"}: perfil activo con compra entregada registra reseña pendiente (${own.error?.code ?? "ok"}).`);

  await setActive(strangerId, true);
  const foreign = await db.from("reviews").insert(payload(strangerId, product.id, delivered.id,
    "reseña ajena denegada"));
  console.log(`${Boolean(foreign.error) ? "PASS" : "FAIL"}: otro perfil activo no puede usar compra ajena (${foreign.error?.code ?? "aceptado"}).`);

  if (inactive.error?.code !== "42501" || own.error || own.data?.moderation_status !== "pending"
    || !foreign.error) process.exitCode = 1;
} catch (error) {
  console.error(`FAIL: retest 015: ${error instanceof Error ? error.message.replace(/[^A-Za-z0-9:_ -]/g, "") : "desconocido"}`);
  process.exitCode = 1;
} finally {
  for (const id of [ownerId, strangerId].filter(Boolean)) {
    try { await setActive(id, false); }
    catch { console.error("FAIL: restauración de perfil QA inactivo"); process.exitCode = 1; }
  }
  console.log("Perfiles QA restaurados a inactivos; reseñas ficticias válidas quedan pendientes, sin correo ni moderación pública.");
}

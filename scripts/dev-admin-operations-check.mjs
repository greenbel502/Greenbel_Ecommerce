/**
 * Targeted DEV integration check for staff routes, product media, training,
 * review eligibility and manual after-sales guards. Fictional fixtures remain
 * in DEV (unpublished/inactive) for auditability. No email or payment is sent.
 * Run only against a local Next server using Supabase DEV:
 *   node --env-file=.env scripts/dev-admin-operations-check.mjs --run
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

if (!["--run", "--staff-pages", "--retire-fixture"].includes(process.argv[2])) {
  console.error("NO EJECUTADO: usa --run, --staff-pages o --retire-fixture solo en DEV.");
  process.exit(2);
}

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const appUrl = process.env.DEV_APP_URL?.trim();
const publicKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secretKey = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && linked === ref, "DEV target preflight");
assert.ok(new URL(url).hostname === `${ref}.supabase.co`, "DEV URL/ref preflight");
assert.ok(appUrl && ["localhost", "127.0.0.1"].includes(new URL(appUrl).hostname), "Local app URL preflight");
assert.ok(publicKey && secretKey, "DEV keys preflight");
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled", "Email pause preflight");

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
const marker = `DEV-QA-ADMINOPS-${randomUUID().slice(0, 8)}`;
const slug = marker.toLowerCase();
const checks = [];
function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  checks.push(ok);
}
function cookieHeader(jar) {
  return [...jar.entries()].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("; ");
}
async function createSession(role) {
  const email = `${slug}-${role}@example.invalid`;
  const password = randomBytes(30).toString("base64url");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { qa_marker: marker }
  });
  if (createError || !created.user?.id) throw new Error(`DEV Auth fixture ${role}: ${createError?.code || "missing_user"}`);
  const userId = created.user.id;
  if (role !== "customer") {
    const { error } = await admin.from("user_roles").update({ role }).eq("user_id", userId);
    if (error) throw new Error(`DEV role fixture ${role}: ${error.code || "update_failed"}`);
  }
  const jar = new Map();
  const client = createServerClient(url, publicKey, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: false, path: "/" },
    cookies: {
      getAll() { return [...jar.entries()].map(([name, value]) => ({ name, value })); },
      setAll(values) { for (const { name, value } of values) jar.set(name, value); }
    }
  });
  const { error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError || jar.size === 0) throw new Error(`DEV login ${role}: ${loginError?.code || "missing_cookie"}`);
  return { userId, client, jar };
}
async function get(path, jar) {
  const response = await fetch(new URL(path, appUrl), {
    headers: jar ? { Cookie: cookieHeader(jar) } : {},
    redirect: "manual", signal: AbortSignal.timeout(30_000)
  });
  return { status: response.status, type: response.headers.get("content-type"), text: await response.text() };
}
function imageForm(productId) {
  const form = new FormData();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKxkAAAAASUVORK5CYII=", "base64");
  form.set("productId", productId);
  form.set("altText", `${marker} imagen ficticia`);
  form.set("image", new File([bytes], `${slug}.png`, { type: "image/png" }));
  return form;
}
async function uploadImage(productId, jar) {
  const response = await fetch(new URL("/api/admin/product-images", appUrl), {
    method: "POST",
    headers: { Origin: new URL(appUrl).origin, Cookie: cookieHeader(jar) },
    body: imageForm(productId), signal: AbortSignal.timeout(30_000)
  });
  return { status: response.status, body: await response.json() };
}
async function expectRow(table, query) {
  const { data, error } = await query.single();
  if (error || !data) throw new Error(`${table} fixture: ${error?.code || "missing"}`);
  return data;
}

async function run() {
  const [administrator, operator, customer] = await Promise.all([
    createSession("admin"), createSession("operator"), createSession("customer")
  ]);
  console.log(`DEV fixture: ${marker}`);

  const [adminShipments, operatorShipments, customerShipments, anonShipments,
    adminTraining, operatorTraining, adminReviews, operatorReviews] = await Promise.all([
      get("/admin/envios", administrator.jar), get("/admin/envios", operator.jar),
      get("/admin/envios", customer.jar), get("/admin/envios"),
      get("/admin/capacitaciones", administrator.jar), get("/admin/capacitaciones", operator.jar),
      get("/admin/resenas", administrator.jar), get("/admin/resenas", operator.jar)
    ]);
  check("operador y admin ven envíos externos", adminShipments.status === 200
    && operatorShipments.status === 200 && adminShipments.text.includes("<h1>Envíos externos</h1>")
    && operatorShipments.text.includes("<h1>Envíos externos</h1>"));
  check("cliente y anónimo no ven envíos externos", !customerShipments.text.includes("<h1>Envíos externos</h1>")
    && !anonShipments.text.includes("<h1>Envíos externos</h1>"));
  check("capacitaciones y reseñas solo admin", adminTraining.status === 200
    && adminTraining.text.includes("<h1>Capacitaciones</h1>")
    && !operatorTraining.text.includes("<h1>Capacitaciones</h1>")
    && adminReviews.status === 200 && adminReviews.text.includes("<h1>Moderar reseñas</h1>")
    && !operatorReviews.text.includes("<h1>Moderar reseñas</h1>"));

  const brand = await expectRow("brands", admin.from("brands").insert({
    name: `${marker} marca ficticia`, slug, active: true
  }).select("id"));
  const category = await expectRow("categories", admin.from("categories").insert({
    name: `${marker} categoría ficticia`, slug, active: true
  }).select("id"));
  const product = await expectRow("products", admin.from("products").insert({
    sku: marker, slug, name: `${marker} producto ficticio`, kind: "equipment",
    brand_id: brand.id, category_id: category.id, regular_price: "123.45", currency: "GTQ",
    publication_status: "published"
  }).select("id"));

  const deniedImage = await uploadImage(product.id, operator.jar);
  check("operador no puede subir imagen de catálogo", deniedImage.status === 403);
  const first = await uploadImage(product.id, administrator.jar);
  const second = await uploadImage(product.id, administrator.jar);
  check("HTTP admin guarda dos imágenes privadas en DEV", first.status === 201 && second.status === 201
    && typeof first.body.id === "string" && typeof second.body.id === "string" && first.body.id !== second.body.id);
  if (first.status !== 201 || second.status !== 201) throw new Error("Image upload not available");
  const imageOne = await expectRow("product_images", admin.from("product_images")
    .select("id,storage_path,is_primary").eq("id", first.body.id));
  const imageTwo = await expectRow("product_images", admin.from("product_images")
    .select("id,storage_path,is_primary").eq("id", second.body.id));
  check("dos rutas Storage son únicas y del producto", imageOne.storage_path !== imageTwo.storage_path
    && imageOne.storage_path.startsWith(`${product.id}/`) && imageTwo.storage_path.startsWith(`${product.id}/`));
  const [imagePublic, directStorage] = await Promise.all([
    get(`/api/product-images/${first.body.id}`),
    anon.storage.from("product-images").download(imageOne.storage_path)
  ]);
  check("ruta pública entrega imagen de producto publicado", imagePublic.status === 200 && imagePublic.type === "image/png");
  check("Storage privado niega descarga anónima directa", Boolean(directStorage.error));

  const operatorCover = await operator.client.rpc("set_product_primary_image", {
    p_product_id: product.id, p_image_id: first.body.id, p_expected_primary_id: null
  });
  check("operador no cambia portada", operatorCover.error?.code === "42501");
  const firstCover = await administrator.client.rpc("set_product_primary_image", {
    p_product_id: product.id, p_image_id: first.body.id, p_expected_primary_id: null
  });
  const staleCover = await administrator.client.rpc("set_product_primary_image", {
    p_product_id: product.id, p_image_id: second.body.id, p_expected_primary_id: null
  });
  const secondCover = await administrator.client.rpc("set_product_primary_image", {
    p_product_id: product.id, p_image_id: second.body.id, p_expected_primary_id: first.body.id
  });
  const replayCover = await administrator.client.rpc("set_product_primary_image", {
    p_product_id: product.id, p_image_id: second.body.id, p_expected_primary_id: first.body.id
  });
  const { data: covers, error: coverError } = await admin.from("product_images")
    .select("id,is_primary").eq("product_id", product.id);
  const { count: auditCount, error: auditError } = await admin.from("audit_events")
    .select("id", { count: "exact", head: true }).eq("entity_id", product.id).eq("action", "primary_image_changed");
  check("portada serializada, conflicto obsoleto y repetición idempotente", firstCover.data === first.body.id
    && staleCover.error?.code === "P4090" && secondCover.data === second.body.id
    && replayCover.data === second.body.id && !coverError && covers?.filter((row) => row.is_primary).length === 1
    && covers?.find((row) => row.is_primary)?.id === second.body.id && !auditError && auditCount === 2);

  const training = await expectRow("trainings", admin.from("trainings").insert({
    slug, title: `${marker} capacitación ficticia`, description: "Material ficticio de DEV",
    video_url: "https://example.invalid/video-dev", publication_status: "draft"
  }).select("id"));
  const hiddenDraft = await anon.from("catalog_trainings").select("id").eq("id", training.id);
  const { error: relationError } = await admin.from("training_products")
    .insert({ training_id: training.id, product_id: product.id });
  const { error: publishError } = await admin.from("trainings")
    .update({ publication_status: "published" }).eq("id", training.id);
  const [publicTraining, trainingPage] = await Promise.all([
    anon.from("catalog_trainings").select("id,title").eq("id", training.id),
    get("/capacitaciones")
  ]);
  check("capacitación borrador oculta, publicada visible y relacionada", !hiddenDraft.error
    && hiddenDraft.data?.length === 0 && !relationError && !publishError
    && publicTraining.data?.length === 1 && trainingPage.text.includes(`${marker} capacitación ficticia`));

  const order = await expectRow("orders", admin.from("orders").insert({
    reference: marker, customer_id: customer.userId,
    idempotency_key: `${marker}-order`, stage: "draft", currency: "GTQ"
  }).select("id"));
  const line = await expectRow("order_items", admin.from("order_items").insert({
    order_id: order.id, product_id: product.id, line_no: 1, quantity: 1,
    sku_snapshot: marker, name_snapshot: `${marker} producto ficticio`
  }).select("id"));
  const manualCase = await operator.client.rpc("register_manual_service_case", {
    p_order_id: order.id, p_kind: "warranty", p_reason: "Caso ficticio DEV",
    p_items: [{ order_item_id: line.id, quantity: 1 }], p_idempotency_key: `${marker}-case`
  });
  const review = await admin.from("reviews").insert({
    customer_id: customer.userId, product_id: product.id, order_item_id: line.id,
    rating: 5, comment: "Reseña ficticia DEV", moderation_status: "pending"
  });
  const refund = await operator.client.rpc("register_refund_request", {
    p_case_id: randomUUID(), p_reason: "Sin autorización", p_idempotency_key: `${marker}-refund`
  });
  check("posventa y reseña no aceptan pedido borrador sin entrega", Boolean(manualCase.error)
    && Boolean(review.error));
  check("operador no registra reembolso", refund.error?.code === "42501");

  // Leave the evidence fixture visibly fictional and unavailable to shoppers.
  const [archiveTraining, draftProduct, deactivateBrand, deactivateCategory] = await Promise.all([
    admin.from("trainings").update({ publication_status: "archived" }).eq("id", training.id),
    admin.from("products").update({ publication_status: "draft" }).eq("id", product.id),
    admin.from("brands").update({ active: false }).eq("id", brand.id),
    admin.from("categories").update({ active: false }).eq("id", category.id)
  ]);
  if ([archiveTraining, draftProduct, deactivateBrand, deactivateCategory].some((result) => result.error)) {
    throw new Error("QA fixture deactivation failed");
  }
  const [imageAfterDraft, trainingAfterArchive] = await Promise.all([
    get(`/api/product-images/${first.body.id}`),
    anon.from("catalog_trainings").select("id").eq("id", training.id)
  ]);
  check("fixture despublicada oculta imagen y capacitación", imageAfterDraft.status === 404
    && !trainingAfterArchive.error && trainingAfterArchive.data?.length === 0);

  const failed = checks.filter((ok) => !ok).length;
  console.log(`${failed ? "FAIL" : "PASS"}: operaciones administrativas DEV ${checks.length - failed}/${checks.length}.`);
  if (failed) process.exitCode = 1;
  console.log(`NO EJECUTADO: reseña y posventa positivas requieren pedido entregado; ${marker} queda como fixture ficticia inactiva.`);
}

async function staffPagesOnly() {
  const [administrator, operator, customer] = await Promise.all([
    createSession("admin"), createSession("operator"), createSession("customer")
  ]);
  try {
    const [adminTraining, operatorTraining, customerTraining, adminReviews, operatorReviews,
      adminDelivery, operatorDelivery, customerDelivery] = await Promise.all([
      get("/admin/capacitaciones", administrator.jar), get("/admin/capacitaciones", operator.jar),
      get("/admin/capacitaciones", customer.jar), get("/admin/resenas", administrator.jar),
      get("/admin/resenas", operator.jar), get("/admin/entregas", administrator.jar),
      get("/admin/entregas", operator.jar), get("/admin/entregas", customer.jar)
    ]);
    check("capacitaciones y reseñas solo admin", adminTraining.status === 200
      && adminTraining.text.includes("<h1>Capacitaciones</h1>")
      && !operatorTraining.text.includes("<h1>Capacitaciones</h1>")
      && !customerTraining.text.includes("<h1>Capacitaciones</h1>")
      && adminReviews.status === 200 && adminReviews.text.includes("<h1>Moderar reseñas</h1>")
      && !operatorReviews.text.includes("<h1>Moderar reseñas</h1>"));
    check("ajustes de checkout DEV solo admin", adminDelivery.status === 200
      && adminDelivery.text.includes("Checkout · PRUEBA DEV")
      && adminDelivery.text.includes("Simulador de pasarela PRUEBA DEV")
      && !operatorDelivery.text.includes("Checkout · PRUEBA DEV")
      && !customerDelivery.text.includes("Checkout · PRUEBA DEV"));
    const orderId = process.argv[3];
    if (orderId) {
      assert.match(orderId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      const path = `/admin/ventas/${orderId}`;
      const [adminOrder, operatorOrder, customerOrder] = await Promise.all([
        get(path, administrator.jar), get(path, operator.jar), get(path, customer.jar)
      ]);
      check("operador ve operaciones COD y conciliación sin exponerlas al cliente", adminOrder.status === 200
        && operatorOrder.status === 200
        && operatorOrder.text.includes("Operación del pedido")
        && operatorOrder.text.includes("Cobro del pedido")
        && operatorOrder.text.includes("diferencia en revisión")
        && !customerOrder.text.includes("Operación del pedido"));
      const shipment = await admin.from("shipments").select("id")
        .eq("order_id", orderId).single();
      if (shipment.error || !shipment.data) throw new Error("COD QA shipment missing");
      const [customerPayment, customerStatement, operatorStatements, customerStatements] = await Promise.all([
        customer.client.rpc("record_staff_test_payment", {
          p_order_id: orderId, p_method: "carrier_cod", p_outcome: "succeeded",
          p_evidence_reference: "PRUEBA DEV acceso denegado", p_idempotency_key: randomUUID()
        }),
        customer.client.rpc("record_staff_carrier_statement", {
          p_shipment_id: shipment.data.id, p_gross_collected: "1.00", p_commission: "0.00",
          p_shipping_deducted: "0.00", p_other_deductions: "0.00",
          p_commission_notes: null, p_deduction_notes: null, p_variance_notes: "PRUEBA DEV",
          p_idempotency_key: randomUUID()
        }),
        operator.client.from("carrier_settlements").select("id").eq("shipment_id", shipment.data.id),
        customer.client.from("carrier_settlements").select("id").eq("shipment_id", shipment.data.id)
      ]);
      check("RPC de cobro y reporte niegan cliente; RLS permite operador", customerPayment.error?.code === "42501"
        && customerStatement.error?.code === "42501"
        && !operatorStatements.error && operatorStatements.data?.length === 1
        && !customerStatements.error && customerStatements.data?.length === 0);
    }
    if (checks.includes(false)) process.exitCode = 1;
  } finally {
    for (const { userId } of [administrator, operator, customer]) {
      const role = await admin.from("user_roles").delete().eq("user_id", userId);
      const profile = await admin.from("profiles").delete().eq("id", userId);
      const auth = await admin.auth.admin.deleteUser(userId);
      if (role.error || profile.error || auth.error) throw new Error("Temporary staff-page account cleanup failed");
    }
    console.log("PASS: cuentas temporales de prueba de paneles eliminadas de DEV.");
  }
}

async function retireFixture() {
  const expected = process.argv[3];
  assert.match(expected ?? "", /^DEV-QA-ADMINOPS-[0-9a-f]{8}$/);
  const matching = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`DEV Auth listing: ${error.code || "failed"}`);
    for (const user of data.users) {
      if (user.user_metadata?.qa_marker === expected
        && new RegExp(`^${expected.toLowerCase()}-(admin|operator|customer)@example\\.invalid$`).test(user.email ?? "")) {
        matching.push(user.id);
      }
    }
    if (data.users.length < 1000) break;
  }
  assert.equal(matching.length, 3, "Expected exactly three QA fixture accounts");
  for (const id of matching) {
    const profile = await admin.from("profiles").update({ active: false }).eq("id", id).select("id,active").single();
    const role = await admin.from("user_roles").update({ role: "customer" }).eq("user_id", id).select("user_id,role").single();
    if (profile.error || role.error || profile.data?.active !== false || role.data?.role !== "customer") {
      throw new Error("QA fixture role/profile deactivation failed");
    }
  }
  console.log(`PASS: ${expected}: tres perfiles inactivos y sin rol privilegiado.`);
  console.log(`QA Auth IDs: ${matching.join(", ")}`);
}

(process.argv[2] === "--staff-pages" ? staffPagesOnly()
  : process.argv[2] === "--retire-fixture" ? retireFixture() : run()).catch((error) => {
  console.error(`FAIL: ${error?.message?.slice(0, 160) || "DEV admin operations"}`);
  process.exitCode = 1;
});

/** Real Next action + Supabase DEV QA. Leaves only clearly fictional, inactive audit rows. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

if (process.argv[2] !== "--run" || process.argv.length !== 3) {
  console.error("NO EJECUTADO: usa --run exclusivamente contra Supabase DEV enlazado.");
  process.exit(2);
}
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const appUrl = process.env.DEV_APP_URL?.trim();
const publicKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secret = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && publicKey && secret && linked === ref);
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.ok(appUrl && ["localhost", "127.0.0.1"].includes(new URL(appUrl).hostname));
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled");

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(url, secret, options);
const anon = createClient(url, publicKey, options);
const tag = `PRUEBA DEV admincontent ${randomUUID().slice(0, 8)}`;
const slug = tag.toLowerCase().replaceAll(" ", "-");
const users = [];
const checks = [];
const fixture = { brand: null, category: null, child: null, product: null, training: null };
function check(label, ok, code = "") {
  checks.push(Boolean(ok));
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${code ? ` (${code})` : ""}`);
}
function need(response, label) {
  if (response.error || response.data == null) throw new Error(`${label}: ${response.error?.code ?? "sin_datos"}`);
  return response.data;
}
function cookieHeader(session) {
  return [...session.jar.entries()].map(([name, value]) =>
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("; ");
}
async function account(label, role = "customer") {
  const email = `${slug}-${label}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const created = need(await db.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { qa_marker: tag } }), `Auth ${label}`).user;
  users.push(created.id);
  if (role !== "customer") need(await db.from("user_roles").update({ role })
    .eq("user_id", created.id).select("user_id").single(), `rol ${label}`);
  const jar = new Map();
  const client = createServerClient(url, publicKey, { cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (items) => items.forEach(({ name, value }) => jar.set(name, value))
  }});
  need(await client.auth.signInWithPassword({ email, password }), `login ${label}`);
  return { id: created.id, jar, client };
}
async function get(path, session) {
  const response = await fetch(new URL(path, appUrl), {
    headers: session ? { Cookie: cookieHeader(session) } : {},
    redirect: "manual", signal: AbortSignal.timeout(30_000)
  });
  return { status: response.status, type: response.headers.get("content-type"), text: await response.text() };
}
function decode(value) {
  return value.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&#x27;", "'");
}
function inputs(html) {
  return [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => {
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    const value = tag.match(/\bvalue="([^"]*)"/)?.[1] ?? "";
    return { name, value: decode(value), hidden: /\btype="hidden"/.test(tag) };
  }).filter((field) => field.name);
}
function actionMap(route) {
  const source = readFileSync(new URL(`../.next/server/app/${route}/page.js`, import.meta.url), "utf8");
  const map = new Map();
  for (const match of source.matchAll(/%22id%22%3A%22([0-9a-f]+)%22%2C%22exportedName%22%3A%22([A-Za-z]+Action)%22/g)) {
    map.set(match[1], match[2]);
  }
  return map;
}
function forms(html, route) {
  const map = actionMap(route);
  return [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map((match) => {
    const fields = inputs(match[1]);
    const meta = fields.find((field) => /^\$ACTION_\d+:0$/.test(field.name));
    let id = "";
    try { id = JSON.parse(meta?.value ?? "").id; } catch { /* Unrelated form. */ }
    return { name: map.get(id), fields, text: match[1] };
  });
}
function formField(form, name) { return form.fields.find((field) => field.name === name)?.value; }
async function submit(path, actor, name, values, match = () => true) {
  const page = await get(path, actor);
  if (page.status !== 200) throw new Error(`${name} GET HTTP ${page.status}`);
  const route = path.replace(/^\//, "");
  const available = forms(page.text, route);
  let form = available.find((item) => item.name === name && match(item));
  let synthetic = false;
  if (!form) {
    // Some editors are client-only disclosures and are absent from SSR HTML.
    // Invoke their registered action with a fresh bound-state form envelope;
    // this proves the server action, not the visual editor interaction.
    form = available.find((item) => item.fields.some((field) => /^\$ACTION_\d+:0$/.test(field.name)));
    synthetic = true;
  }
  if (!form) throw new Error(`${name}: formulario no encontrado`);
  const targetActionId = [...actionMap(route)].find(([, exported]) => exported === name)?.[0];
  if (!targetActionId) throw new Error(`${name}: acción no compilada`);
  const body = new FormData();
  for (const field of form.fields.filter((item) => item.hidden && item.name.startsWith("$ACTION_"))) {
    if (synthetic && /^\$ACTION_\d+:0$/.test(field.name)) {
      body.set(field.name, JSON.stringify({ ...JSON.parse(field.value), id: targetActionId }));
    } else {
      body.set(field.name, field.value);
    }
  }
  for (const [key, value] of Object.entries(values)) body.set(key, String(value));
  const response = await fetch(new URL(path, appUrl), {
    method: "POST", headers: { Cookie: cookieHeader(actor), Origin: new URL(appUrl).origin },
    body, redirect: "manual", signal: AbortSignal.timeout(30_000)
  });
  return { status: response.status, text: await response.text(), synthetic };
}
async function row(table, column, value, select = "*") {
  return need(await db.from(table).select(select).eq(column, value).single(), `${table} ${column}`);
}

try {
  const administrator = await account("admin", "admin");
  const operator = await account("operator", "operator");
  const customer = await account("customer");
  const stranger = await account("stranger");
  console.log(`Fixture: ${tag}`);
  const [adminPage, operatorPage, customerPage] = await Promise.all([
    get("/admin/catalogo", administrator), get("/admin/catalogo", operator), get("/admin/catalogo", customer)
  ]);
  check("panel de catálogo solo admin", adminPage.status === 200
    && adminPage.text.includes("<h1>Catálogo GreenBel</h1>")
    && !operatorPage.text.includes("<h1>Catálogo GreenBel</h1>")
    && !customerPage.text.includes("<h1>Catálogo GreenBel</h1>"));

  let result = await submit("/admin/catalogo", administrator, "createBrandAction",
    { name: `${tag} marca`, slug: `${slug}-marca` });
  fixture.brand = await row("brands", "slug", `${slug}-marca`, "id,name,active");
  check("acción HTTP crea marca inactiva", result.status === 200 && !fixture.brand.active);
  result = await submit("/admin/catalogo", administrator, "createCategoryAction",
    { name: `${tag} categoría`, slug: `${slug}-categoria`, parentId: "" });
  fixture.category = await row("categories", "slug", `${slug}-categoria`, "id,name,active,parent_id");
  check("acción HTTP crea categoría inactiva", result.status === 200 && !fixture.category.active);
  await submit("/admin/catalogo", administrator, "createCategoryAction",
    { name: `${tag} subcategoría`, slug: `${slug}-subcategoria`, parentId: fixture.category.id });
  fixture.child = await row("categories", "slug", `${slug}-subcategoria`, "id,parent_id,active");
  check("subcategoría persiste con padre", fixture.child.parent_id === fixture.category.id && !fixture.child.active);

  const brandUpdate = await submit("/admin/catalogo", administrator, "updateBrandAction",
    { id: fixture.brand.id, name: `${tag} marca editada`, slug: `${slug}-marca` },
    (form) => formField(form, "id") === fixture.brand.id);
  const categoryUpdate = await submit("/admin/catalogo", administrator, "updateCategoryAction",
    { id: fixture.category.id, name: `${tag} categoría editada`, slug: `${slug}-categoria`, parentId: "" },
    (form) => formField(form, "id") === fixture.category.id);
  const updatedBrand = await row("brands", "id", fixture.brand.id, "name");
  const updatedCategory = await row("categories", "id", fixture.category.id, "name");
  check("acciones HTTP editan marca y categoría", brandUpdate.status === 200 && categoryUpdate.status === 200
    && updatedBrand.name.endsWith("editada") && updatedCategory.name.endsWith("editada"));
  await submit("/admin/catalogo", administrator, "setBrandActiveAction",
    { id: fixture.brand.id, active: "true" }, (form) => formField(form, "id") === fixture.brand.id);
  await submit("/admin/catalogo", administrator, "setCategoryActiveAction",
    { id: fixture.category.id, active: "true" }, (form) => formField(form, "id") === fixture.category.id);
  const activeBrand = await row("brands", "id", fixture.brand.id, "active");
  const activeCategory = await row("categories", "id", fixture.category.id, "active");
  check("acciones HTTP activan dependencias", activeBrand.active && activeCategory.active);

  const base = { id: "", sku: `QA-ADMINCONTENT-${slug.slice(-8).toUpperCase()}`, slug: `${slug}-producto`,
    name: `${tag} producto sin precio`, model: "QA", kind: "equipment", brandId: fixture.brand.id,
    categoryId: fixture.category.id, shortDescription: `${tag}; producto ficticio`,
    description: "Equipo de prueba exclusivo DEV", regularPrice: "", warrantyMonths: "",
    warrantyTerms: "", publicationStatus: "published" };
  result = await submit("/admin/catalogo", administrator, "saveProductAction", base,
    (form) => formField(form, "id") === "");
  fixture.product = await row("products", "slug", base.slug,
    "id,regular_price,currency,publication_status,category_id,brand_id");
  const publicUnpriced = await anon.from("catalog_products").select("id,regular_price,effective_price")
    .eq("id", fixture.product.id).single();
  const unpricedPage = await get(`/productos/${base.slug}`);
  check("producto sin precio publicado desde HTTP muestra Precio próximamente", result.status === 200
    && fixture.product.regular_price === null && fixture.product.currency === null
    && !publicUnpriced.error && publicUnpriced.data?.effective_price === null
    && unpricedPage.status === 200 && unpricedPage.text.includes("Precio próximamente"));

  const operatorCreate = await submit("/admin/catalogo", operator, "createBrandAction",
    { name: `${tag} prohibida operador`, slug: `${slug}-operator-bad` }, () => true).catch(() => null);
  const operatorDirect = await operator.client.from("brands").insert({
    name: `${tag} directa prohibida`, slug: `${slug}-direct-bad`, active: true
  });
  const badBrand = await db.from("brands").select("id").eq("slug", `${slug}-operator-bad`);
  check("operador no abre panel ni escribe marca directamente", operatorCreate === null
    && Boolean(operatorDirect.error) && !badBrand.error && badBrand.data.length === 0);

  const priced = { ...base, id: fixture.product.id, name: `${tag} producto con precio`, regularPrice: "123.45" };
  await submit("/admin/catalogo", administrator, "saveProductAction", priced);
  const updatedProduct = await row("products", "id", fixture.product.id, "name,regular_price,currency");
  check("acción HTTP actualiza producto y GTQ sin agregar IVA", updatedProduct.name.endsWith("precio")
    && Number(updatedProduct.regular_price) === 123.45 && updatedProduct.currency === "GTQ");

  await submit("/admin/catalogo", administrator, "saveSpecAction",
    { id: "", productId: fixture.product.id, label: "Potencia", value: "PRUEBA DEV", unit: "W", sortOrder: 0 },
    (form) => formField(form, "productId") === fixture.product.id && formField(form, "id") === "");
  await submit("/admin/catalogo", administrator, "saveInclusionAction",
    { id: "", productId: fixture.product.id, description: `${tag} accesorio incluido`, quantity: "1", sortOrder: 0 },
    (form) => formField(form, "productId") === fixture.product.id && formField(form, "id") === "");
  const [specs, inclusions] = await Promise.all([
    db.from("product_specs").select("id").eq("product_id", fixture.product.id),
    db.from("product_inclusions").select("id").eq("product_id", fixture.product.id)
  ]);
  check("especificación e incluido persisten desde panel", !specs.error && specs.data.length === 1
    && !inclusions.error && inclusions.data.length === 1);

  const upload = new FormData();
  upload.set("productId", fixture.product.id);
  upload.set("altText", `${tag} imagen ficticia`);
  upload.set("image", new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKxkAAAAASUVORK5CYII=", "base64")],
    `${slug}.png`, { type: "image/png" }));
  const imageResponse = await fetch(new URL("/api/admin/product-images", appUrl), {
    method: "POST", headers: { Cookie: cookieHeader(administrator), Origin: new URL(appUrl).origin },
    body: upload, signal: AbortSignal.timeout(30_000)
  });
  const imagePayload = await imageResponse.json();
  const image = await row("product_images", "id", imagePayload.id,
    "id,storage_path,alt_text,sort_order,is_primary");
  check("imagen subida por HTTP se guarda en bucket privado", imageResponse.status === 201
    && image.storage_path.startsWith(`${fixture.product.id}/`));
  await submit("/admin/catalogo", administrator, "updateImageMetadataAction",
    { id: image.id, productId: fixture.product.id, altText: `${tag} portada editada`, sortOrder: 2 },
    (form) => formField(form, "id") === image.id);
  const imageAfter = await row("product_images", "id", image.id, "alt_text,sort_order");
  check("metadatos de imagen editados desde panel", imageAfter.alt_text.endsWith("editada") && imageAfter.sort_order === 2);
  await submit("/admin/catalogo", administrator, "setPrimaryImageAction",
    { productId: fixture.product.id, imageId: image.id, expectedPrimaryId: "" },
    (form) => formField(form, "imageId") === image.id);
  const cover = await row("product_images", "id", image.id, "is_primary");
  const [publicImage, privateImage] = await Promise.all([
    get(`/api/product-images/${image.id}`),
    anon.storage.from("product-images").download(image.storage_path)
  ]);
  check("portada elegida; ruta pública sí, Storage anónimo no", cover.is_primary
    && publicImage.status === 200 && Boolean(privateImage.error));

  const trainingDraft = { id: "", title: `${tag} capacitación`, slug: `${slug}-capacitacion`,
    description: `${tag} video ficticio`, videoUrl: "", publicationStatus: "draft" };
  await submit("/admin/capacitaciones", administrator, "saveTrainingAction", trainingDraft,
    (form) => formField(form, "id") === "");
  fixture.training = await row("trainings", "slug", trainingDraft.slug, "id,publication_status,video_url");
  const earlyTraining = await anon.from("catalog_trainings").select("id").eq("id", fixture.training.id);
  check("capacitación borrador sin video oculta", fixture.training.publication_status === "draft"
    && !earlyTraining.error && earlyTraining.data.length === 0);
  const invalidPublish = await submit("/admin/capacitaciones", administrator, "saveTrainingAction",
    { ...trainingDraft, id: fixture.training.id, publicationStatus: "published" },
    (form) => formField(form, "id") === fixture.training.id);
  const unchanged = await row("trainings", "id", fixture.training.id, "publication_status");
  check("publicación sin video rechazada", invalidPublish.status === 200 && unchanged.publication_status === "draft");
  await submit("/admin/capacitaciones", administrator, "saveTrainingAction",
    { ...trainingDraft, id: fixture.training.id, videoUrl: "https://example.invalid/prueba-dev-video", publicationStatus: "published" },
    (form) => formField(form, "id") === fixture.training.id);
  const publishedTraining = await row("trainings", "id", fixture.training.id, "publication_status,video_url");
  check("video HTTPS publicado desde panel", publishedTraining.publication_status === "published"
    && publishedTraining.video_url === "https://example.invalid/prueba-dev-video");
  await submit("/admin/capacitaciones", administrator, "saveTrainingRelationAction",
    { trainingId: fixture.training.id, targetId: fixture.product.id, kind: "product", operation: "attach" });
  await submit("/admin/capacitaciones", administrator, "saveTrainingRelationAction",
    { trainingId: fixture.training.id, targetId: fixture.category.id, kind: "category", operation: "attach" });
  const [linkedProduct, linkedCategory] = await Promise.all([
    db.from("training_products").select("product_id").eq("training_id", fixture.training.id)
      .eq("product_id", fixture.product.id).maybeSingle(),
    db.from("training_categories").select("category_id").eq("training_id", fixture.training.id)
      .eq("category_id", fixture.category.id).maybeSingle()
  ]);
  check("acciones HTTP relacionan capacitación con producto y categoría", !linkedProduct.error
    && linkedProduct.data?.product_id === fixture.product.id && !linkedCategory.error
    && linkedCategory.data?.category_id === fixture.category.id);
  const [trainingList, trainingDetail] = await Promise.all([
    get("/capacitaciones"), get(`/capacitaciones/${trainingDraft.slug}`)
  ]);
  check("capacitación visible en listado y ficha pública", trainingList.text.includes(trainingDraft.title)
    && trainingDetail.status === 200 && trainingDetail.text.includes(trainingDraft.title));

  const deniedWrite = await customer.client.from("trainings").insert({
    title: `${tag} prohibida`, slug: `${slug}-training-bad`, publication_status: "draft"
  });
  check("cliente no escribe capacitación directamente", Boolean(deniedWrite.error));

  // A fresh delivered purchase is required by the review trigger. Use only
  // this fixture's priced product and the already-approved fictitious pickup option.
  need(await operator.client.rpc("record_inventory_change", {
    p_product_id: fixture.product.id, p_kind: "stock_entry", p_quantity_delta: 1,
    p_reason: tag, p_reference: tag, p_idempotency_key: randomUUID()
  }), "stock reseña");
  const intent = { lines: [{ productId: fixture.product.id, quantity: 1 }],
    billing: { kind: "cf", firstName: "Cliente", lastName: "PRUEBA DEV", phone: "5555 5555" },
    delivery: { kind: "pickup", serviceId: "a1000000-0000-4000-8000-000000000001" },
    paymentOptionId: "a4000000-0000-4000-8000-000000000001" };
  const reviewed = need(await customer.client.rpc("review_checkout", {
    p_intent: intent, p_review_key: randomUUID(), p_review_id: null
  }), "revisión compra entregada");
  const confirmed = need(await customer.client.rpc("confirm_checkout", {
    p_review_id: reviewed.reviewId, p_intent: intent, p_accepted_revision: reviewed.revision,
    p_accepted_total: reviewed.total, p_idempotency_key: randomUUID()
  }), "confirmación compra entregada");
  const shipmentEvent = async (event) => need(await operator.client.rpc("record_staff_shipment_event", {
    p_order_id: confirmed.orderId, p_event: event, p_tracking_number: null, p_tracking_url: null,
    p_evidence_reference: `${tag} ${event}`, p_idempotency_key: randomUUID()
  }), `envío ${event}`);
  await shipmentEvent("prepare");
  await shipmentEvent("ready_for_pickup");
  need(await operator.client.rpc("record_staff_test_payment", {
    p_order_id: confirmed.orderId, p_method: "cash", p_outcome: "succeeded",
    p_evidence_reference: `${tag} efectivo ficticio`, p_idempotency_key: randomUUID()
  }), "pago ficticio");
  await shipmentEvent("deliver");
  const line = need(await db.from("order_items").select("id")
    .eq("order_id", confirmed.orderId).single(), "línea entregada");
  const strangerInsert = await db.from("reviews").insert({
    customer_id: stranger.id, product_id: fixture.product.id, order_item_id: line.id,
    rating: 5, comment: `${tag} reseña ajena`, moderation_status: "pending"
  });
  const directCustomerInsert = await customer.client.from("reviews").insert({
    customer_id: customer.id, product_id: fixture.product.id, order_item_id: line.id,
    rating: 2, comment: `${tag} reseña directa prohibida`, moderation_status: "pending"
  });
  const review = need(await db.from("reviews").insert({
    customer_id: customer.id, product_id: fixture.product.id, order_item_id: line.id,
    rating: 2, comment: `${tag} opinión negativa legítima`, moderation_status: "pending"
  }).select("id").single(), "reseña entregada");
  const beforeModeration = await anon.from("reviews").select("id").eq("id", review.id);
  check("reseña ajena y DML directo cliente denegados; compra entregada pendiente privada",
    Boolean(strangerInsert.error) && Boolean(directCustomerInsert.error)
    && !beforeModeration.error && beforeModeration.data.length === 0);
  const adminReviewPage = await get("/admin/resenas", administrator);
  const operatorReviewPage = await get("/admin/resenas", operator);
  check("reseña pendiente solo en panel admin", adminReviewPage.text.includes(`${tag} opinión negativa legítima`)
    && !operatorReviewPage.text.includes(`${tag} opinión negativa legítima`));
  await submit("/admin/resenas", administrator, "moderateReviewAction",
    { id: review.id, decision: "visible", reason: "" },
    (form) => formField(form, "id") === review.id && formField(form, "decision") === "visible");
  const moderated = await row("reviews", "id", review.id,
    "moderation_status,moderation_reason,moderated_by,moderated_at");
  const publicReview = await anon.from("reviews").select("id").eq("id", review.id);
  check("admin publica opinión negativa legítima; público la ve", moderated.moderation_status === "visible"
    && moderated.moderation_reason === null && moderated.moderated_by === administrator.id
    && Boolean(moderated.moderated_at) && !publicReview.error && publicReview.data.length === 1);

  // Keep the complete audit trail, but remove these products/content from public DEV.
  need(await db.from("trainings").update({ publication_status: "archived" })
    .eq("id", fixture.training.id).select("id").single(), "archivar capacitación");
  need(await db.from("products").update({ publication_status: "draft" })
    .eq("id", fixture.product.id).select("id").single(), "despublicar producto");
  need(await db.from("brands").update({ active: false })
    .eq("id", fixture.brand.id).select("id").single(), "desactivar marca");
  need(await db.from("categories").update({ active: false })
    .eq("id", fixture.category.id).select("id").single(), "desactivar categoría");
  const afterPublic = await anon.from("catalog_products").select("id").eq("id", fixture.product.id);
  const afterTraining = await anon.from("catalog_trainings").select("id").eq("id", fixture.training.id);
  check("fixture final fuera del catálogo y capacitaciones públicas", !afterPublic.error
    && afterPublic.data.length === 0 && !afterTraining.error && afterTraining.data.length === 0);
} catch (error) {
  check("ejecución completa", false, error?.message?.slice(0, 180) ?? "error");
} finally {
  for (const [table, id, changes] of [
    ["trainings", fixture.training?.id, { publication_status: "archived" }],
    ["products", fixture.product?.id, { publication_status: "draft" }],
    ["brands", fixture.brand?.id, { active: false }],
    ["categories", fixture.category?.id, { active: false }]
  ]) {
    if (!id) continue;
    const retired = await db.from(table).update(changes).eq("id", id);
    check(`${table} ficticio queda inactivo`, !retired.error);
  }
  // Rows referenced by orders/reviews must remain for audit; revoke all test access.
  for (const id of users) {
    const profile = await db.from("profiles").update({ active: false }).eq("id", id);
    const role = await db.from("user_roles").update({ role: "customer" }).eq("user_id", id);
    const banned = await db.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    check("cuenta ficticia desactivada y sin privilegios", !profile.error && !role.error && !banned.error);
  }
  const failed = checks.filter((value) => !value).length;
  console.log(`${failed ? "FAIL" : "PASS"}: QA contenido administrativo DEV ${checks.length - failed}/${checks.length}.`);
  if (failed) process.exitCode = 1;
}

/**
 * Live DEV smoke test for private Storage, guest quotes and paused business forms.
 * Run only after 001–008 are applied, with a local Next server on DEV_APP_URL:
 *   node --env-file=.env scripts/dev-storage-forms-check.mjs --run
 *
 * Creates clearly marked fictional DEV fixtures and intentionally leaves them
 * persisted for inspection. It never sends email, creates OTPs, or uses PROD.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

if (process.argv[2] !== "--run") {
  console.error("NO EJECUTADO: se requiere --run para crear fixtures ficticias en DEV.");
  process.exit(2);
}

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const appUrl = process.env.DEV_APP_URL?.trim();
const publishableKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secretKey = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const emailMode = process.env.DEV_EMAIL_DELIVERY_MODE?.trim().toLowerCase() || "disabled";
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV", "DEV preflight");
assert.ok(ref && /^[a-z0-9-]{3,64}$/.test(ref));
assert.ok(new URL(url).hostname === `${ref}.supabase.co`, "DEV URL/ref preflight");
assert.ok(linked === ref, "DEV CLI link preflight");
assert.ok(publishableKey && secretKey);
assert.ok(emailMode === "disabled", "Business email pause");
assert.ok(appUrl && ["localhost", "127.0.0.1"].includes(new URL(appUrl).hostname));

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = randomUUID().slice(0, 8);
const marker = `DEV-QA-STORAGE-${tag}`;
const failures = [];
const short = (error) => error?.code || error?.status || "remote_error";
const checked = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}: ${label}`);
  if (!condition) failures.push(label);
  assert.ok(condition, label);
};
const observedFailure = (label, condition) => {
  console.log(`${condition ? "FAIL" : "PASS"}: ${label}`);
  if (condition) failures.push(label);
};
const readOnlyQuery = async (query) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query/read-only`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json" },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(25_000)
  });
  if (response.status !== 201) throw new Error(`DEV read-only SQL HTTP ${response.status}`);
  return response.json();
};
const post = async (path, body) => {
  const response = await fetch(new URL(path, appUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: new URL(appUrl).origin },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000)
  });
  let data = null;
  try { data = await response.json(); } catch { /* PDF responses are handled separately. */ }
  return { response, data };
};

async function main() {
  const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
  assert.ifError(bucketError);
  for (const name of ["quote-pdfs", "product-images"]) {
    const bucket = buckets.find((entry) => entry.id === name);
    checked(`${name} es privado en Storage DEV`, bucket && bucket.public === false);
  }

  const contactKey = randomUUID();
  const contact = {
    idempotencyKey: contactKey,
    name: `${marker} Consulta`, email: `${tag}@example.invalid`, phone: "55555555",
    type: "prueba DEV", product: marker,
    message: `Consulta ficticia ${marker}; no requiere aviso por correo.`
  };
  const contactFirst = await post("/api/contacto", contact);
  checked("contacto nuevo: HTTP 201 y notificación disabled",
    contactFirst.response.status === 201 && contactFirst.data?.status === "recorded"
      && contactFirst.data?.notification === "disabled");
  const contactAgain = await post("/api/contacto", contact);
  checked("contacto repetido: HTTP 200 idempotente", contactAgain.response.status === 200);
  const contactConflict = await post("/api/contacto", { ...contact, message: `${contact.message} diferente` });
  checked("contacto clave reutilizada con otros datos: HTTP 409", contactConflict.response.status === 409);
  const { data: contacts, error: contactsError } = await admin.from("contact_messages")
    .select("id,notification_status").eq("idempotency_key", contactKey);
  observedFailure("panel de consultas: service_role carece de SELECT en contact_messages",
    !!contactsError && contactsError.code === "42501");
  if (!contactsError) checked("panel de consultas puede leer el contacto", contacts?.length === 1);
  const sqlContacts = await readOnlyQuery(`select notification_status from public.contact_messages where idempotency_key = '${contactKey}'`);
  checked("contacto persistió una vez y sin envío (SQL DEV de solo lectura)", sqlContacts?.length === 1
    && sqlContacts[0].notification_status === "not_sent");

  const email = `qa-storage-${tag}@example.invalid`;
  const password = randomBytes(30).toString("base64url");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { qa_marker: marker }
  });
  if (createError) throw new Error(`Auth DEV fixture: ${short(createError)}`);
  assert.ok(created.user?.id);
  const { error: roleError } = await admin.from("user_roles")
    .update({ role: "admin" }).eq("user_id", created.user.id);
  if (roleError) throw new Error(`DEV role fixture: ${short(roleError)}`);
  const actor = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await actor.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Auth DEV sign-in: ${short(signInError)}`);
  console.log("PASS: cuenta ficticia confirmada por Admin API, rol DEV y login por contraseña");

  const slug = `dev-qa-storage-${tag}`;
  const { data: category, error: categoryError } = await admin.from("categories")
    .insert({ name: `${marker} Categoría`, slug, active: true }).select("id").single();
  if (categoryError) throw new Error(`DEV category fixture: ${short(categoryError)}`);
  const { data: product, error: productError } = await admin.from("products")
    .insert({ sku: marker, slug, name: `${marker} Producto ficticio`, kind: "equipment",
      category_id: category.id, regular_price: "123.45", currency: "GTQ", publication_status: "published" })
    .select("id").single();
  if (productError) throw new Error(`DEV product fixture: ${short(productError)}`);
  const { error: stockError } = await actor.rpc("record_inventory_change", {
    p_product_id: product.id, p_kind: "stock_entry", p_quantity_delta: 2,
    p_reason: `Stock ficticio ${marker}`, p_reference: marker,
    p_idempotency_key: `qa-storage-${tag}-stock`
  });
  if (stockError) throw new Error(`DEV inventory fixture: ${short(stockError)}`);
  console.log("PASS: producto ficticio publicado con stock verificado por comando de inventario");

  const imagePath = `${product.id}/${randomUUID()}.png`;
  // Tiny PNG fixture; this path is private even for an authenticated admin client.
  const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9v3f0AAAAASUVORK5CYII=", "base64");
  const { error: imageUploadError } = await admin.storage.from("product-images")
    .upload(imagePath, imageBytes, { contentType: "image/png", upsert: false });
  if (imageUploadError) throw new Error(`DEV image upload: ${short(imageUploadError)}`);
  const { data: image, error: imageRowError } = await admin.from("product_images")
    .insert({ product_id: product.id, storage_path: imagePath, alt_text: marker })
    .select("id").single();
  if (imageRowError) throw new Error(`DEV image row: ${short(imageRowError)}`);
  const { data: forbiddenImage } = await anon.storage.from("product-images").download(imagePath);
  checked("imagen Storage no permite descarga anónima", !forbiddenImage);
  const imageRoute = await fetch(new URL(`/api/product-images/${image.id}`, appUrl), { signal: AbortSignal.timeout(25_000) });
  checked("imagen publicada se sirve por ruta controlada", imageRoute.status === 200
    && imageRoute.headers.get("content-type") === "image/png"
    && (await imageRoute.arrayBuffer()).byteLength === imageBytes.byteLength);

  const quoteKey = randomUUID();
  const quoteRequest = {
    idempotencyKey: quoteKey, customerName: `${marker} Cliente`, customerEmail: `${tag}@example.invalid`,
    lines: [{ productId: product.id, quantity: 1 }]
  };
  const first = await post("/api/cotizaciones", quoteRequest);
  checked("cotización nueva emitida y token privado entregado", first.response.status === 201
    && first.data?.status === "issued" && first.data?.quoteId && first.data?.downloadToken);
  const quoteId = first.data.quoteId;
  const token = first.data.downloadToken;
  const quoteAgain = await post("/api/cotizaciones", quoteRequest);
  checked("cotización repetida devuelve mismo documento", quoteAgain.response.status === 200
    && quoteAgain.data?.quoteId === quoteId && quoteAgain.data?.downloadToken === token);
  const quoteConflict = await post("/api/cotizaciones", { ...quoteRequest, customerName: `${marker} Otro` });
  checked("cotización clave alterada: HTTP 409", quoteConflict.response.status === 409);
  const { data: quoteRows, error: quoteReadError } = await admin.from("quotes")
    .select("id,stage,pdf_storage_path,pdf_sha256,pdf_bytes,merchandise_total,customer_total")
    .eq("idempotency_key", quoteKey);
  assert.ifError(quoteReadError);
  checked("cotización y PDF persistieron una vez con precio de servidor", quoteRows?.length === 1
    && quoteRows[0].stage === "issued" && Number(quoteRows[0].merchandise_total) === 123.45
    && quoteRows[0].customer_total === null);
  const { data: quoteItems, error: itemsError } = await admin.from("quote_items")
    .select("quantity,final_unit_price,line_total").eq("quote_id", quoteId);
  assert.ifError(itemsError);
  checked("línea de cotización calculada en servidor", quoteItems?.length === 1
    && Number(quoteItems[0].final_unit_price) === 123.45
    && Number(quoteItems[0].line_total) === 123.45);
  const { data: anonQuote, error: anonQuoteError } = await anon.from("quotes")
    .select("id").eq("id", quoteId);
  checked("anon no accede a fila privada de cotización",
    (anonQuoteError && !anonQuote) || (!anonQuoteError && anonQuote?.length === 0));
  const { data: rawPdf } = await anon.storage.from("quote-pdfs")
    .download(quoteRows[0].pdf_storage_path);
  checked("PDF Storage no permite descarga anónima", !rawPdf);

  const badPdf = await post(`/api/cotizaciones/${quoteId}/pdf`, { token: "A".repeat(43) });
  checked("PDF rechaza token inválido", badPdf.response.status === 403);
  const pdfResponse = await fetch(new URL(`/api/cotizaciones/${quoteId}/pdf`, appUrl), {
    method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(appUrl).origin },
    body: JSON.stringify({ token }), signal: AbortSignal.timeout(25_000)
  });
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  checked("PDF privado descargado y verificado", pdfResponse.status === 200
    && pdf.subarray(0, 5).toString() === "%PDF-"
    && pdf.byteLength === Number(quoteRows[0].pdf_bytes)
    && createHash("sha256").update(pdf).digest("hex") === quoteRows[0].pdf_sha256
    && pdfResponse.headers.get("cache-control")?.includes("no-store"));

  const financeKey = randomUUID();
  const financing = { idempotencyKey: financeKey, quoteId, quoteAccessToken: token,
    applicantName: `${marker} Solicitante`, email: `${tag}@example.invalid`,
    phone: "55555555", message: `Borrador ficticio ${marker}`, consent: true };
  const financeFirst = await post("/api/financiamiento/borradores", financing);
  checked("financiamiento nuevo es solo borrador pendiente sin envío",
    financeFirst.response.status === 201 && financeFirst.data?.status === "draft_recorded"
      && financeFirst.data?.verification === "pending" && financeFirst.data?.delivery === "disabled");
  const financeAgain = await post("/api/financiamiento/borradores", financing);
  checked("financiamiento repetido es idempotente", financeAgain.response.status === 200);
  const financeConflict = await post("/api/financiamiento/borradores", { ...financing, message: "Otro borrador" });
  checked("financiamiento clave alterada: HTTP 409", financeConflict.response.status === 409);
  const { data: financeRows, error: financeError } = await admin.from("financing_requests")
    .select("id,stage,consent_to_share,consent_version,consent_at")
    .eq("idempotency_key", financeKey);
  assert.ifError(financeError);
  checked("borrador financiero persistió una vez, sin estado enviado",
    financeRows?.length === 1 && financeRows[0].stage === "draft"
      && financeRows[0].consent_to_share === true && !!financeRows[0].consent_at);
  const { data: grant, error: grantError } = await admin.from("guest_access_grants")
    .select("use_count,max_uses").eq("quote_id", quoteId).single();
  assert.ifError(grantError);
  checked("uso de token contado solo por PDF y primer borrador", grant.use_count === 2 && grant.max_uses === 3);

  console.log(`${failures.length ? "FAIL" : "PASS"}: suite DEV Storage, PDF y formularios; ${failures.length} fallo(s) conocido(s). Fixtures ficticias persisten para auditoría.`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FAIL: ${error?.message?.slice(0, 160) || "prueba DEV"}`);
  process.exitCode = 1;
});

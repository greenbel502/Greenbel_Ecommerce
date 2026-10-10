/**
 * Targeted DEV QA for the real catalog editor and image upload HTTP boundary.
 * The short-lived account and draft product are removed by --cleanup.
 * Run: node --env-file=.env scripts/dev-admin-spec-image-qa.mjs --setup|--http|--inspect|--cleanup
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
assert.ok(["--setup", "--http", "--inspect", "--cleanup"].includes(mode) && process.argv.length === 3,
  "Specify one DEV QA mode");
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const publicKey = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secret = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && linked === ref && url && publicKey && secret,
  "DEV identity and credentials preflight");
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled");
const appUrl = new URL(process.env.DEV_APP_URL);
assert.ok(["localhost", "127.0.0.1"].includes(appUrl.hostname), "Local DEV app URL only");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(url, secret, options);
const fixturePath = "/private/tmp/greenbel-dev-admin-spec-image-qa.json";

function need(result, label) {
  if (result.error || result.data == null) throw new Error(`${label}: ${result.error?.code ?? "missing_data"}`);
  return result.data;
}
function fixture() {
  const f = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.match(f.marker, /^PRUEBA DEV specimage [0-9a-f]{8}$/);
  assert.match(f.slug, /^prueba-dev-specimage-[0-9a-f]{8}$/);
  assert.ok(typeof f.password === "string" && f.password.length >= 32, "Missing private QA password");
  return f;
}
async function session(f) {
  const jar = new Map();
  const client = createServerClient(url, publicKey, { cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (items) => items.forEach(({ name, value }) => jar.set(name, value))
  }});
  need(await client.auth.signInWithPassword({ email: f.email, password: f.password }), "Auth DEV QA login");
  return [...jar.entries()].map(([name, value]) =>
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("; ");
}
function png(size) {
  const bytes = Buffer.alloc(size);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  return bytes;
}
function imageForm(f, size, suffix, contents = png(size)) {
  const form = new FormData();
  form.set("productId", f.productId);
  form.set("altText", `${f.marker} imagen ${suffix}`);
  form.set("image", new File([contents], `${f.slug}-${suffix}.png`, { type: "image/png" }));
  return form;
}
async function imagePost(cookie, form) {
  const response = await fetch(new URL("/api/admin/product-images", appUrl), {
    method: "POST", headers: { Cookie: cookie, Origin: appUrl.origin },
    body: form, signal: AbortSignal.timeout(60_000)
  });
  return { status: response.status, body: await response.json() };
}
async function images(f) {
  return need(await db.from("product_images").select("id,storage_path")
    .eq("product_id", f.productId), "Fixture image rows");
}

if (mode === "--setup") {
  assert.ok(!existsSync(fixturePath), "Existing fixture needs inspection/cleanup first");
  const suffix = randomUUID().slice(0, 8);
  const marker = `PRUEBA DEV specimage ${suffix}`;
  const slug = `prueba-dev-specimage-${suffix}`;
  const email = `${slug}@example.invalid`;
  const f = { marker, slug, email, password: `${randomBytes(24).toString("base64url")}Aa1!`,
    userId: null, categoryId: null, productId: null };
  try {
    const user = need(await db.auth.admin.createUser({ email, password: f.password,
      email_confirm: true, user_metadata: { qa_marker: marker } }), "Create DEV QA account").user;
    f.userId = user.id;
    writeFileSync(fixturePath, JSON.stringify(f), { mode: 0o600, flag: "wx" });
    need(await db.from("user_roles").update({ role: "admin" }).eq("user_id", user.id)
      .select("user_id").single(), "Temporary DEV admin role");
    const category = need(await db.from("categories").insert({ name: `${marker} categoría`,
      slug, active: false }).select("id").single(), "Create DEV category");
    f.categoryId = category.id;
    writeFileSync(fixturePath, JSON.stringify(f), { mode: 0o600 });
    const product = need(await db.from("products").insert({ sku: `QA-SPECIMAGE-${suffix.toUpperCase()}`,
      slug, name: `${marker} producto`, kind: "equipment", category_id: category.id,
      publication_status: "draft" }).select("id").single(), "Create DEV draft product");
    f.productId = product.id;
    writeFileSync(fixturePath, JSON.stringify(f), { mode: 0o600 });
    console.log(`PASS: fixture ficticio DEV listo; cuenta ${email}; producto ${product.id}; borrador privado.`);
  } catch (error) {
    console.error(`FAIL: setup incompleto: ${error.message}; revisar ${fixturePath} y ejecutar --cleanup.`);
    process.exitCode = 1;
  }
}

if (mode === "--inspect") {
  const f = fixture();
  const [specRows, imageRows, product, role] = await Promise.all([
    db.from("product_specs").select("id,label,value,unit,sort_order").eq("product_id", f.productId),
    db.from("product_images").select("id,alt_text,storage_path").eq("product_id", f.productId),
    db.from("products").select("id,publication_status").eq("id", f.productId).single(),
    db.from("user_roles").select("role").eq("user_id", f.userId).single()
  ]);
  for (const result of [specRows, imageRows, product, role]) assert.ifError(result.error);
  console.log(`PASS: DEV persistencia; specs=${specRows.data.length}, images=${imageRows.data.length}, producto=${product.data.publication_status}, rol temporal=${role.data.role}.`);
  for (const row of specRows.data) console.log(`SPEC: ${row.id} ${row.label}=${row.value}${row.unit ? ` ${row.unit}` : ""}; orden=${row.sort_order}`);
  for (const row of imageRows.data) {
    const stored = need(await db.storage.from("product-images").download(row.storage_path), "Private DEV image");
    const size = (await stored.arrayBuffer()).byteLength;
    const expected = row.alt_text.endsWith("valida") ? 68 : 8_000_000;
    console.log(`${size === expected ? "PASS" : "FAIL"}: Storage privado contiene ${size} bytes de imagen QA (${row.alt_text.endsWith("valida") ? "PNG válido" : "límite"}).`);
    if (size !== expected) process.exitCode = 1;
  }
}

if (mode === "--http") {
  const f = fixture();
  const cookie = await session(f);
  assert.ok(cookie.length > 20, "Missing Supabase SSR session cookie");
  const page = await fetch(new URL("/admin/catalogo", appUrl), {
    headers: { Cookie: cookie }, signal: AbortSignal.timeout(30_000)
  });
  console.log(`${page.status === 200 ? "PASS" : "FAIL"}: cuenta QA abre panel por HTTP (${page.status}).`);
  const baseline = (await images(f)).length;
  const validPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKxkAAAAASUVORK5CYII=", "base64");
  assert.equal(validPng.length, 68);
  const validImage = await imagePost(cookie, imageForm(f, validPng.length, "valida", validPng));
  const validAccepted = validImage.status === 201 && validImage.body.status === "recorded";
  console.log(`${validAccepted ? "PASS" : "FAIL"}: HTTP acepta PNG válido pequeño (${validImage.status}).`);
  const afterValid = (await images(f)).length;
  const maxFile = await imagePost(cookie, imageForm(f, 8_000_000, "maximo"));
  const accepted = maxFile.status === 201 && maxFile.body.status === "recorded";
  console.log(`${accepted ? "PASS" : "FAIL"}: HTTP acepta archivo PNG de 8 000 000 bytes (${maxFile.status}${maxFile.body.error ? `, ${maxFile.body.error}` : ""}).`);
  const afterMax = (await images(f)).length;
  const overFile = await imagePost(cookie, imageForm(f, 8_000_001, "exceso-archivo"));
  const overFileRejected = overFile.status === 400 && (await images(f)).length === afterMax;
  console.log(`${overFileRejected ? "PASS" : "FAIL"}: HTTP rechaza 8 000 001 bytes sin fila (${overFile.status}).`);
  const overBody = await imagePost(cookie, imageForm(f, 8_032_769, "exceso-cuerpo"));
  const overBodyRejected = overBody.status === 413 && (await images(f)).length === afterMax;
  console.log(`${overBodyRejected ? "PASS" : "FAIL"}: HTTP limita cuerpo multipart > 8 032 768 bytes (${overBody.status}).`);

  // Send the same oversized multipart body without Content-Length. The stream
  // limit must stop it before FormData parsing or Storage can occur.
  const streamedForm = imageForm(f, 8_032_769, "exceso-stream");
  const encoded = new Request(appUrl, { method: "POST", body: streamedForm });
  const contentType = encoded.headers.get("content-type");
  const stream = encoded.body;
  const streamed = await fetch(new URL("/api/admin/product-images", appUrl), {
    method: "POST", headers: { Cookie: cookie, Origin: appUrl.origin, "Content-Type": contentType },
    body: stream, duplex: "half", signal: AbortSignal.timeout(60_000)
  });
  const streamRejected = streamed.status === 413 && (await images(f)).length === afterMax;
  console.log(`${streamRejected ? "PASS" : "FAIL"}: HTTP sin Content-Length limita flujo > 8 032 768 bytes (${streamed.status}).`);
  const passed = page.status === 200 && validAccepted && afterValid === baseline + 1
    && accepted && afterMax === baseline + 2 && overFileRejected && overBodyRejected && streamRejected;
  const passCount = [validAccepted, accepted, overFileRejected, overBodyRejected, streamRejected]
    .filter(Boolean).length;
  console.log(`${passed ? "PASS" : "FAIL"}: subida y frontera imagen DEV ${passCount}/5; filas añadidas ${afterMax - baseline}.`);
  if (!passed) process.exitCode = 1;
}

if (mode === "--cleanup") {
  const f = fixture();
  const account = need(await db.auth.admin.getUserById(f.userId), "DEV QA account lookup").user;
  assert.equal(account.user_metadata?.qa_marker, f.marker, "Fixture account marker");
  assert.equal(account.email, f.email, "Fixture account email");
  if (f.productId) {
    const product = need(await db.from("products").select("slug,publication_status")
      .eq("id", f.productId).single(), "Fixture product lookup");
    assert.equal(product.slug, f.slug);
    assert.equal(product.publication_status, "draft", "Never delete published product");
    const paths = (await images(f)).map((row) => row.storage_path);
    assert.ok(paths.every((path) => path.startsWith(`${f.productId}/`)));
    if (paths.length) {
      const removed = await db.storage.from("product-images").remove(paths);
      assert.ifError(removed.error);
    }
    for (const table of ["product_images", "product_specs", "products"]) {
      const key = table === "products" ? "id" : "product_id";
      const result = await db.from(table).delete().eq(key, f.productId);
      assert.ifError(result.error);
    }
  }
  if (f.categoryId) {
    const category = need(await db.from("categories").select("slug,active")
      .eq("id", f.categoryId).single(), "Fixture category lookup");
    assert.equal(category.slug, f.slug);
    assert.equal(category.active, false);
    assert.ifError((await db.from("categories").delete().eq("id", f.categoryId)).error);
  }
  const role = need(await db.from("user_roles").select("role").eq("user_id", f.userId).single(), "QA role");
  assert.equal(role.role, "admin");
  assert.ifError((await db.from("user_roles").delete().eq("user_id", f.userId)).error);
  assert.ifError((await db.from("profiles").delete().eq("id", f.userId)).error);
  assert.ifError((await db.auth.admin.deleteUser(f.userId)).error);
  unlinkSync(fixturePath);
  console.log("PASS: eliminados exclusivamente imagen, especificaciones, producto, categoría y cuenta temporal PRUEBA DEV.");
}

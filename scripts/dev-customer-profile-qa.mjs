/** DEV HTTP/UI/RLS QA. Only ephemeral fictional users created here are changed/removed. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const ref = process.env.SUPABASE_DEV_PROJECT_REF;
const url = process.env.DEV_SUPABASE_URL;
const origin = new URL(process.argv[2] ?? "http://localhost:3001");
const remainingOnly = process.argv[3] === "--remaining";
assert.ok(process.argv.length <= 4 && (!process.argv[3] || remainingOnly), "Only --remaining is supported after the local URL");
assert.equal(process.env.APP_ENV, "DEV");
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), ref);
assert.ok(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname) && origin.pathname === "/" && !origin.search && !origin.username && !origin.password);
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled");
const { chromium } = await import(process.env.GREENBEL_QA_PLAYWRIGHT_MODULE || "playwright");
const admin = createClient(url, process.env.DEV_SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, process.env.DEV_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const fixtures = [];
let browser;
let checks = 0;
function check(name, pass, location = "DEV") { assert.ok(pass, name); console.log(`PASS ${location}: ${name}`); checks++; }
async function createUser(label) {
  const email = `qa-profile-${label}-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: `PRUEBA DEV ${label} Perfil`, role: "admin" } });
  assert.equal(created.error, null, "Crear solo usuario ficticio sin correo");
  const id = created.data.user.id;
  const jar = new Map();
  const client = createServerClient(url, process.env.DEV_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: false, path: "/" },
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: cookies => cookies.forEach(({ name, value }) => jar.set(name, value)) }
  });
  const fixture = { id, client, jar }; fixtures.push(fixture);
  assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
  return fixture;
}
const cookie = fixture => [...fixture.jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
const profile = async fixture => {
  const result = await admin.from("profiles").select("display_name,phone,address_line,avatar_path,updated_at,active").eq("id", fixture.id).single();
  assert.equal(result.error, null); return result.data;
};
async function http(path, fixture, options = {}) {
  return fetch(new URL(path, origin), { ...options, headers: { ...(fixture ? { Cookie: cookie(fixture) } : {}), ...options.headers }, redirect: "manual" });
}
async function upload(fixture, bytes, type = "image/png") {
  const body = new FormData(); body.set("image", new Blob([bytes], { type }), "qa-image");
  return http("/api/account/avatar", fixture, { method: "POST", body, headers: { Origin: origin.origin } });
}
try {
  const a = await createUser("A"); const b = await createUser("B");
  browser = await chromium.launch({ headless: true, executablePath: process.env.GREENBEL_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([...a.jar].map(([name, value]) => ({ name, value, url: origin.origin, httpOnly: true, sameSite: "Lax" })));
  const page = await context.newPage(); const stale = await context.newPage();
  await page.goto(new URL("/cuenta", origin).toString(), { waitUntil: "networkidle" });
  const png = await sharp({ create: { width: 32, height: 40, channels: 3, background: "#88d600" } }).png().toBuffer();
  let saved;
  let nextAvatar;
  if (!remainingOnly) {
  await stale.goto(new URL("/cuenta", origin).toString(), { waitUntil: "networkidle" });
  check("cliente ve Mis datos y no Panel administrativo pese a metadata admin", await page.getByRole("heading", { name: "Mis datos", exact: true }).isVisible() && await page.getByRole("link", { name: "Panel administrativo", exact: true }).count() === 0);
  await page.getByLabel("Nombre completo", { exact: true }).fill("PRUEBA DEV Ana Pérez");
  await page.getByLabel("Teléfono", { exact: true }).fill("55550101");
  await page.locator('textarea[name="addressLine"]').fill("PRUEBA DEV Calle ficticia 123, zona de ensayo");
  await page.getByRole("button", { name: "Guardar mis datos" }).click();
  await page.getByRole("status").filter({ hasText: "Datos guardados" }).waitFor();
  saved = await profile(a);
  check("formulario real guarda nombre, teléfono y dirección en DEV", saved.display_name === "PRUEBA DEV Ana Pérez" && saved.phone === "55550101" && saved.address_line.startsWith("PRUEBA DEV Calle ficticia"));
  await page.getByRole("button", { name: "Guardar mis datos" }).click();
  await page.getByRole("button", { name: "Guardar mis datos" }).waitFor({ state: "visible" });
  check("segundo guardado conserva los mismos datos", (await profile(a)).phone === saved.phone);
  await stale.getByLabel("Teléfono", { exact: true }).fill("55559999");
  await stale.getByRole("button", { name: "Guardar mis datos" }).click();
  await stale.getByRole("alert").filter({ hasText: "otra pestaña" }).waitFor();
  check("formulario obsoleto no sobrescribe cambios", (await profile(a)).phone === saved.phone);
  await page.reload({ waitUntil: "networkidle" });
  check("datos persisten al recargar", await page.getByLabel("Nombre completo", { exact: true }).inputValue() === saved.display_name);
  const foreign = await b.client.from("profiles").update({ phone: "55559999" }).eq("id", a.id).select("id");
  check("RLS impide modificar perfil ajeno", !foreign.error && foreign.data.length === 0 && (await profile(a)).phone === saved.phone);
  check("RLS oculta datos de perfil ajeno", (await b.client.from("profiles").select("address_line,avatar_path").eq("id", a.id)).data?.length === 0);

  await page.getByLabel("Seleccionar foto de perfil").setInputFiles({ name: "PRUEBA-DEV.png", mimeType: "image/png", buffer: png });
  await page.getByRole("status").filter({ hasText: "Foto actualizada." }).waitFor();
  const avatar = (await profile(a)).avatar_path;
  check("subida desde interfaz guarda ruta privada propia", avatar?.startsWith(`${a.id}/`) && avatar.endsWith(".webp"));
  const image = await http("/api/account/avatar", a);
  assert.equal(image.status, 200);
  const imageMetadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
  check("HTTP devuelve WebP reprocesado 512px y sin EXIF", imageMetadata.format === "webp" && imageMetadata.width === 512 && !imageMetadata.exif && image.headers.get("cache-control").includes("no-store"));
  check("usuario B no obtiene foto de A manipulando query", (await http(`/api/account/avatar?id=${a.id}`, b)).status === 404);
  check("anónimo no obtiene foto", (await http("/api/account/avatar")).status === 401);
  check("Storage deniega foto ajena y anónima", Boolean((await b.client.storage.from("profile-avatars").download(avatar)).error) && Boolean((await anon.storage.from("profile-avatars").download(avatar)).error));
  check("CHECK impide asociar avatar de otro usuario", Boolean((await b.client.from("profiles").update({ avatar_path: avatar }).eq("id", b.id)).error));
  const webp = await sharp(png).webp().toBuffer();
  check("Storage no permite subir dentro de carpeta ajena", Boolean((await b.client.storage.from("profile-avatars").upload(`${a.id}/${randomUUID()}.webp`, webp, { contentType: "image/webp" })).error));
  check("origen ajeno rechazado", (await http("/api/account/avatar", a, { method: "POST", headers: { Origin: "https://attacker.example" } })).status === 403);
  check("archivo SVG rechazado", (await upload(a, "<svg></svg>", "image/svg+xml")).status === 400);
  check("PNG declarado con bytes falsos rechazado", (await upload(a, "not-an-image")).status === 400);
  check("límite de archivo mayor a 2MB comprobado por HTTP", (await upload(a, new Uint8Array(2_000_001))).status === 413);
  const boundary = "qa-profile-boundary";
  const oversized = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="large.png"\r\nContent-Type: image/png\r\n\r\n`));
    controller.enqueue(new Uint8Array(2_040_000)); controller.close();
  } });
  check("límite de stream sin Content-Length rechaza antes de parsear", (await http("/api/account/avatar", a, { method: "POST", body: oversized, duplex: "half", headers: { Origin: origin.origin, "Content-Type": `multipart/form-data; boundary=${boundary}` } })).status === 413);
  const replaced = await upload(a, png); assert.equal(replaced.status, 200);
  const replaceBody = await replaced.json();
  nextAvatar = (await profile(a)).avatar_path;
  const storedObjects = await admin.storage.from("profile-avatars").list(a.id);
  const oldExists = storedObjects.data?.some(file => `${a.id}/${file.name}` === avatar);
  const oldRead = await a.client.storage.from("profile-avatars").download(avatar, { cacheNonce: randomUUID() }, { cache: "no-store" });
  const newRead = await a.client.storage.from("profile-avatars").download(nextAvatar, { cacheNonce: randomUUID() }, { cache: "no-store" });
  if (oldExists || oldRead.error === null || newRead.error !== null) console.log(JSON.stringify({ diagnostic: "avatar replacement", pathChanged: nextAvatar !== avatar, cleanupPending: replaceBody.cleanupPending, oldExists, oldReadDenied: Boolean(oldRead.error), newReadAllowed: !newRead.error }));
  check("reemplazo retira solo avatar anterior y conserva el nuevo", nextAvatar !== avatar && !replaceBody.cleanupPending && !oldExists && Boolean(oldRead.error) && !newRead.error);
  } else {
    // Continue only the checks that were not reached; do not repeat closed upload/RLS checks.
    assert.equal((await a.client.from("profiles").update({ display_name: "PRUEBA DEV Ana Pérez", phone: "55550101", address_line: "PRUEBA DEV Calle ficticia 123, zona de ensayo" }).eq("id", a.id)).error, null);
    saved = await profile(a);
    assert.equal((await upload(a, png)).status, 200);
    nextAvatar = (await profile(a)).avatar_path;
  }
  const optionsA = await (await http("/api/checkout/options", a)).json();
  const optionsB = await (await http("/api/checkout/options", b)).json();
  if (!remainingOnly) check("opciones checkout incluyen solo datos propios", optionsA.profile.phone === saved.phone && optionsB.profile.phone !== saved.phone);
  const catalog = await admin.from("products").select("id").ilike("name", "%PRUEBA DEV%").eq("publication_status", "published").not("regular_price", "is", null).limit(1);
  assert.ok(catalog.data?.[0], "Se requiere producto ficticio existente publicado para el formulario de checkout");
  await page.evaluate(selection => localStorage.setItem("greenbel-cart", JSON.stringify(selection)), [{ productId: catalog.data[0].id, quantity: 1 }]);
  await page.goto(new URL("/checkout", origin).toString(), { waitUntil: "networkidle" });
  await page.getByLabel("Teléfono", { exact: true }).fill("77778888");
  await page.getByRole("button", { name: "Usar mis datos guardados" }).click();
  const shipping = optionsA.services.find(service => service.kind !== "pickup");
  assert.ok(shipping, "Se requiere servicio ficticio DEV de entrega para esta prueba");
  await page.getByRole("combobox", { name: /^Servicio/ }).selectOption(shipping.id);
  check("copiar perfil conserva teléfono ya editado y rellena destinatario/dirección", await page.getByLabel("Teléfono", { exact: true }).inputValue() === "77778888" && await page.getByLabel("Nombre de quien recibe", { exact: true }).inputValue() === saved.display_name && await page.getByLabel("Dirección de entrega", { exact: true }).inputValue() === saved.address_line);
  check("CF mantiene nombre y apellido a revisar, sin dividirlos automáticamente", await page.getByLabel("Nombre", { exact: true }).inputValue() === "" && await page.getByLabel("Apellido", { exact: true }).inputValue() === "");
  await page.getByRole("radio", { name: "Con NIT", exact: true }).check();
  check("nombre completo se reutiliza sin inventar titular de NIT", await page.getByLabel("Nombre completo", { exact: true }).inputValue() === saved.display_name && await page.getByLabel("Nombre del titular del NIT", { exact: true }).inputValue() === "");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(new URL("/cuenta", origin).toString(), { waitUntil: "networkidle" });
    await page.screenshot({ path: `/tmp/greenbel-profile-${width}.png`, fullPage: true });
    const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      bottomGap: document.documentElement.scrollHeight - (document.querySelector("footer").getBoundingClientRect().bottom + scrollY) }));
    check(`perfil ${width}px sin overflow ni franja inferior`, geometry.width === width && geometry.scrollWidth === width && Math.abs(geometry.bottomGap) <= 1, "LOCAL");
    await page.goto(new URL("/cuenta/ingresar", origin).toString(), { waitUntil: "networkidle" });
    await page.screenshot({ path: `/tmp/greenbel-login-agricola-${width}.png`, fullPage: true });
    const loginGeometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      gap: document.querySelector("footer").getBoundingClientRect().top - document.querySelector('section[aria-label="Acceso a GreenBel"]').getBoundingClientRect().bottom,
      bottomGap: document.documentElement.scrollHeight - (document.querySelector("footer").getBoundingClientRect().bottom + scrollY) }));
    check(`login ${width}px con imagen, sin overflow ni franjas del footer`, loginGeometry.width === width && loginGeometry.scrollWidth === width && Math.abs(loginGeometry.gap) <= 1 && Math.abs(loginGeometry.bottomGap) <= 1, "LOCAL");
  }
  await page.goto(new URL("/cuenta", origin).toString(), { waitUntil: "networkidle" });
  assert.equal((await admin.from("profiles").update({ active: false }).eq("id", a.id)).error, null);
  await page.getByLabel("Teléfono", { exact: true }).fill("55550000");
  await page.getByRole("button", { name: "Guardar mis datos" }).click();
  await page.getByRole("alert").filter({ hasText: "no está habilitada" }).waitFor();
  check("cuenta inactiva no guarda el formulario del perfil", (await profile(a)).phone === saved.phone);
  check("cuenta inactiva no lee ni sube avatar", (await http("/api/account/avatar", a)).status === 403 && (await upload(a, png)).status === 403);
  check("Storage también rechaza lectura del propietario inactivo", Boolean((await a.client.storage.from("profile-avatars").download(nextAvatar)).error));
  assert.equal((await admin.from("profiles").update({ active: true }).eq("id", a.id)).error, null);
  const removeOptions = { method: "DELETE", headers: { Origin: origin.origin } };
  check("quitar foto es repetible y deja perfil sin archivo", (await http("/api/account/avatar", a, removeOptions)).status === 200 && (await http("/api/account/avatar", a, removeOptions)).status === 200 && (await profile(a)).avatar_path === null);
  console.log(`PASS: ${checks}/${checks}. No se creó pedido, pago ni correo. Google real y SMTP no se prueban aquí.`);
} finally {
  if (browser) await browser.close();
  for (const fixture of fixtures.reverse()) {
    const objects = await admin.storage.from("profile-avatars").list(fixture.id);
    assert.equal(objects.error, null);
    if (objects.data.length) assert.equal((await admin.storage.from("profile-avatars").remove(objects.data.map(object => `${fixture.id}/${object.name}`))).error, null);
    assert.equal((await admin.from("user_roles").delete().eq("user_id", fixture.id)).error, null);
    assert.equal((await admin.from("profiles").delete().eq("id", fixture.id)).error, null);
    assert.equal((await admin.auth.admin.deleteUser(fixture.id)).error, null);
  }
  console.log("Retiradas exclusivamente cuentas/avatares efímeros creados por esta suite; fixtures anteriores conservados.");
}

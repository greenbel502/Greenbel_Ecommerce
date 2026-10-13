/** Navbar QA against DEV. Creates/removes only ephemeral users and their own avatars. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const origin = new URL(process.argv[2] ?? "http://localhost:3001");
const ref = process.env.SUPABASE_DEV_PROJECT_REF;
assert.equal(process.env.APP_ENV, "DEV");
assert.equal(new URL(process.env.DEV_SUPABASE_URL).hostname, `${ref}.supabase.co`);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), ref);
assert.ok(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)
  && origin.pathname === "/" && !origin.search && !origin.username && !origin.password);
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled");
const { chromium } = await import(process.env.GREENBEL_QA_PLAYWRIGHT_MODULE || "playwright");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(process.env.DEV_SUPABASE_URL, process.env.DEV_SUPABASE_SECRET_KEY, options);
const fixtures = [];
let browser;
let checks = 0;
function check(name, pass, scope = "DEV") { assert.ok(pass, name); console.log(`PASS ${scope}: ${name}`); checks++; }
async function createUser(label) {
  const email = `qa-navbar-${label.toLowerCase()}-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: `PRUEBA DEV ${label} Google`, role: "admin", avatar_url: "https://untrusted.example/avatar.png" } });
  assert.equal(result.error, null);
  const fixture = { id: result.data.user.id, email, password };
  fixtures.push(fixture);
  return fixture;
}
const accountButton = page => page.getByRole("button", { name: /^Mi cuenta:/ });
const accountRegion = page => page.getByRole("region", { name: "Opciones de mi cuenta", exact: true });
async function login(page, fixture) {
  await page.goto(new URL("/cuenta/ingresar", origin).toString(), { waitUntil: "networkidle" });
  await page.getByLabel("Correo electrónico", { exact: true }).fill(fixture.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/cuenta");
  await accountButton(page).waitFor();
}
async function session(context, path = "/api/account/session") {
  const result = await context.request.get(new URL(path, origin).toString());
  assert.equal(result.status(), 200);
  assert.match(result.headers()["cache-control"], /private, no-store/);
  assert.ok(result.headers().vary.split(/\s*,\s*/).some(value => value.toLowerCase() === "cookie"));
  return result.json();
}
try {
  const a = await createUser("Ana"); const b = await createUser("Bruno");
  const originalName = "PRUEBA DEV Ana Pérez";
  assert.equal((await admin.from("profiles").update({ display_name: originalName }).eq("id", a.id)).error, null);
  browser = await chromium.launch({ headless: true, executablePath: process.env.GREENBEL_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const other = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage(); const otherPage = await other.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.name));
  await page.goto(new URL("/cuenta/ingresar", origin).toString(), { waitUntil: "networkidle" });
  check("anónimo mantiene acceso a cuenta sin mostrar una identidad", (await session(context)).account === null && await page.getByRole("link", { name: "Ir a mi cuenta o ingresar" }).isVisible());
  await login(page, a);
  const own = (await session(context)).account;
  check("login real actualiza navbar con nombre de perfil y correo", own.name === originalName && own.email === a.email && await accountButton(page).getAttribute("aria-label") === `Mi cuenta: ${originalName}`);
  check("respuesta mínima sin secretos ni metadata y con caché privada", Object.keys(own).sort().join(",") === "avatarUrl,email,name,staffEntry" && own.avatarUrl === null && own.staffEntry === null);
  await accountButton(page).click();
  check("menú muestra identidad, cuenta y pedidos sin acceso admin por metadata", await accountRegion(page).getByText(a.email, { exact: true }).isVisible()
    && await accountRegion(page).getByRole("link", { name: "Mis pedidos", exact: true }).isVisible()
    && await accountRegion(page).getByRole("link", { name: "Panel administrativo" }).count() === 0);
  await page.keyboard.press("Escape");
  check("Escape cierra y devuelve foco al disparador", await accountRegion(page).count() === 0 && await accountButton(page).evaluate(element => element === document.activeElement), "LOCAL");
  await page.keyboard.press("Enter"); await page.keyboard.press("Tab");
  check("menú permite navegar con teclado a Mi cuenta", await accountRegion(page).getByRole("link", { name: "Mi cuenta", exact: true }).evaluate(element => element === document.activeElement), "LOCAL");
  await page.getByRole("heading", { level: 1 }).click();
  check("clic fuera cierra el menú", await accountRegion(page).count() === 0, "LOCAL");
  for (const width of [1440, 1200, 1024, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await accountButton(page).click();
    const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      headerWidth: document.querySelector(".nav-shell").scrollWidth,
      headerAvailable: document.querySelector(".nav-shell").clientWidth,
      dropdownLeft: document.querySelector('[aria-label="Opciones de mi cuenta"]').getBoundingClientRect().left,
      dropdownRight: document.querySelector('[aria-label="Opciones de mi cuenta"]').getBoundingClientRect().right }));
    check(`navbar/menú ${width}px sin desbordamiento`, geometry.width === width && geometry.scrollWidth === width && geometry.headerWidth <= geometry.headerAvailable + 1 && geometry.dropdownLeft >= 0 && geometry.dropdownRight <= width, "LOCAL");
    if ([1440, 390].includes(width)) {
      await page.locator("header.site-header").screenshot({ path: `/tmp/greenbel-navbar-account-${width}.png` });
      await page.screenshot({ path: `/tmp/greenbel-navbar-menu-${width}.png`, fullPage: true });
    }
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  const changedName = "PRUEBA DEV Ana Actualizada";
  await page.getByLabel("Nombre completo", { exact: true }).fill(changedName);
  await page.getByRole("button", { name: "Guardar mis datos" }).click();
  await page.getByRole("status").filter({ hasText: "Datos guardados" }).waitFor();
  await page.getByRole("button", { name: `Mi cuenta: ${changedName}`, exact: true }).waitFor();
  check("guardar perfil actualiza nombre del navbar sin recargar", (await session(context)).account.name === changedName);
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#88d600" } }).png().toBuffer();
  await page.getByLabel("Seleccionar foto de perfil").setInputFiles({ name: "PRUEBA-DEV.png", mimeType: "image/png", buffer: png });
  await page.getByRole("status").filter({ hasText: "Foto actualizada." }).waitFor();
  await accountButton(page).locator("img").waitFor();
  await accountButton(page).locator("img").evaluate(img => img.decode());
  check("foto privada nueva también aparece en navbar", (await session(context)).account.avatarUrl.startsWith("/api/account/avatar?v=") && await accountButton(page).locator("img").evaluate(img => img.naturalWidth > 0));
  await page.getByRole("button", { name: "Quitar foto subida", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Foto subida retirada." }).waitFor();
  await accountButton(page).locator("img").waitFor({ state: "detached" });
  check("quitar foto vuelve a iniciales en navbar", (await session(context)).account.avatarUrl === null);
  await login(otherPage, b);
  check("segunda cuenta no recibe identidad ajena aunque manipule query", (await session(other, `/api/account/session?userId=${a.id}`)).account.email === b.email);
  const publicPage = await context.request.get(new URL("/contacto", origin).toString());
  check("HTML público no serializa identidad de sesión del navbar", !(await publicPage.text()).includes(a.email));
  assert.equal((await admin.from("user_roles").update({ role: "operator" }).eq("user_id", b.id)).error, null);
  check("operador obtiene solo enlace correspondiente al rol DB", (await session(other)).account.staffEntry.href === "/admin/inventario");
  assert.equal((await admin.from("user_roles").update({ role: "admin" }).eq("user_id", b.id)).error, null);
  check("admin explícito conserva enlace de catálogo", (await session(other)).account.staffEntry.href === "/admin/catalogo");
  assert.equal((await admin.from("profiles").update({ active: false }).eq("id", b.id)).error, null);
  check("perfil inactivo no expone identidad ni enlaces del navbar", (await session(other)).account === null);
  await page.route("**/api/account/session", route => route.fulfill({ status: 503, json: { error: "LOCAL QA unavailable" } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("link", { name: "Ir a mi cuenta o ingresar" }).waitFor();
  check("fallo de consulta oculta identidad anterior sin romper navegación", await accountButton(page).count() === 0, "LOCAL");
  await page.unroute("**/api/account/session");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await accountButton(page).waitFor();
  await page.locator('header.site-header a[href="/contacto"]').click();
  await page.waitForURL(url => url.pathname === "/contacto"); await accountButton(page).waitFor();
  check("identidad se conserva al navegar y se recupera al volver a validar", (await session(context)).account.name === changedName);
  await accountButton(page).click();
  await accountRegion(page).getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/cuenta/ingresar");
  await page.getByRole("link", { name: "Ir a mi cuenta o ingresar" }).waitFor();
  check("cerrar sesión desde navbar elimina identidad y acceso autenticado", (await session(context)).account === null && await accountButton(page).count() === 0);
  check("sin errores JavaScript durante los recorridos", pageErrors.length === 0, "LOCAL");
  console.log(`PASS: ${checks}/${checks}. Solo cuentas ficticias DEV; no se prueba consentimiento Google ni correo Auth.`);
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
  console.log("Retiradas solo las cuentas y fotos efímeras creadas por esta suite; datos existentes conservados.");
}

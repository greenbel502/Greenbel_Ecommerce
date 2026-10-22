/** DEV-only account-password QA. No personal accounts, mail, migrations or public signup. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const origin = new URL(process.argv[2] ?? "http://localhost:3000");
assert.ok(process.argv.slice(3).every(argument => argument === "--remaining"));
const remaining = process.argv.includes("--remaining");
const ref = process.env.SUPABASE_DEV_PROJECT_REF;
const url = process.env.DEV_SUPABASE_URL;
assert.equal(process.env.APP_ENV, "DEV");
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), ref);
assert.ok(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)
  && origin.pathname === "/" && !origin.search && !origin.username && !origin.password);
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled");
const configResponse = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }
});
assert.equal(configResponse.status, 200, "Leer configuración exclusivamente DEV");
const config = await configResponse.json();
assert.equal(config.mailer_autoconfirm, false, "No desactivar confirmación de correo");
assert.equal(config.mailer_notifications_password_changed_enabled, false, "No ejecutar QA si pudiera enviar correo");

const { chromium } = await import(process.env.GREENBEL_QA_PLAYWRIGHT_MODULE || "playwright");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, process.env.DEV_SUPABASE_SECRET_KEY, options);
const publicClient = () => createClient(url, process.env.DEV_SUPABASE_PUBLISHABLE_KEY, options);
const password = () => `${randomBytes(24).toString("base64url")}Aa1!`;
const users = [];
let browser;
let checks = 0;
const check = (name, condition, scope = "DEV") => {
  assert.ok(condition, name); checks++; console.log(`PASS ${scope}: ${name}`);
};
async function user(label, withPassword) {
  const fixture = { email: `qa-password-${label.toLowerCase()}-${randomUUID()}@example.invalid`, password: withPassword ? password() : undefined };
  const result = await admin.auth.admin.createUser({ email: fixture.email, ...(withPassword ? { password: fixture.password } : {}),
    email_confirm: true, user_metadata: { full_name: `PRUEBA DEV Contraseña ${label}` } });
  assert.ok(!result.error && result.data.user, "Crear solo una cuenta ficticia DEV sin correo");
  fixture.id = result.data.user.id; fixture.updatedAt = result.data.user.updated_at; users.push(fixture); return fixture;
}
async function canLogin(fixture, secret) {
  const client = publicClient();
  const result = await client.auth.signInWithPassword({ email: fixture.email, password: secret });
  const valid = !result.error && result.data.user?.id === fixture.id;
  if (valid) await client.auth.signOut({ scope: "local" });
  return valid;
}
const securityForm = page => page.getByRole("form", { name: "Guardar contraseña de mi cuenta", exact: true });
async function openSettings(page) {
  const button = page.getByRole("button", { name: /^Contraseña / });
  await button.waitFor();
  if (await button.getAttribute("aria-expanded") !== "true") await button.click();
  await securityForm(page).waitFor();
}
async function fill(page, first, second = first) {
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(first);
  await page.getByLabel("Confirmar contraseña", { exact: true }).fill(second);
}
async function submit(page) {
  const response = page.waitForResponse(result => result.request().method() === "POST"
    && new URL(result.url()).pathname === "/cuenta");
  await securityForm(page).getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  const result = await response;
  assert.ok(result.status() < 500, "La acción no debe fallar con un error de servidor");
}
async function serverFeedback(page, message) {
  // Read the rendered server feedback, separately from the nested client-side mismatch alert.
  await securityForm(page).locator(':scope > p[role="alert"], :scope > p[role="status"]').filter({ hasText: message }).waitFor();
}
async function success(page) {
  await securityForm(page).getByRole("status").filter({ hasText: "Contraseña guardada." }).waitFor();
}
try {
  const a = await user("A", true), b = await user("B", false);
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.GREENBEL_QA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error));
  await page.goto(new URL("/cuenta/ingresar", origin).toString());
  await page.getByLabel("Correo electrónico", { exact: true }).fill(a.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await page.waitForURL(target => target.pathname === "/cuenta");
  await openSettings(page);
  let currentA = a.password;
  if (!remaining) {
  check("contraseña integrada en Mi cuenta con correo de la sesión", await page.locator("#seguridad").innerText().then(text => text.includes(a.email)));
  check("sin texto técnico de Supabase Auth en la vista", !(await page.locator("main").innerText()).includes("Supabase Auth"), "LOCAL");
  // A server-component redirect can arrive in streamed HTML; verify the browser destination.
  await page.goto(new URL("/cuenta/restablecer", origin).toString());
  await page.waitForURL(target => target.pathname === "/cuenta" && target.hash === "#seguridad");
  await securityForm(page).waitFor();
  check("ruta anterior redirige a la configuración de la misma cuenta", true);
  await page.getByRole("button", { name: /^Contraseña / }).click();
  await openSettings(page);
  check("opción Contraseña abre la configuración en la misma vista", new URL(page.url()).hash === "#seguridad", "LOCAL");

  const nextA = password();
  await fill(page, nextA, password());
  await page.waitForFunction(() => document.querySelector('input[name="passwordConfirmation"]').validity.customError);
  let posts = 0;
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/cuenta") posts++; });
  await securityForm(page).getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  check("contraseñas diferentes bloquean el formulario antes del servidor", posts === 0 && await securityForm(page).getByRole("alert").count() === 1, "LOCAL");
  await page.getByRole("button", { name: "Mostrar contraseña", exact: true }).click();
  check("ojo de nueva contraseña independiente", await page.getByLabel("Nueva contraseña", { exact: true }).getAttribute("type") === "text"
    && await page.getByLabel("Confirmar contraseña", { exact: true }).getAttribute("type") === "password", "LOCAL");
  await page.getByRole("button", { name: "Mostrar confirmación de contraseña", exact: true }).click();
  check("ojo de confirmación permite verla", await page.getByLabel("Confirmar contraseña", { exact: true }).getAttribute("type") === "text", "LOCAL");
  await page.getByRole("button", { name: "Ocultar contraseña", exact: true }).click();
  await page.getByRole("button", { name: "Ocultar confirmación de contraseña", exact: true }).click();
  await securityForm(page).evaluate(form => { form.noValidate = true; });
  await submit(page); await serverFeedback(page, "Las contraseñas no coinciden.");
  check("servidor rechaza diferencias aunque se omita validación del navegador", await canLogin(a, a.password));
  await fill(page, "corta", "corta");
  await submit(page); await serverFeedback(page, "Usa una contraseña de 8 a 128 caracteres.");
  check("servidor rechaza contraseña corta", await canLogin(a, a.password));
  await fill(page, nextA);
  await securityForm(page).evaluate((form, target) => {
    for (const [name, value] of Object.entries(target)) {
      const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; form.append(input);
    }
  }, { userId: b.id, email: b.email });
  await submit(page); await success(page);
  currentA = nextA;
  check("guardado real conserva Mi cuenta y limpia las dos contraseñas", new URL(page.url()).pathname === "/cuenta"
    && await page.getByLabel("Nueva contraseña", { exact: true }).inputValue() === ""
    && await page.getByLabel("Confirmar contraseña", { exact: true }).inputValue() === "");
  check("correo más contraseña nueva ingresa en el mismo usuario y la anterior falla", await canLogin(a, nextA) && !await canLogin(a, a.password));
  const bBefore = await admin.auth.admin.getUserById(b.id);
  check("UUID/correo inyectados no modifican otra cuenta", !bBefore.error && bBefore.data.user?.updated_at === b.updatedAt);
  await fill(page, nextA);
  await submit(page); await serverFeedback(page, "Elige una contraseña diferente a la que ya usas.");
  check("contraseña repetida devuelve error honesto sin éxito", await securityForm(page).getByRole("status").count() === 0);
  await page.reload(); await openSettings(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.getByLabel("Nueva contraseña", { exact: true }).fill("");
    await page.getByLabel("Confirmar contraseña", { exact: true }).fill("");
    check(`configuración a ${width}px sin overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "LOCAL");
    await page.locator("#seguridad").screenshot({ path: `/tmp/greenbel-account-password-${width}.png` });
  }

  // Provision a session for a confirmed account without password. No email and no fake Google identity.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: b.email });
  assert.ok(!link.error && link.data.properties?.hashed_token, "Generar sesión de fixture sin enviar correo");
  const seeded = publicClient();
  const verified = await seeded.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  assert.ok(!verified.error && verified.data.session, "Sesión administrativa de prueba; no registro público ni Google");
  const jar = new Map();
  const ssr = createServerClient(url, process.env.DEV_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: cookies => cookies.forEach(cookie => jar.set(cookie.name, cookie.value)) }
  });
  assert.ok(!(await ssr.auth.setSession(verified.data.session)).error);
  const other = await browser.newContext();
  await other.addCookies([...jar].map(([name, value]) => ({ name, value, url: origin.toString(), httpOnly: true, sameSite: "Lax" })));
  const otherPage = await other.newPage();
  otherPage.on("pageerror", error => errors.push(error));
  await otherPage.goto(new URL("/cuenta", origin).toString()); await openSettings(otherPage);
  const firstB = password(); await fill(otherPage, firstB);
  await submit(otherPage); await success(otherPage);
  check("cuenta sin contraseña puede configurarla e ingresar por correo con el mismo ID", await canLogin(b, firstB));
  for (const fixture of [a, b]) {
    const role = await admin.from("user_roles").select("role").eq("user_id", fixture.id).single();
    const profile = await admin.from("profiles").select("id,active").eq("id", fixture.id).single();
    check(`perfil y rol customer conservados en cuenta ${fixture === a ? "A" : "B"}`,
      !role.error && role.data.role === "customer" && !profile.error && profile.data.id === fixture.id && profile.data.active);
  }
  assert.ok(!(await admin.from("profiles").update({ active: false }).eq("id", b.id)).error);
  await fill(otherPage, password());
  await submit(otherPage);
  await otherPage.getByRole("alert").filter({ hasText: "Esta cuenta no está habilitada." }).waitFor();
  check("sesión con perfil inactivo no cambia contraseña", await canLogin(b, firstB));
  }
  await context.clearCookies(); await fill(page, password());
  await submit(page); await serverFeedback(page, "Tu sesión venció.");
  check("sesión ausente no cambia contraseña", await canLogin(a, currentA));
  const guest = await browser.newPage(); guest.on("pageerror", error => errors.push(error));
  await guest.goto(new URL("/cuenta/registro", origin).toString());
  const registerForm = guest.locator("form").filter({ has: guest.getByRole("button", { name: "Crear cuenta", exact: true }) });
  await guest.getByLabel("Contraseña", { exact: true }).fill(password());
  await guest.getByLabel("Confirmar contraseña", { exact: true }).fill(password());
  await registerForm.getByRole("alert").waitFor();
  check("registro reutiliza ojos y validación sin registrar ni enviar correo", await guest.getByRole("button", { name: "Mostrar contraseña", exact: true }).count() === 1
    && await guest.getByRole("button", { name: "Mostrar confirmación de contraseña", exact: true }).count() === 1
    && await registerForm.getByRole("alert").count() === 1, "LOCAL");
  check("sin errores JavaScript en el recorrido", errors.length === 0, "LOCAL");
  console.log(`PASS: ${checks}/${checks}. NO EJECUTADO: contraseña de una identidad Google real, confirmación/recuperación SMTP.`);
} catch (error) {
  console.error(`FAIL: ${error.message.split("\n")[0]}`); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const fixture of users.reverse()) {
    assert.ok(!(await admin.from("user_roles").delete().eq("user_id", fixture.id)).error);
    assert.ok(!(await admin.from("profiles").delete().eq("id", fixture.id)).error);
    assert.ok(!(await admin.auth.admin.deleteUser(fixture.id)).error);
  }
  console.log("Retiradas exclusivamente las cuentas ficticias de esta suite; datos anteriores conservados.");
}

/** HTTP integration against a local Auth fixture. Never reads .env or uses Supabase DEV/PROD. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";

assert.ok(process.argv.slice(2).every(arg => arg === "--production"), "Only --production is supported");
const production = process.argv.includes("--production");
const userId = "b1000000-0000-4000-8000-000000000010";
const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa-google-local@example.invalid",
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { role: "admin", active: true }, identities: [], created_at: new Date().toISOString() };
const accessToken = ["local", Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"), "local"].join(".");
let mode = "customer";
let challenge;
let consumed = false;
let exchangeCount = 0;
let logoutCount = 0;
const fixture = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  response.setHeader("Content-Type", "application/json");
  if (url.pathname === "/auth/v1/token") {
    exchangeCount++;
    let body = "";
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body);
    if (consumed || parsed.auth_code !== "local-once" || typeof parsed.code_verifier !== "string"
      || createHash("sha256").update(parsed.code_verifier).digest("base64url") !== challenge) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error_code: "bad_code_verifier", msg: "LOCAL_QA_PRIVATE_ERROR" }));
      return;
    }
    consumed = true;
    response.end(JSON.stringify({ access_token: accessToken, refresh_token: "local-refresh", token_type: "bearer", expires_in: 3600, user }));
  } else if (url.pathname === "/auth/v1/user") {
    response.end(JSON.stringify(user));
  } else if (url.pathname === "/auth/v1/logout") {
    logoutCount++;
    response.statusCode = 204;
    response.end();
  } else if (url.pathname === "/rest/v1/profiles") {
    response.end(JSON.stringify(mode === "missing-profile" ? [] : [{ id: userId, display_name: "PRUEBA LOCAL", phone: null, address_line: null, avatar_path: null, updated_at: "2026-10-13T12:00:00.000000+00:00", active: mode !== "inactive" }]));
  } else if (url.pathname === "/rest/v1/user_roles") {
    if (mode === "database-outage") {
      response.statusCode = 503;
      response.end(JSON.stringify({ message: "LOCAL_QA_PRIVATE_ERROR" }));
    } else {
      response.end(JSON.stringify(mode === "missing-role" ? [] : [{ role: mode === "admin" ? "admin" : "customer" }]));
    }
  } else {
    response.end("[]");
  }
});
await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
const probe = createServer();
await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const appPort = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const appOrigin = `http://127.0.0.1:${appPort}`;
const directory = mkdtempSync(join(tmpdir(), "greenbel-google-qa-"));
const appDirectory = join(directory, "app");
mkdirSync(appDirectory);
cpSync("src", join(appDirectory, "src"), { recursive: true });
for (const name of ["public", "node_modules"]) symlinkSync(join(process.cwd(), name), join(appDirectory, name), "dir");
for (const name of ["package.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", "postcss.config.mjs", "eslint.config.mjs"]) copyFileSync(name, join(appDirectory, name));
const environment = { ...process.env, APP_ENV: "DEV", GREENBEL_CATALOG_SOURCE: "supabase",
  DEV_APP_URL: appOrigin, DEV_SUPABASE_URL: fixtureOrigin, DEV_SUPABASE_PUBLISHABLE_KEY: "local-qa-key",
  DEV_SUPABASE_SECRET_KEY: "", PROD_SUPABASE_URL: "", PROD_SUPABASE_PUBLISHABLE_KEY: "", PROD_SUPABASE_SECRET_KEY: "",
  DEV_EMAIL_DELIVERY_MODE: "disabled", PROD_EMAIL_DELIVERY_MODE: "disabled", RESEND_API_KEY: "",
  SUPABASE_ACCESS_TOKEN: "", SUPABASE_DB_PASSWORD: "", SUPABASE_DEV_PROJECT_REF: "",
  NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: production ? "production" : "development" };
const nextPath = new URL("../node_modules/next/dist/server/next.js", import.meta.url).pathname;
const nextCli = new URL("../node_modules/next/dist/bin/next", import.meta.url).pathname;
const runner = join(directory, "server.mjs");
writeFileSync(runner, `import next from ${JSON.stringify(nextPath)};
import { createServer } from 'node:http';
const app=next({dev:${!production},dir:process.cwd(),hostname:'127.0.0.1',port:${appPort},conf:{devIndicators:false}});
await app.prepare();
createServer(app.getRequestHandler()).listen(${appPort},'127.0.0.1',()=>console.log('QA_APP_READY'));
`);
let child;
let log = "";
let checks = 0;
const check = (name, condition) => { assert.ok(condition, name); checks++; console.log(`PASS LOCAL: ${name}`); };

async function authorizationCookies() {
  const jar = new Map();
  const client = createServerClient(fixtureOrigin, "local-qa-key", { cookieOptions: { httpOnly: true, sameSite: "lax", secure: false, path: "/" },
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: cookies => cookies.forEach(({ name, value }) => jar.set(name, value)) } });
  const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${appOrigin}/auth/callback`, skipBrowserRedirect: true } });
  assert.equal(error, null);
  const target = new URL(data.url);
  challenge = target.searchParams.get("code_challenge");
  consumed = false;
  assert.equal(target.searchParams.get("code_challenge_method"), "s256");
  return [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
}
async function callback(query = "", cookies = "") {
  const response = await fetch(`${appOrigin}/auth/callback${query}`, {
    redirect: "manual", headers: { Cookie: cookies }, signal: AbortSignal.timeout(60_000)
  });
  assert.equal(response.status, 303);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("x-robots-tag"), "noindex");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  return response;
}
try {
  if (production) {
    await new Promise((resolve, reject) => {
      const build = spawn(process.execPath, [nextCli, "build"], { cwd: appDirectory, env: environment, stdio: ["ignore", "pipe", "pipe"] });
      build.stdout.on("data", chunk => { log = (log + chunk).slice(-20000); });
      build.stderr.on("data", chunk => { log = (log + chunk).slice(-20000); });
      build.on("error", reject);
      build.on("exit", code => code === 0 ? resolve() : reject(new Error(`Build: ${log}`)));
    });
    check("build optimizado aislado sin credenciales remotas", true);
  }
  log = "";
  child = spawn(process.execPath, [runner], { cwd: appDirectory, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", chunk => { log = (log + chunk).slice(-20000); });
  child.stderr.on("data", chunk => { log = (log + chunk).slice(-20000); });
  const deadline = Date.now() + 60_000;
  while (!log.includes("QA_APP_READY")) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Server: ${log}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  check("callback sin código no abre sesión", (await callback()).headers.get("location") === "/cuenta/ingresar?error=google" && exchangeCount === 0);
  check("cancelación conserva checkout sin intercambiar código", (await callback("?error=access_denied&code=ignored&next=%2Fcheckout")).headers.get("location") === "/cuenta/ingresar?error=google&next=%2Fcheckout" && exchangeCount === 0);
  check("código sin verificador del navegador es rechazado", (await callback("?code=local-once")).headers.get("location").startsWith("/cuenta/ingresar?error=google"));
  let jar = await authorizationCookies();
  const success = await callback("?code=local-once&next=%2Fcheckout", jar);
  check("PKCE válido abre sesión y vuelve a checkout", success.headers.get("location") === "/checkout");
  const sessionCookies = success.headers.getSetCookie().filter(cookie => !cookie.includes("code-verifier") && !cookie.includes("Max-Age=0"));
  check("cookies de sesión HttpOnly/SameSite=Lax y código fuera del destino", sessionCookies.length > 0 && sessionCookies.every(cookie => /HttpOnly/i.test(cookie) && /SameSite=lax/i.test(cookie)));
  check("el mismo código no abre una segunda sesión", (await callback("?code=local-once", jar)).headers.get("location").startsWith("/cuenta/ingresar?error=google"));
  jar = await authorizationCookies();
  check("destino externo se reduce a Mi cuenta", (await callback("?code=local-once&next=https://attacker.example", jar)).headers.get("location") === "/cuenta");
  for (const nextMode of ["inactive", "missing-profile", "missing-role", "database-outage"]) {
    mode = nextMode;
    jar = await authorizationCookies();
    const before = logoutCount;
    check(`${mode}: sesión rechazada y cerrada`, (await callback("?code=local-once", jar)).headers.get("location") === "/cuenta/ingresar?error=google_cuenta" && logoutCount === before + 1);
  }
  mode = "customer";
  jar = await authorizationCookies();
  const customer = await callback("?code=local-once", jar);
  const customerCookie = customer.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const accountResponse = await fetch(`${appOrigin}/cuenta`, { headers: { Cookie: customerCookie } });
  const account = (await accountResponse.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  check("metadata admin de Google no muestra panel al customer", account.includes("Mis datos") && !account.includes("Panel administrativo"));
  // Check the actual mutation gate; a streamed not-found page can start with HTTP 200.
  const adminResponse = await fetch(`${appOrigin}/api/admin/product-images`, {
    method: "POST", headers: { Cookie: customerCookie, Origin: appOrigin }, body: new FormData()
  });
  check("customer con metadata admin no puede subir imágenes (HTTP 403)",
    adminResponse.status === 403 && (await adminResponse.json()).error === "No se pudo verificar el permiso de catálogo.");
  mode = "admin";
  jar = await authorizationCookies();
  check("el acceso conserva un rol admin previamente asignado en DB", (await callback("?code=local-once", jar)).headers.get("location") === "/cuenta");
  console.log(`PASS LOCAL: ${checks}/${checks}. NO EJECUTADO por esta suite: consentimiento Google real ni RLS remoto.`);
} catch (error) {
  console.error(`FAIL LOCAL: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise(resolve => child.once("exit", resolve));
  }
  await new Promise(resolve => fixture.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}

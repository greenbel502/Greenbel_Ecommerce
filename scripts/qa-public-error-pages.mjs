/** Local HTTP fixture: never uses or changes Supabase DEV/PROD. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
assert.ok(args.every((arg) => ["--serve", "--production"].includes(arg))
  && args.length === new Set(args).size,
"Use --serve for browser QA and/or --production for an isolated optimized build");
const serve = args.includes("--serve");
const production = args.includes("--production");
let mode = "outage";
let requestCount = 0;
const productId = "b1000000-0000-4000-8000-000000000001";
const product = { id: productId, sku: "QA-ERROR-LOCAL", slug: "prueba-error-local",
  name: "PRUEBA LOCAL recuperación catálogo", kind: "equipment", model: "QA",
  category_name: "PRUEBA LOCAL", brand_name: "PRUEBA LOCAL",
  short_description: "Fixture local; no representa datos de Supabase.", description: null,
  regular_price: "60.00", effective_price: "60.00", warranty_months: null, featured: true };
const stub = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/__qa/mode") {
    const nextMode = url.searchParams.get("value");
    if (["outage", "healthy", "details-outage", "invalid-price"].includes(nextMode)) mode = nextMode;
    response.end(mode);
    return;
  }
  requestCount++;
  response.setHeader("Content-Type", "application/json");
  if (mode === "outage" || mode === "details-outage" && !url.pathname.endsWith("catalog_products")) {
    response.statusCode = 503;
    response.end(JSON.stringify({ code: "LOCAL_QA_OUTAGE", message: "PRIVATE_QA_DETAIL_MUST_NOT_RENDER" }));
    return;
  }
  if (url.pathname.endsWith("catalog_products")) {
    const slug = url.searchParams.get("slug");
    const found = !slug || slug === `eq.${product.slug}`;
    const row = { ...product, regular_price: mode === "invalid-price" ? "invalid" : "60.00" };
    response.end(JSON.stringify(slug ? (found ? row : null) : [row]));
  } else if (url.pathname.endsWith("product_availability")) {
    response.end(JSON.stringify([{ product_id: productId, verified: true, available: true }]));
  } else {
    const single = (request.headers.accept ?? "").includes("vnd.pgrst.object");
    response.end(JSON.stringify(single ? null : []));
  }
});
await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
const stubOrigin = `http://127.0.0.1:${stub.address().port}`;
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const appPort = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const appOrigin = `http://127.0.0.1:${appPort}`;
const directory = mkdtempSync(join(tmpdir(), "greenbel-public-errors-"));
const appDirectory = join(directory, "app");
mkdirSync(appDirectory);
// Isolate Next's generated files from an already running developer server.
cpSync(join(process.cwd(), "src"), join(appDirectory, "src"), { recursive: true });
for (const name of ["public", "node_modules"]) {
  symlinkSync(join(process.cwd(), name), join(appDirectory, name), "dir");
}
for (const name of ["package.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", "postcss.config.mjs", "eslint.config.mjs"]) {
  copyFileSync(join(process.cwd(), name), join(appDirectory, name));
}
const nextPath = new URL("../node_modules/next/dist/server/next.js", import.meta.url).pathname;
const runner = join(directory, "server.mjs");
writeFileSync(runner, `import next from ${JSON.stringify(nextPath)};
import { createServer } from 'node:http';
const app = next({dev:${!production},dir:process.cwd(),hostname:'127.0.0.1',port:${appPort},
  conf:{devIndicators:false}});
await app.prepare();
const server = createServer(app.getRequestHandler());
server.listen(${appPort},'127.0.0.1',()=>console.log('QA_APP_READY'));
`, { mode: 0o600 });
const environment = { ...process.env, APP_ENV: "DEV", GREENBEL_CATALOG_SOURCE: "supabase",
  DEV_APP_URL: appOrigin, DEV_SUPABASE_URL: stubOrigin,
  DEV_SUPABASE_PUBLISHABLE_KEY: "qa-local-publishable-key", DEV_SUPABASE_SECRET_KEY: "",
  PROD_SUPABASE_URL: "", PROD_SUPABASE_PUBLISHABLE_KEY: "", PROD_SUPABASE_SECRET_KEY: "",
  DEV_EMAIL_DELIVERY_MODE: "disabled", PROD_EMAIL_DELIVERY_MODE: "disabled", RESEND_API_KEY: "",
  SUPABASE_ACCESS_TOKEN: "", SUPABASE_DB_PASSWORD: "", SUPABASE_DEV_PROJECT_REF: "",
  NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: production ? "production" : "development" };
if (production) {
  const nextCli = new URL("../node_modules/next/dist/bin/next", import.meta.url).pathname;
  await new Promise((resolve, reject) => {
    const build = spawn(process.execPath, [nextCli, "build"], { cwd: appDirectory, env: environment,
      stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    build.stdout.on("data", (chunk) => { output = (output + chunk).slice(-16_000); });
    build.stderr.on("data", (chunk) => { output = (output + chunk).slice(-16_000); });
    build.on("error", reject);
    build.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Build failed: ${output}`)));
  }).catch((error) => {
    stub.close();
    rmSync(directory, { recursive: true, force: true });
    throw error;
  });
  console.log("PASS: build optimizado aislado, con APP_ENV=DEV y fixture local.");
}
const child = spawn(process.execPath, [runner], { cwd: appDirectory, env: environment,
  stdio: ["ignore", "pipe", "pipe"] });
let log = "";
let stopped = false;
child.stdout.on("data", (chunk) => { log = (log + chunk).slice(-16_000); });
child.stderr.on("data", (chunk) => { log = (log + chunk).slice(-16_000); });
async function stop() {
  if (stopped) return;
  stopped = true;
  child.kill("SIGTERM");
  await new Promise((resolve) => stub.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { void stop(); });
let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log(`PASS: ${name}`);
}
async function page(path) {
  const response = await fetch(new URL(path, appOrigin), { signal: AbortSignal.timeout(60_000) });
  const raw = await response.text();
  // Next serializes unused not-found boundaries in RSC scripts too. Check the
  // rendered markup rather than mistaking that payload for a visible 404.
  const html = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  // React's developer payload includes async debug values. Optimized builds
  // must not serialize upstream error details, even inside RSC scripts.
  assert.ok(!(production ? raw : html).includes("PRIVATE_QA_DETAIL_MUST_NOT_RENDER"),
    "Private upstream detail must stay hidden");
  return { response, html };
}
try {
  const deadline = Date.now() + 50_000;
  while (!log.includes("QA_APP_READY")) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Local server did not start: ${log}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.log(`PRUEBA LOCAL: aplicación ${appOrigin}; fixture ${stubOrigin}; modo outage.`);
  if (serve) {
    console.log(`Cambiar disponibilidad: ${stubOrigin}/__qa/mode?value=healthy (outage|healthy|invalid-price).`);
    console.log("Sin consultas a Supabase ni escrituras en datos. Ctrl-C termina ambos servidores.");
    await new Promise((resolve) => child.on("exit", resolve));
  } else {
    for (const path of ["/", "/productos", "/productos/prueba-error-local", "/capacitaciones", "/capacitaciones/prueba-error-local"]) {
      const { response, html } = await page(path);
      check(`${path}: caída muestra aviso y reintento sin 404 ni detalle privado`, response.status !== 404
        && html.includes("Servicio temporalmente no disponible") && html.includes("Reintentar")
        && !html.includes("PRIVATE_QA_DETAIL_MUST_NOT_RENDER") && !html.includes("Error 404"));
    }
    mode = "details-outage";
    check("fallo de detalles del catálogo también muestra indisponibilidad",
      (await page("/productos")).html.includes("Servicio temporalmente no disponible"));
    mode = "healthy";
    const recovered = await page("/productos");
    check("el catálogo se recupera al restaurar el servicio", recovered.html.includes(product.name)
      && !recovered.html.includes("Servicio temporalmente no disponible"));
    const missingProduct = await page("/productos/no-existe-qa");
    check("producto ausente activa not-found, sin mensaje de caída", missingProduct.html.includes("Producto no encontrado")
      && missingProduct.html.includes('name="robots" content="noindex"')
      && !missingProduct.html.includes("Servicio temporalmente no disponible"));
    const missingPage = await page("/pagina-inexistente-qa");
    check("ruta inexistente devuelve HTTP 404 de GreenBel", missingPage.response.status === 404
      && missingPage.html.includes("No encontramos esta página"));
    const training = await page("/capacitaciones");
    check("biblioteca vacía válida conserva su estado vacío", training.html.includes("Aún no hay videos")
      && !training.html.includes("Servicio temporalmente no disponible"));
    check("solo se usó fixture HTTP local", requestCount > 0);
    console.log(`PASS: HTTP local ${checks}/${checks}; sin consultas o cambios en Supabase.`);
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  console.error(log);
  process.exitCode = 1;
} finally {
  await stop();
}

/** Real DEV QA: synthetic accounts only. Never uses a personal login or sends mail. */
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
const origin = process.argv[2] || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const ref = process.env.SUPABASE_DEV_PROJECT_REF,
  url = process.env.DEV_SUPABASE_URL;
assert.equal(process.env.APP_ENV, "DEV");
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), ref);
assert.ok(
  !process.env.DEV_EMAIL_DELIVERY_MODE ||
    process.env.DEV_EMAIL_DELIVERY_MODE === "disabled",
);
const { chromium } = await import(
  process.env.GREENBEL_QA_PLAYWRIGHT_MODULE || "playwright"
);
const opts = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const db = createClient(url, process.env.DEV_SUPABASE_SECRET_KEY, opts),
  anon = createClient(url, process.env.DEV_SUPABASE_PUBLISHABLE_KEY, opts);
const tag = randomUUID().slice(0, 8),
  mark = `PRUEBA DEV adminui ${tag}`,
  fixtures = [],
  results = [];
let browser;
const check = (label, ok, scope = "DEV") => {
  assert.ok(ok, label);
  results.push({ label, scope });
  console.log(`PASS ${scope}: ${label}`);
};
const need = (r, label) => {
  assert.ok(!r.error && r.data, label);
  return r.data;
};
async function account(label, role = "customer") {
  const email = `qa-adminui-${tag}-${label}@example.invalid`,
    password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const user = need(
    await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { qa_marker: mark },
    }),
    "crear solo cuenta sintética",
  ).user;
  fixtures.push(user.id);
  need(
    await db
      .from("profiles")
      .update({ display_name: `${mark} ${label}` })
      .eq("id", user.id)
      .select("id")
      .single(),
    "nombrar fixture",
  );
  if (role !== "customer")
    need(
      await db
        .from("user_roles")
        .update({ role })
        .eq("user_id", user.id)
        .select("user_id")
        .single(),
      "rol de fixture",
    );
  const jar = new Map();
  const client = createServerClient(
    url,
    process.env.DEV_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (c) => c.forEach((i) => jar.set(i.name, i.value)),
      },
    },
  );
  need(
    await client.auth.signInWithPassword({ email, password }),
    "sesión sintética DEV",
  );
  return { id: user.id, email, client, jar };
}
async function sessionContext(fixture) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies(
    [...fixture.jar].map(([name, value]) => ({
      name,
      value,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    })),
  );
  return context;
}
const roleOf = async (id) =>
  need(
    await db.from("user_roles").select("role").eq("user_id", id).single(),
    "leer rol sintético",
  ).role;
try {
  const admin = await account("admin", "admin"),
    operator = await account("operator", "operator"),
    customer = await account("customer"),
    target = await account("target");
  if (
    !process.argv.includes("--remaining") &&
    !process.argv.includes("--navigation-only")
  ) {
    const args = {
      p_search: "",
      p_role: "",
      p_active: null,
      p_sort: "created_at",
      p_direction: "desc",
      p_page: 1,
      p_size: 10,
    };
    for (const [label, client] of [
      ["anónimo", anon],
      ["cliente", customer.client],
      ["operador", operator.client],
    ])
      check(
        `directorio privado denegado a ${label}`,
        !!(await client.rpc("admin_list_users", args)).error,
      );
    const directory = need(
      await admin.client.rpc("admin_list_users", { ...args, p_search: tag }),
      "directorio administrador",
    );
    check(
      "búsqueda por correo/nombre devuelve solo las cuatro cuentas sintéticas",
      directory.rows.length === 4 &&
        directory.rows.every((r) => fixtures.includes(r.id)),
    );
    check(
      "correo exacto se busca en base",
      need(
        await admin.client.rpc("admin_list_users", {
          ...args,
          p_search: target.email,
        }),
        "buscar correo",
      ).rows.length === 1,
    );
    const last = need(
      await admin.client.rpc("admin_list_users", { ...args, p_page: 100000 }),
      "clamp",
    );
    check(
      "página fuera de rango se corrige en base",
      last.page === Math.ceil(last.total / 10) && last.rows.length <= 10,
    );
    const asc = need(
      await admin.client.rpc("admin_list_users", {
        ...args,
        p_search: tag,
        p_sort: "email",
        p_direction: "asc",
      }),
      "orden",
    );
    check(
      "orden por correo aplicado en base",
      asc.rows.map((r) => r.email).join() ===
        asc.rows
          .map((r) => r.email)
          .sort()
          .join(),
    );
    check(
      "filtro de rol en base",
      need(
        await admin.client.rpc("admin_list_users", {
          ...args,
          p_search: tag,
          p_role: "operator",
        }),
        "filtro",
      ).rows.length === 1,
    );
    check(
      "tamaño y orden ajenos a la lista permitida rechazados",
      !!(
        await admin.client.rpc("admin_list_users", {
          ...args,
          p_size: 10000,
          p_sort: "password",
        })
      ).error,
    );
    check(
      "búsqueda literal con comodines no amplía resultados",
      need(
        await admin.client.rpc("admin_list_users", {
          ...args,
          p_search: "%_unmatched_",
        }),
        "escape",
      ).rows.length === 0,
    );
    const self = await admin.client.rpc("set_user_access", {
      p_user_id: admin.id,
      p_role: "customer",
      p_active: true,
      p_expected_role: "admin",
      p_expected_active: true,
    });
    check(
      "servidor conserva el acceso propio de administrador",
      !!self.error && (await roleOf(admin.id)) === "admin",
    );
  }
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.GREENBEL_QA_CHROME ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const context = await sessionContext(admin),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const routes = [
    "",
    "catalogo",
    "inventario",
    "ventas",
    "envios",
    "cotizaciones",
    "capacitaciones",
    "resenas",
    "consultas",
    "financiamiento",
    "entregas",
    "usuarios",
  ];
  for (const route of process.argv.includes("--remaining") ||
  process.argv.includes("--navigation-only")
    ? []
    : routes) {
    await page.goto(`${origin}/admin${route ? `/${route}` : ""}`, {
      waitUntil: "networkidle",
    });
    const body = await page.locator("body").innerText();
    check(
      `ruta /admin${route ? `/${route}` : ""}: layout privado y carga`,
      (await page.locator(".admin-app").count()) === 1 &&
        !/No se pudo cargar|no est[aá]n disponibles|no est[aá] disponible|No se pudieron consultar/.test(
          body,
        ),
    );
    check(
      `ruta ${route || "inicio"}: sin elementos públicos ni proveedor visible`,
      (await page
        .locator(".site-header,.footer,.virtual-assistant")
        .count()) === 0 && !/supabase/i.test(body),
      "LOCAL",
    );
  }
  await page.goto(`${origin}/admin/ventas`, { waitUntil: "networkidle" });
  const firstOrder = page.locator('a[href^="/admin/ventas/"]').first();
  if (await firstOrder.count()) {
    await firstOrder.click();
    await page.waitForURL((u) => /\/admin\/ventas\/[^/]+/.test(u.pathname));
    await page
      .getByRole("heading", { name: "Productos del pedido" })
      .waitFor({ timeout: 30000 });
    check(
      "detalle de pedido y operaciones existentes cargan",
      (await page
        .getByRole("heading", { name: "Productos del pedido" })
        .count()) === 1,
    );
  }
  await page.goto(`${origin}/admin/usuarios?q=${tag}`, {
    waitUntil: "networkidle",
  });
  await page.reload({ waitUntil: "networkidle" });
  check(
    "acceso directo y recarga conservan búsqueda",
    (await page.locator("tbody tr").count()) === 4 &&
      new URL(page.url()).searchParams.get("q") === tag,
  );
  mkdirSync("/tmp/greenbel-admin-redesign", { recursive: true });
  await page.screenshot({
    path: "/tmp/greenbel-admin-redesign/usuarios-1440.png",
    fullPage: true,
  });
  if (!process.argv.includes("--navigation-only")) {
    const targetRow = page
      .locator("tbody tr")
      .filter({ hasText: target.email });
    await targetRow.getByRole("button", { name: /Editar acceso/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Rol", { exact: true }).selectOption("operator");
    await dialog.getByRole("button", { name: "Revisar cambio" }).click();
    check(
      "cambio de permisos exige revisión previa",
      (await roleOf(target.id)) === "customer",
    );
    let mutation;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/admin/usuarios"
      )
        mutation = request;
    });
    await dialog.getByRole("button", { name: "Confirmar cambio" }).click();
    await page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Los cambios se guardaron correctamente." })
      .first()
      .waitFor();
    await page.waitForTimeout(500);
    check(
      "cambio de rol desde tabla persiste en DEV",
      (await roleOf(target.id)) === "operator",
    );
    const headers = await mutation.allHeaders(),
      safeHeaders = Object.fromEntries(
        Object.entries(headers).filter(([name]) =>
          [
            "content-type",
            "next-action",
            "next-router-state-tree",
            "accept",
            "origin",
          ].includes(name),
        ),
      );
    const outsider = await sessionContext(customer);
    await outsider.request.post(`${origin}/admin/usuarios`, {
      headers: safeHeaders,
      data: mutation.postDataBuffer(),
    });
    check(
      "POST administrativo reproducido por cliente no cambia permisos",
      (await roleOf(target.id)) === "operator",
    );
    await page.goto(`${origin}/admin/usuarios?q=${tag}`, {
      waitUntil: "networkidle",
    });
    await page
      .locator("tbody tr")
      .filter({ hasText: target.email })
      .getByRole("button", { name: /Editar acceso/ })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Acceso a operaciones")
      .selectOption("false");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Revisar cambio" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar cambio" })
      .click();
    await page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Los cambios se guardaron correctamente." })
      .first()
      .waitFor();
    check(
      "suspensión desde tabla persiste sin borrar cuenta",
      need(
        await db.from("profiles").select("active").eq("id", target.id).single(),
        "activo",
      ).active === false,
    );
  } else {
    need(
      await db
        .from("profiles")
        .update({ active: false })
        .eq("id", target.id)
        .select("id")
        .single(),
      "suspender solo target sintético",
    );
  }
  for (const [label, fixture, allowed] of [
    ["cliente", customer, false],
    ["operador", operator, true],
    ["suspendido", target, false],
  ]) {
    const c = await sessionContext(fixture);
    const p = await c.newPage();
    await p.goto(`${origin}/admin/inventario`, { waitUntil: "networkidle" });
    check(
      `acceso directo de ${label} respeta permisos`,
      (await p
        .getByRole("heading", { name: "Inventario compartido" })
        .count()) >
        0 ===
        allowed,
    );
    const lookup = await c.request.get(
      `${origin}/api/admin/lookup?entity=brands`,
    );
    check(
      `consulta de selección privada denegada a ${label}`,
      lookup.status() === 403,
    );
    await c.close();
  }
  const visitor = await browser.newContext();
  const vp = await visitor.newPage();
  await vp.goto(`${origin}/admin`, { waitUntil: "networkidle" });
  check(
    "visitante redirigido al ingreso",
    new URL(vp.url()).pathname === "/cuenta/ingresar",
  );
  check(
    "endpoint de selección exige sesión",
    (
      await visitor.request.get(`${origin}/api/admin/lookup?entity=products`)
    ).status() === 401,
  );
  await visitor.close();
  await page.goto(
    `${origin}/admin/usuarios?page=2&size=10&sort=email&dir=asc`,
    { waitUntil: "networkidle" },
  );
  check(
    "paginación real limita filas",
    (await page.locator("tbody tr").count()) <= 10,
  );
  const pager = page.getByRole("navigation", { name: "Páginas de usuarios" });
  check(
    "paginación conserva filtros/tamaño/orden",
    (
      await pager.getByRole("link", { name: "Anterior" }).getAttribute("href")
    ).includes("sort=email"),
  );
  await page.goto(`${origin}/admin/usuarios?q=sin-coincidencia-${tag}`, {
    waitUntil: "networkidle",
  });
  check(
    "búsqueda sin resultados tiene estado propio",
    (await page
      .getByRole("heading", { name: "No hay coincidencias" })
      .count()) === 1,
  );
  await page.goto(`${origin}/admin`, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Colapsar menú", exact: true })
    .click();
  check(
    "sidebar colapsable en escritorio",
    (await page.locator(".admin-app.is-collapsed").count()) === 1,
    "LOCAL",
  );
  await page
    .getByRole("button", { name: "Expandir menú", exact: true })
    .click();
  await page.screenshot({
    path: "/tmp/greenbel-admin-redesign/inicio-1440.png",
    fullPage: true,
  });
  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${origin}/admin/usuarios?q=${tag}`, {
      waitUntil: "networkidle",
    });
    check(
      `sin desbordamiento de página a ${width}px`,
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "LOCAL",
    );
    if (width === 390) {
      await page
        .getByRole("button", { name: "Abrir menú", exact: true })
        .click();
      check(
        "menú móvil abre y marca sección activa",
        (await page
          .getByRole("dialog", { name: "Navegación de administración" })
          .getByRole("link", { name: "Usuarios", exact: true })
          .getAttribute("aria-current")) === "page",
        "LOCAL",
      );
      await page.keyboard.press("Escape");
      check(
        "Escape cierra menú móvil y devuelve foco",
        await page
          .getByRole("button", { name: "Abrir menú", exact: true })
          .evaluate((e) => e === document.activeElement),
        "LOCAL",
      );
      await page.screenshot({
        path: "/tmp/greenbel-admin-redesign/usuarios-390.png",
        fullPage: true,
      });
    }
  }
  check(
    "sin errores JavaScript durante el recorrido",
    errors.length === 0,
    "LOCAL",
  );
  writeFileSync(
    "/tmp/greenbel-admin-redesign/results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    `PASS: ${results.length} comprobaciones; capturas sin cuentas personales en /tmp/greenbel-admin-redesign.`,
  );
} catch (error) {
  if (browser) {
    for (const c of browser.contexts())
      for (const p of c.pages()) {
        try {
          console.log(
            "QA diagnóstico seguro",
            JSON.stringify(
              await p.evaluate(() => ({
                dialogs: [...document.querySelectorAll("dialog")].map((d) => ({
                  open: d.open,
                  heading: d.querySelector("h2")?.textContent,
                  selects: [...d.querySelectorAll("select")].map((s) => ({
                    name: s.name,
                    label: s.labels?.[0]?.textContent,
                  })),
                })),
                buttons: [
                  ...document.querySelectorAll("dialog[open] button"),
                ].map((b) => b.textContent),
              })),
            ),
          );
        } catch {
          console.log("Diagnóstico omitido: página navegando.");
        }
      }
  }
  console.error(
    `FAIL QA: ${error.name}: ${String(error.message).split("\n")[0]}`,
  );
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const id of fixtures) {
    await db.auth.admin.updateUserById(id, { ban_duration: "8760h" });
    const result = await db
      .from("profiles")
      .update({ active: false })
      .eq("id", id);
    if (result.error)
      console.log("FAIL DEV: no se pudo suspender una cuenta sintética QA.");
  }
  console.log(
    "Limpieza: solo cuentas sintéticas de esta ejecución suspendidas; auditoría conservada, cuentas previas intactas.",
  );
}

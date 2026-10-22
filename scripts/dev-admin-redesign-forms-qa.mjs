/** Integration checks for the redesigned editors. All written records are marked PRUEBA DEV. */
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
const origin = process.argv[2] || "http://localhost:3000",
  ref = process.env.SUPABASE_DEV_PROJECT_REF,
  url = process.env.DEV_SUPABASE_URL;
assert.equal(process.env.APP_ENV, "DEV");
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), ref);
assert.equal(new URL(origin).hostname, "localhost");
assert.ok(
  !process.env.DEV_EMAIL_DELIVERY_MODE ||
    process.env.DEV_EMAIL_DELIVERY_MODE === "disabled",
);
const { chromium } = await import(
    process.env.GREENBEL_QA_PLAYWRIGHT_MODULE || "playwright"
  ),
  db = createClient(url, process.env.DEV_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const tag = randomUUID().slice(0, 8),
  mark = `PRUEBA DEV panel ${tag}`,
  slug = `prueba-dev-panel-${tag}`,
  results = [];
let browser, userId, session;
const need = (r, label) => {
  assert.ok(!r.error && r.data, label);
  return r.data;
};
const check = (name, ok, scope = "DEV") => {
  assert.ok(ok, name);
  results.push({ name, scope });
  console.log(`PASS ${scope}: ${name}`);
};
const until = async (test) => {
  for (let i = 0; i < 30; i++) {
    if (await test()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("No se confirmó el resultado esperado en DEV");
};
try {
  const email = `qa-panel-forms-${tag}@example.invalid`,
    password = `${randomBytes(24).toString("base64url")}Aa1!`;
  userId = need(
    await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { qa_marker: mark },
    }),
    "crear solo admin sintético",
  ).user.id;
  need(
    await db
      .from("profiles")
      .update({ display_name: mark })
      .eq("id", userId)
      .select("id")
      .single(),
    "nombre ficticio",
  );
  need(
    await db
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", userId)
      .select("user_id")
      .single(),
    "rol admin temporal",
  );
  const jar = new Map();
  session = createServerClient(url, process.env.DEV_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) => items.forEach((i) => jar.set(i.name, i.value)),
    },
  });
  need(
    await session.auth.signInWithPassword({ email, password }),
    "sesión ficticia",
  );
  const category = need(
    await db
      .from("categories")
      .insert({ name: `${mark} categoría ficticia`, slug, active: false })
      .select("id")
      .single(),
    "categoría ficticia",
  );
  const product = need(
    await db
      .from("products")
      .insert({
        name: `${mark} producto ficticio`,
        sku: `QA-PANEL-${tag.toUpperCase()}`,
        slug,
        kind: "equipment",
        category_id: category.id,
        publication_status: "draft",
      })
      .select("id,name")
      .single(),
    "producto ficticio sin precio",
  );
  need(
    await db
      .from("brands")
      .insert(
        Array.from({ length: 12 }, (_, i) => ({
          name: `${mark} marca ${String(i).padStart(2, "0")}`,
          slug: `${slug}-brand-${i}`,
          active: false,
        })),
      )
      .select("id"),
    "marcas para paginación",
  );
  const priced = need(
    await db
      .from("products")
      .insert({
        name: `${mark} producto ficticio para oferta`,
        sku: `QA-OFFER-${tag.toUpperCase()}`,
        slug: `${slug}-offer`,
        kind: "equipment",
        category_id: category.id,
        publication_status: "draft",
        regular_price: 100,
        currency: "GTQ",
      })
      .select("id")
      .single(),
    "producto ficticio para oferta",
  );
  need(
    await db
      .from("product_offers")
      .insert({
        product_id: priced.id,
        kind: "percentage",
        value: 10,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86400000).toISOString(),
        enabled: false,
      })
      .select("id")
      .single(),
    "oferta ficticia inactiva",
  );
  browser = await chromium.launch({
    headless: true,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await context.addCookies(
    [...jar].map(([name, value]) => ({
      name,
      value,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    })),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.name));
  mkdirSync("/tmp/greenbel-admin-redesign", { recursive: true });
  if (!process.argv.includes("--delivery-only")) {
    if (!process.argv.includes("--remaining")) {
      await page.goto(
        `${origin}/admin/catalogo?view=brands&brands_q=${tag}&brands_size=10&brands_sort=name&brands_dir=asc`,
        { waitUntil: "networkidle" },
      );
      check(
        "búsqueda de marcas y página inicial con rango real",
        (await page.locator("#marcas").innerText()).includes(
          "Mostrando 1–10 de 12",
        ),
      );
      await page
        .getByRole("navigation", { name: "Páginas de marcas" })
        .getByRole("link", { name: "Siguiente" })
        .click();
      await page.waitForURL((u) => u.searchParams.get("brands_page") === "2");
      await page.getByText("Mostrando 11–12 de 12", { exact: true }).waitFor();
      check(
        "página siguiente mantiene búsqueda y orden",
        new URL(page.url()).searchParams.get("brands_q") === tag,
      );
    }
    await page.goto(
      `${origin}/admin/catalogo?view=brands&brands_q=${tag}&brands_page=99999`,
      { waitUntil: "networkidle" },
    );
    await page.waitForURL((u) => u.searchParams.get("brands_page") === "2");
    check("URL se corrige al limitar una página inexistente", true, "LOCAL");
    await page.goto(
      `${origin}/admin/catalogo?view=offers&offers_q=QA-OFFER-${tag.toUpperCase()}`,
      { waitUntil: "networkidle" },
    );
    check(
      "búsqueda de ofertas por SKU consulta la relación en servidor",
      (await page.locator("#ofertas tbody tr").count()) === 1,
    );
    await page.goto(
      `${origin}/admin/catalogo?view=products&products_q=QA-PANEL-${tag.toUpperCase()}`,
      { waitUntil: "networkidle" },
    );
    check(
      "tabla de productos conserva precio ausente",
      (await page.getByText("Precio próximamente", { exact: true }).count()) ===
        1,
    );
    await page.screenshot({
      path: "/tmp/greenbel-admin-redesign/catalogo-1440.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Editar ficha", exact: true })
      .click();
    await page.waitForURL((u) => u.searchParams.get("product") === product.id);
    await page
      .getByRole("heading", { name: "Especificaciones", exact: true })
      .waitFor();
    const specs = page.getByRole("region", {
      name: "Especificaciones",
      exact: true,
    });
    const add = specs.locator("form").last();
    await add.locator('[name="label"]').fill("Capacidad ficticia de prueba");
    await add.locator('[name="value"]').fill("20");
    await add.locator('[name="unit"]').fill("L");
    await add.getByRole("button", { name: "Agregar", exact: true }).click();
    await until(async () =>
      need(
        await db
          .from("product_specs")
          .select("id,value")
          .eq("product_id", product.id),
        "especificación",
      ).some((r) => r.value === "20"),
    );
    check("alta de especificación desde el editor persiste", true);
    await page.reload({ waitUntil: "networkidle" });
    const edit = page
      .getByRole("region", { name: "Especificaciones", exact: true })
      .locator("form")
      .first();
    await edit.locator('[name="value"]').fill("25");
    await edit.getByRole("button", { name: "Guardar", exact: true }).click();
    await until(async () =>
      need(
        await db
          .from("product_specs")
          .select("value")
          .eq("product_id", product.id),
        "especificación editada",
      ).some((r) => r.value === "25"),
    );
    check("edición de especificación persiste y actualiza vista", true);
    const productForm = page
      .locator("form")
      .filter({ has: page.locator('[name="regularPrice"]') });
    await productForm
      .locator('[name="name"]')
      .fill(`${mark} borrador conservado`);
    await productForm
      .locator('[name="regularPrice"]')
      .fill("importe-no-valido");
    await productForm
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    await productForm.getByRole("alert").waitFor();
    check(
      "error recuperable conserva nombre y precio escritos",
      (await productForm.locator('[name="name"]').inputValue()) ===
        `${mark} borrador conservado` &&
        (await productForm.locator('[name="regularPrice"]').inputValue()) ===
          "importe-no-valido",
    );
    check(
      "validación de servidor no escribió producto inválido",
      need(
        await db
          .from("products")
          .select("name,regular_price")
          .eq("id", product.id)
          .single(),
        "producto intacto",
      ).name === product.name,
    );
    const imageForm = page
      .locator("form")
      .filter({ has: page.locator('input[name="image"]') });
    await imageForm.locator('[name="altText"]').fill(`${mark} imagen ficticia`);
    await imageForm
      .locator('[name="image"]')
      .setInputFiles({
        name: "prueba-dev.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await imageForm
      .getByRole("button", { name: "Agregar imagen", exact: true })
      .click();
    await imageForm.getByRole("status").waitFor();
    check(
      "subida de imagen desde el panel persiste",
      need(
        await db
          .from("product_images")
          .select("id")
          .eq("product_id", product.id),
        "imagen",
      ).length === 1,
    );
    await page.goto(`${origin}/admin/capacitaciones`, {
      waitUntil: "networkidle",
    });
    await page
      .locator(".admin-editor>summary")
      .filter({ hasText: "Crear capacitación" })
      .click();
    const training = page
      .locator("form")
      .filter({ has: page.locator('[name="videoUrl"]') });
    await training.locator('[name="title"]').fill(`${mark} video ficticio`);
    await training.locator('[name="slug"]').fill(`${slug}-video`);
    await training
      .getByRole("button", { name: "Crear capacitación", exact: true })
      .click();
    await until(
      async () =>
        need(
          await db.from("trainings").select("id").eq("slug", `${slug}-video`),
          "capacitación",
        ).length === 1,
    );
    check("formulario de capacitación guarda un borrador real", true);
  }
  await page.goto(`${origin}/admin/entregas`, { waitUntil: "networkidle" });
  const zones = page.locator("#zonas");
  await zones.locator(":scope > details > summary").click();
  const zoneForm = zones.locator("details form").first();
  await zoneForm
    .getByRole("button", { name: "Crear zona inactiva", exact: true })
    .click();
  check(
    "validación obligatoria junto al campo y foco visible",
    (await zoneForm.locator(".admin-field-error").count()) > 0 &&
      (await zoneForm.locator('[name="code"]').getAttribute("aria-invalid")) ===
        "true",
    "LOCAL",
  );
  const code = `QA_UI_${tag.toUpperCase()}`;
  await zoneForm.locator('[name="code"]').fill(code);
  await zoneForm.locator('[name="name"]').fill(`${mark} zona ficticia`);
  await zoneForm
    .locator('[name="department"]')
    .fill("PRUEBA DEV departamento ficticio");
  await zoneForm
    .locator('[name="municipality"]')
    .fill("PRUEBA DEV municipio ficticio");
  await zoneForm
    .getByRole("button", { name: "Crear zona inactiva", exact: true })
    .click();
  await until(
    async () =>
      need(
        await db.from("delivery_zones").select("id").eq("code", code),
        "zona",
      ).length === 1,
  );
  check(
    "nuevo formulario de entregas guarda sin redirigir ni activar",
    need(
      await db
        .from("delivery_zones")
        .select("active")
        .eq("code", code)
        .single(),
      "zona inactiva",
    ).active === false,
  );
  await zoneForm.locator('[name="code"]').fill(code);
  await zoneForm.locator('[name="name"]').fill(`${mark} zona ficticia`);
  await zoneForm
    .locator('[name="department"]')
    .fill("PRUEBA DEV departamento ficticio");
  await zoneForm
    .locator('[name="municipality"]')
    .fill("PRUEBA DEV municipio ficticio");
  await zoneForm
    .getByRole("button", { name: "Crear zona inactiva", exact: true })
    .click();
  await zoneForm.getByRole("alert").waitFor();
  check(
    "reintento duplicado informa error y conserva datos",
    (await zoneForm.locator('[name="code"]').inputValue()) === code &&
      need(
        await db.from("delivery_zones").select("id").eq("code", code),
        "no duplicar zona",
      ).length === 1,
  );
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const route of [
      "catalogo?view=products",
      "inventario",
      "ventas",
      "entregas",
      "capacitaciones",
      "resenas",
      "consultas",
      "financiamiento",
      "cotizaciones",
      "envios",
    ]) {
      await page.goto(`${origin}/admin/${route}`, { waitUntil: "networkidle" });
      check(
        `${route.split("?")[0]} sin overflow a ${width}px`,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "LOCAL",
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(
    `${origin}/admin/catalogo?view=products&product=${product.id}`,
    { waitUntil: "networkidle" },
  );
  await page
    .getByRole("heading", { name: "Especificaciones", exact: true })
    .waitFor();
  check(
    "editor de producto funciona sin overflow a 390px",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "LOCAL",
  );
  await page.goto(`${origin}/admin/usuarios?q=${encodeURIComponent(mark)}`, {
    waitUntil: "networkidle",
  });
  const table = page.locator(".admin-table-wrap");
  check(
    "tabla móvil permite desplazamiento horizontal controlado",
    await table.evaluate((e) => e.scrollWidth > e.clientWidth),
    "LOCAL",
  );
  await table.evaluate((e) => (e.scrollLeft = e.scrollWidth));
  await page.getByRole("button", { name: /Ver detalles/ }).click();
  await page.getByRole("dialog", { name: "Detalle del usuario" }).waitFor();
  await page.keyboard.press("Escape");
  check(
    "acciones de tabla accesibles a 390px y cierre con teclado",
    (await page
      .getByRole("dialog", { name: "Detalle del usuario" })
      .count()) === 0,
    "LOCAL",
  );
  await page.goto(`${origin}/contacto`, { waitUntil: "networkidle" });
  check(
    "salir al sitio restaura encabezado y footer públicos",
    (await page.locator(".footer:not(.footer-compact)").count()) === 1 &&
      (await page.locator(".admin-sidebar").count()) === 0,
    "LOCAL",
  );
  await page.goto(`${origin}/cuenta/ingresar`, { waitUntil: "networkidle" });
  check(
    "login mantiene footer compacto previo",
    (await page.locator(".footer-compact").count()) === 1,
    "LOCAL",
  );
  check(
    "sin errores JavaScript en editores y navegación",
    errors.length === 0,
    "LOCAL",
  );
  writeFileSync(
    "/tmp/greenbel-admin-redesign/forms-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    `PASS: ${results.length} verificaciones. Datos ficticios conservados como borradores/inactivos; ningún producto real modificado.`,
  );
} catch (error) {
  console.error(
    `FAIL QA: ${error.name}: ${String(error.message).split("\n")[0]}`,
  );
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (session) await session.auth.signOut({ scope: "global" });
  if (userId) {
    await db.from("profiles").update({ active: false }).eq("id", userId);
    await db.auth.admin.updateUserById(userId, { ban_duration: "8760h" });
  }
  console.log(
    "Cuenta de QA suspendida y sesión retirada. Sin correos ni cambios PROD.",
  );
}

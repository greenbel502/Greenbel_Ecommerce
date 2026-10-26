/** DEV-only HTTP integration checks. Temporary fixtures are removed in finally; no browser or SMTP. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import sharp from "sharp";
import { createRequire } from "node:module";
import { saveBrandChanges } from "../src/lib/brands/save-brand-changes.ts";
import { saveBrandLogo } from "../src/lib/brands/brand-logo-request.ts";
import { loadProductEditorData } from "../src/lib/products/product-editor-data.ts";
import { generateProductSlug } from "../src/lib/products/product-slug.ts";
const { encodeReply } = createRequire(import.meta.url)(
  "next/dist/compiled/react-server-dom-webpack/client.node",
);
const requestedMode = process.argv[2];
assert.ok(
  [
    "--run",
    "--with-logos",
    "--logo-limits",
    "--unified-save",
    "--editor-load",
    "--classifications",
    "--products",
    "--product-load",
    "--product-slug",
    "--cleanup",
  ].includes(requestedMode),
  "Choose a DEV QA mode",
);
const mode = requestedMode === "--run" ? "--with-logos" : requestedMode;
const e = process.env,
  ref = e.SUPABASE_DEV_PROJECT_REF,
  url = e.DEV_SUPABASE_URL;
assert.equal(e.APP_ENV, "DEV");
assert.equal(new URL(url).hostname, ref + ".supabase.co");
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), ref);
assert.ok(
  !e.DEV_EMAIL_DELIVERY_MODE || e.DEV_EMAIL_DELIVERY_MODE === "disabled",
);
const origin = process.argv[3] || "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const db = createClient(url, e.DEV_SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(url, e.DEV_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const privateDir = homedir() + "/.codex/private/greenbel-brands-qa";
mkdirSync(privateDir, { recursive: true, mode: 0o700 });
const journalPath = privateDir + "/current.json";
const need = (r, label) => {
  assert.ok(
    !r.error && r.data != null,
    label + (r.error ? " (" + (r.error.code || "remote") + ")" : ""),
  );
  return r.data;
};
const results = [];
const check = (name, ok, scope = "DEV + HTTP") => {
  assert.ok(ok, name);
  results.push({ name, status: "PASS", scope });
  console.log("PASS:", name);
};
const digest = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const unescape = (s) =>
  s
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
let f;
function journal() {
  writeFileSync(journalPath, JSON.stringify(f, null, 2), { mode: 0o600 });
}
async function cleanup() {
  const discovered = need(
    await db
      .from("brands")
      .select("id")
      .like("slug", f.slug + "%")
      .like("name", f.marker + "%"),
    "Discover this run only",
  );
  f.brands = [...new Set([...f.brands, ...discovered.map((x) => x.id)])];
  journal();
  for (const id of f.products) {
    const lookup = await db
      .from("products")
      .select("id,sku")
      .eq("id", id)
      .maybeSingle();
    assert.ok(!lookup.error);
    const p = lookup.data;
    if (p) {
      assert.ok(p.sku.startsWith("QA-BRANDS-" + f.tag));
      if (f.mediaProducts?.includes(id)) {
        const media = need(
          await db
            .from("product_images")
            .select("id,storage_path")
            .eq("product_id", id),
          "This run's temporary product media",
        );
        for (const image of media)
          assert.ok(image.storage_path.startsWith(id + "/"));
        assert.ok(
          !(await db.from("product_images").delete().eq("product_id", id))
            .error,
        );
        if (media.length)
          assert.ok(
            !(
              await db.storage
                .from("product-images")
                .remove(media.map((image) => image.storage_path))
            ).error,
          );
        assert.ok(
          !(await db.from("product_specs").delete().eq("product_id", id)).error,
        );
      }
      need(
        await db.from("products").delete().eq("id", id).select("id"),
        "Remove temporary product",
      );
    }
  }
  for (const id of f.trainings ?? []) {
    const r = await db
      .from("trainings")
      .select("id,slug")
      .eq("id", id)
      .maybeSingle();
    assert.ok(!r.error);
    if (!r.data) continue;
    assert.ok(r.data.slug.startsWith(f.slug));
    assert.ok(
      !(await db.from("training_categories").delete().eq("training_id", id))
        .error,
    );
    assert.ok(!(await db.from("trainings").delete().eq("id", id)).error);
  }
  const categories = need(
    await db
      .from("categories")
      .select("id,parent_id")
      .like("slug", f.slug + "%")
      .like("name", f.marker + "%"),
    "Discover this run's categories",
  );
  const remaining = new Map(
    categories.map((category) => [category.id, category]),
  );
  while (remaining.size) {
    const parents = new Set(
      [...remaining.values()].map((category) => category.parent_id),
    );
    const leaves = [...remaining.values()].filter(
      (category) => !parents.has(category.id),
    );
    assert.ok(leaves.length, "Cleanup category hierarchy must be acyclic");
    for (const leaf of leaves) {
      need(
        await db.from("categories").delete().eq("id", leaf.id).select("id"),
        "Remove only a temporary category",
      );
      remaining.delete(leaf.id);
    }
  }
  for (const id of f.brands) {
    const lookup = await db
      .from("brands")
      .select("id,slug")
      .eq("id", id)
      .maybeSingle();
    assert.ok(!lookup.error);
    const b = lookup.data;
    if (!b) continue;
    assert.ok(b.slug.startsWith(f.slug));
    const files = await db.storage.from("brand-logos").list(id, { limit: 100 });
    if (!files.error && files.data.length) {
      const r = await db.storage
        .from("brand-logos")
        .remove(files.data.map((file) => id + "/" + file.name));
      assert.ok(!r.error, "Remove only temporary logo files");
    }
    need(
      await db.from("brands").delete().eq("id", id).select("id"),
      "Remove temporary brand",
    );
  }
  for (const id of f.users) {
    const u = need(
      await db.auth.admin.getUserById(id),
      "Inspect temporary account",
    ).user;
    assert.equal(u.user_metadata.qa_marker, f.marker);
    assert.ok(u.email.endsWith("@example.invalid"));
    assert.ok(!(await db.from("user_roles").delete().eq("user_id", id)).error);
    const audit = await db
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", id);
    assert.ok(!audit.error, "Check the temporary actor's audit references");
    if (audit.count > 0) {
      // Audit is immutable. Preserve its actor FK, revoke all access, and record this residual explicitly.
      assert.ok(
        !(await db.from("profiles").update({ active: false }).eq("id", id))
          .error,
      );
      assert.ok(
        !(await db.auth.admin.updateUserById(id, { ban_duration: "876000h" }))
          .error,
      );
      f.retainedUsers = [...new Set([...(f.retainedUsers ?? []), id])];
      journal();
      console.log(
        "PASS: temporary audit actor retained inactive, roleless and Auth-banned; immutable audit preserved",
      );
      continue;
    }
    assert.ok(!(await db.from("profiles").delete().eq("id", id)).error);
    assert.ok(
      !(await db.auth.admin.deleteUser(id)).error,
      "Remove temporary Auth account",
    );
  }

  f.cleaned = true;
  journal();
  renameSync(journalPath, privateDir + "/completed-" + f.tag + ".json");
}
if (mode === "--cleanup") {
  assert.ok(existsSync(journalPath));
  f = JSON.parse(readFileSync(journalPath));
  assert.match(f.marker, /^PRUEBA DEV Marcas [a-f0-9]{8}$/);
  await cleanup();
  console.log("PASS: temporary brand QA fixtures removed.");
  process.exit(0);
}
assert.ok(
  !existsSync(journalPath),
  "An interrupted QA journal must be cleaned first with --cleanup",
);
f = {
  tag: randomUUID().slice(0, 8),
  users: [],
  brands: [],
  products: [],
  trainings: [],
};
f.marker = "PRUEBA DEV Marcas " + f.tag;
f.slug = "qa-marcas-" + f.tag;
journal();
async function protectedState() {
  return Object.fromEntries(
    await Promise.all(
      [
        "brands",
        "categories",
        "trainings",
        "products",
        "product_specs",
        "product_images",
        "profiles",
        "user_roles",
      ].map(async (table) => [
        table,
        need(
          await db
            .from(table)
            .select("*")
            .order(table === "user_roles" ? "user_id" : "id"),
          "Protected baseline " + table,
        ),
      ]),
    ),
  );
}
const baseline = await protectedState();
async function account(role) {
  const email = `${f.slug}-${role}@example.invalid`,
    password = randomBytes(32).toString("base64url") + "Aa1!";
  const user = need(
    await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { qa_marker: f.marker },
    }),
    "Temporary " + role,
  ).user;
  f.users.push(user.id);
  journal();
  if (role !== "customer")
    need(
      await db
        .from("user_roles")
        .update({ role })
        .eq("user_id", user.id)
        .select("user_id"),
      "Temporary role",
    );
  const jar = new Map();
  const client = createServerClient(url, e.DEV_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) => items.forEach((i) => jar.set(i.name, i.value)),
    },
  });
  need(
    await client.auth.signInWithPassword({ email, password }),
    "Temporary sign in",
  );
  return [...jar]
    .map(
      ([name, value]) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    )
    .join("; ");
}
async function get(path, cookie = "") {
  const r = await fetch(origin + path, {
    headers: { Cookie: cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(45000),
  });
  return { status: r.status, text: await r.text(), headers: r.headers };
}
function formFor(html, field) {
  const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(
    (x) => x[0],
  );
  const form = forms.find((x) => x.includes(`name="${field}"`));
  assert.ok(form, "Rendered form " + field);
  const data = new FormData();
  for (const m of form.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0],
      name = tag.match(/\bname="([^"]+)"/),
      value = tag.match(/\bvalue="([^"]*)"/);
    if (name && name[1].startsWith("$ACTION_"))
      data.set(unescape(name[1]), unescape(value?.[1] || ""));
  }
  assert.ok(
    [...data.keys()].some(
      (k) => k.startsWith("$ACTION_REF_") || k.startsWith("$ACTION_ID_"),
    ),
    "Server form reference",
  );
  return data;
}
async function brandAction(name, values, cookie) {
  const source = readFileSync(
    ".next/static/chunks/app/admin/catalogo/page.js",
    "utf8",
  );
  const ids = new Map(
    [
      ...source.matchAll(
        /createServerReference\)\([^a-f0-9]*([a-f0-9]{40,})[^;]+?\b(createBrandAction|updateBrandAction|setBrandActiveAction|deleteBrandAction|createCategoryAction|updateCategoryAction|setCategoryActiveAction|deleteCategoryAction|saveProductAction|deleteProductAction|setPrimaryImageAction)\b/g,
      ),
    ].map((m) => [m[2], m[1]]),
  );
  const id = ids.get(name);
  assert.ok(id, "Compiled action reference " + name);
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, String(v));
  const body = await encodeReply([{ status: "idle", message: "" }, data]);
  const r = await fetch(origin + "/admin/catalogo?view=brands", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Next-Action": id,
      Accept: "text/x-component",
    },
    body,
    signal: AbortSignal.timeout(45000),
  });
  const text = await r.text();
  assert.ok(r.status < 500, "Brand action response HTTP " + r.status);
  const result = text.split("\n").flatMap((line) => {
    try {
      const value = JSON.parse(line.slice(line.indexOf(":") + 1));
      return value && ["success", "error"].includes(value.status)
        ? [value]
        : [];
    } catch {
      return [];
    }
  })[0];
  assert.ok(result, "Structured result for " + name);
  return result;
}
async function action(html, field, values, cookie) {
  if (field === "name" || field === "active")
    return brandAction(
      field === "active"
        ? "setBrandActiveAction"
        : values.id
          ? "updateBrandAction"
          : "createBrandAction",
      values,
      cookie,
    );
  const data = formFor(html, field);
  for (const [k, v] of Object.entries(values)) data.set(k, String(v));
  const r = await fetch(origin + "/admin/catalogo?view=brands", {
    method: "POST",
    headers: { Cookie: cookie, Origin: origin },
    body: data,
    redirect: "manual",
    signal: AbortSignal.timeout(45000),
  });
  const text = await r.text();
  assert.ok(r.status < 500, "Server action response");
  return { status: r.status, text };
}
async function publicPair(id, present) {
  for (const path of ["/", "/nosotros"]) {
    const page = await get(path);
    assert.equal(page.status, 200);
    check(
      `${path}: brand ${present ? "visible" : "hidden"} from active records`,
      page.text.includes(`data-brand-id="${id}"`) === present,
    );
    assert.ok(!page.text.includes("Marcas de demostración DEV"));
  }
}
const logoForm = (
  id,
  expected,
  bytes,
  type = "image/png",
  operation = "upload",
) => {
  const data = new FormData();
  data.set("brandId", id);
  data.set("expectedLogoPath", expected || "");
  data.set("operation", operation);
  if (bytes)
    data.set(
      "image",
      new File([bytes], "qa-logo." + (type === "image/png" ? "png" : "webp"), {
        type,
      }),
    );
  return data;
};
async function postLogo(cookie, data, extra = {}) {
  const r = await fetch(origin + "/api/admin/brand-logos", {
    method: "POST",
    headers: { Cookie: cookie, Origin: origin, ...extra },
    body: data,
    signal: AbortSignal.timeout(45000),
  });
  return { status: r.status, body: await r.json() };
}
async function imageLimits() {
  const cookie = await account("admin");
  const brand = need(
    await db
      .from("brands")
      .insert({
        name: f.marker + " límites",
        slug: f.slug + "-limits",
        active: false,
      })
      .select("id")
      .single(),
    "Temporary image limit brand",
  );
  f.brands.push(brand.id);
  journal();
  const metadata = () =>
    db.from("brands").select("logo_path").eq("id", brand.id).single();
  const oversizedFile = await postLogo(
    cookie,
    logoForm(brand.id, "", Buffer.alloc(5_000_001)),
  );
  check(
    "A file above 5 MB is rejected even inside the multipart allowance",
    oversizedFile.status === 400,
  );
  const noise = await sharp(randomBytes(1100 * 1100 * 3), {
    raw: { width: 1100, height: 1100, channels: 3 },
  })
    .png()
    .toBuffer();
  assert.ok(noise.length < 5_000_000);
  const expanded = await postLogo(cookie, logoForm(brand.id, "", noise));
  check(
    "A valid input below 5 MB whose final WebP exceeds 2 MB is rejected",
    expanded.status === 413,
  );
  check(
    "Rejected size limits leave metadata and private Storage untouched",
    need(await metadata(), "Unchanged logo").logo_path === null &&
      need(
        await db.storage.from("brand-logos").list(brand.id),
        "Empty logo folder",
      ).length === 0,
  );
  const wide = await sharp({
    create: {
      width: 4000,
      height: 1000,
      channels: 4,
      background: { r: 128, g: 186, b: 1, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const mismatch = await postLogo(
    cookie,
    logoForm(brand.id, "", wide, "image/webp"),
  );
  check(
    "A valid image with a false MIME type is rejected",
    mismatch.status === 400,
  );
  const uploaded = await postLogo(cookie, logoForm(brand.id, "", wide));
  assert.equal(uploaded.status, 201);
  const row = need(await metadata(), "Wide logo pointer");
  const image = need(
    await db.storage.from("brand-logos").download(row.logo_path),
    "Normalized wide logo",
  );
  const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
  check(
    "Proportional normalization preserves the entire logo and transparency",
    meta.format === "webp" &&
      meta.width === 1600 &&
      meta.height === 400 &&
      meta.hasAlpha === true,
  );
  const p = await get("/admin/catalogo?view=brands&brand=" + brand.id, cookie);
  check(
    "The approved bucket enables the logo file selector",
    p.status === 200 &&
      p.text.includes("Archivo del logotipo") &&
      !p.text.includes("La carga de logotipos está pendiente de habilitación"),
  );
}
async function unifiedSave() {
  const cookie = await account("admin");
  const page = await get("/admin/catalogo?view=brands&brand=new", cookie);
  assert.equal(page.status, 200);
  check(
    "The editor renders one form and a final Save changes control",
    page.text.includes('data-brand-editor="true"') &&
      page.text.indexOf("Visibilidad</h3>") <
        page.text.lastIndexOf("Guardar cambios") &&
      !page.text.includes("Guardar datos") &&
      !page.text.includes("Guardar logotipo"),
  );
  check(
    "The image selector provides a drop area and pending/saved guidance",
    page.text.includes("Arrastra tu logotipo aquí") &&
      page.text.includes("Los cambios se aplican al guardar"),
  );
  const png = await sharp({
    create: { width: 480, height: 160, channels: 4, background: "#80BA01" },
  })
    .png()
    .toBuffer();
  const image = new File([png], "marca-ficticia.png", { type: "image/png" });
  const dependencies = {
    details: async (id, draft) => {
      const result = await brandAction(
        id ? "updateBrandAction" : "createBrandAction",
        { ...(id ? { id } : {}), name: draft.name, slug: draft.slug },
        cookie,
      );
      if (result.brandId && !f.brands.includes(result.brandId)) {
        f.brands.push(result.brandId);
        journal();
      }
      return result;
    },
    logo: (id, expected, draft) =>
      saveBrandLogo(id, expected, draft, (path, options) =>
        fetch(origin + path, {
          ...options,
          headers: { Cookie: cookie, Origin: origin },
          signal: AbortSignal.timeout(45000),
        }),
      ),
    visibility: (id, active) =>
      brandAction("setBrandActiveAction", { id, active }, cookie),
  };
  const draft = {
    name: f.marker + " guardado único",
    slug: f.slug + "-single",
    active: true,
    logoOperation: "upload",
    file: image,
  };
  let result = await saveBrandChanges(
    { id: null, name: "", slug: "", active: false, logoPath: null },
    draft,
    dependencies,
  );
  assert.equal(result.status, "success", result.message);
  const id = result.saved.id;
  const row = need(
    await db.from("brands").select("*").eq("id", id).single(),
    "Saved brand",
  );
  check(
    "One save persists the name, selected image and active visibility",
    row.name === draft.name &&
      row.active === true &&
      row.logo_path === result.saved.logoPath &&
      !!row.logo_path,
  );
  async function publicImages(path) {
    const r = await get(path);
    assert.equal(r.status, 200);
    check(
      path + ": the rendered carousel includes the saved versioned image",
      r.text.includes(
        'src="/api/brand-logos/' +
          id +
          "?v=" +
          result.saved.logoPath.split("/")[1],
      ),
    );
  }
  await publicImages("/");
  await publicImages("/nosotros");
  const served = await fetch(origin + "/api/brand-logos/" + id);
  const stored = need(
    await db.storage.from("brand-logos").download(row.logo_path),
    "Saved logo bytes",
  );
  check(
    "The public image returns the exact persisted private file",
    served.status === 200 &&
      digest(Buffer.from(await served.arrayBuffer())) ===
        digest(Buffer.from(await stored.arrayBuffer())),
  );
  const invalid = {
    ...draft,
    name: f.marker + " corregida",
    file: new File(["not-an-image"], "falsa.png", { type: "image/png" }),
  };
  const failed = await saveBrandChanges(result.saved, invalid, dependencies);
  check(
    "An image error does not claim full success or lose the confirmed brand ID",
    failed.status === "error" &&
      failed.saved.id === id &&
      !failed.logoCompleted &&
      failed.saved.logoPath === row.logo_path,
  );
  result = await saveBrandChanges(
    failed.saved,
    { ...invalid, file: image },
    dependencies,
  );
  assert.equal(result.status, "success", result.message);
  check(
    "A corrected image retries the same brand without a duplicate",
    result.saved.id === id &&
      need(
        await db.from("brands").select("id").eq("slug", draft.slug),
        "No duplicate",
      ).length === 1 &&
      result.saved.logoPath !== row.logo_path,
  );
  await publicImages("/");
  await publicImages("/nosotros");
  result = await saveBrandChanges(
    result.saved,
    { ...invalid, file: null, logoOperation: "keep", active: false },
    dependencies,
  );
  assert.equal(result.status, "success");
  check(
    "Saving inactive visibility denies the public logo",
    (await get("/api/brand-logos/" + id)).status === 404,
  );
  result = await saveBrandChanges(
    result.saved,
    { ...invalid, file: null, logoOperation: "remove", active: false },
    dependencies,
  );
  check(
    "The same final save can remove a persisted logo",
    result.status === "success" &&
      result.saved.logoPath === null &&
      need(await db.storage.from("brand-logos").list(id), "Removed logo files")
        .length === 0,
  );
  const customer = await account("customer");
  const denied = await brandAction(
    "createBrandAction",
    { name: f.marker + " prohibida", slug: f.slug + "-forbidden" },
    customer,
  );
  check(
    "A customer cannot execute the actions used by the unified editor",
    denied.status === "error" &&
      need(
        await db
          .from("brands")
          .select("id")
          .eq("slug", f.slug + "-forbidden"),
        "No forbidden brand",
      ).length === 0,
  );
}
async function editorLoad() {
  const cookie = await account("admin");
  const brand = need(
    await db.from("brands").select("id,name").order("name").limit(1),
    "Existing brand for read-only page checks",
  )[0];
  assert.ok(brand);
  const timings = [];
  for (const [label, path] of [
    ["List", "/admin/catalogo?view=brands"],
    ["Direct editor", "/admin/catalogo?view=brands&brand=" + brand.id],
    [
      "Off-page editor",
      "/admin/catalogo?view=brands&brands_q=" + f.tag + "&brand=" + brand.id,
    ],
    ["New brand", "/admin/catalogo?view=brands&brand=new"],
  ]) {
    const start = performance.now();
    const page = await get(path, cookie);
    timings.push({
      label,
      serverResponseMs: Math.round(performance.now() - start),
    });
    assert.equal(page.status, 200);
    if (label === "List") {
      check(
        "Listed rows render local Edit buttons instead of server navigation links",
        /<button[^>]*aria-label="Editar /.test(page.text) &&
          !/<a[^>]*aria-label="Editar /.test(page.text),
      );
    } else {
      check(
        label + ": dialog and editor are present in the authorized HTML",
        page.text.includes("<dialog") &&
          page.text.includes('id="editor-marca"') &&
          page.text.includes('data-brand-editor="true"'),
      );
      if (label !== "New brand")
        check(
          label + ": selected record is available without an empty editor",
          page.text.includes('value="' + brand.name + '"'),
        );
      const filter = page.text.match(
        /<form[^>]*aria-label="Buscar y filtrar marcas"[\s\S]*?<\/form>/,
      )?.[0];
      assert.ok(filter);
      check(
        label + ": list filters do not retain an obsolete editor selection",
        !filter.includes('name="brand"'),
      );
    }
  }
  writeFileSync(
    "docs/brands/editor-server-timings.json",
    JSON.stringify(
      {
        time: new Date().toISOString(),
        target: "DEV + local HTTP",
        scope: "Server document responses only, not browser click latency",
        catalogWrites: false,
        temporaryAuthAccount: true,
        timings,
      },
      null,
      2,
    ) + "\n",
  );
}
async function classifications() {
  const adminCookie = await account("admin");
  const customerCookie = await account("customer");
  const operatorCookie = await account("operator");
  const categoriesPage = await get(
    "/admin/catalogo?view=categories",
    adminCookie,
  );
  assert.equal(categoriesPage.status, 200);
  check(
    "Categories use a table with local Edit and Delete buttons",
    categoriesPage.text.includes('aria-label="Editar ') &&
      categoriesPage.text.includes('aria-label="Eliminar ') &&
      categoriesPage.text.includes("<table"),
  );
  check(
    "Shared filters separate search, options and actions",
    [
      "admin-list-search-input",
      "admin-list-options",
      "admin-list-actions",
    ].every((name) => categoriesPage.text.includes(name)),
  );
  check(
    "Filter form retains all server query controls",
    [
      "categories_q",
      "categories_filter",
      "categories_sort",
      "categories_dir",
      "categories_size",
    ].every((name) => categoriesPage.text.includes('name="' + name + '"')),
  );
  const existing = need(
    await db.from("categories").select("id,name").order("name").limit(1),
    "Existing category for read-only direct URL",
  )[0];
  for (const [label, path] of [
    ["direct", "/admin/catalogo?view=categories&category=" + existing.id],
    [
      "off-page",
      "/admin/catalogo?view=categories&categories_q=" +
        f.tag +
        "&category=" +
        existing.id,
    ],
    ["new", "/admin/catalogo?view=categories&category=new"],
  ]) {
    const page = await get(path, adminCookie);
    check(
      label + " category editor renders the modal drawer and form",
      page.status === 200 &&
        page.text.includes('id="editor-categoria"') &&
        page.text.includes('data-category-editor="true"'),
    );
    if (label !== "new")
      assert.ok(page.text.includes('value="' + existing.name + '"'));
    const form = page.text.match(
      /<form[^>]*aria-label="Buscar y filtrar categorías"[\s\S]*?<\/form>/,
    )?.[0];
    check(
      label + " filters do not restore a closed category drawer",
      !!form && !form.includes('name="category"'),
    );
  }
  const call = (name, values, cookie = adminCookie) =>
    brandAction(name, values, cookie);
  const createCategory = async (suffix, parentId = "") => {
    const response = await call("createCategoryAction", {
      name: f.marker + " " + suffix,
      slug: f.slug + "-" + suffix,
      parentId,
    });
    assert.equal(response.status, "success", response.message);
    const row = need(
      await db
        .from("categories")
        .select("*")
        .eq("slug", f.slug + "-" + suffix)
        .single(),
      "Created category",
    );
    assert.equal(response.categoryId, row.id);
    return row;
  };
  const remove = (kind, row, cookie = adminCookie, overrides = {}) =>
    call(
      kind === "brand" ? "deleteBrandAction" : "deleteCategoryAction",
      {
        id: row.id,
        expectedName: row.name,
        confirmation: "delete",
        ...overrides,
      },
      cookie,
    );
  const parent = await createCategory("parent");
  let child = await createCategory("child", parent.id);
  check(
    "Creating a category returns its saved ID and preserves the parent relation",
    child.parent_id === parent.id && !child.active,
  );
  const editedName = f.marker + " child edited";
  let response = await call("updateCategoryAction", {
    id: child.id,
    name: editedName,
    slug: child.slug,
    parentId: parent.id,
  });
  assert.equal(response.status, "success", response.message);
  child = need(
    await db.from("categories").select("*").eq("id", child.id).single(),
    "Edited child",
  );
  check(
    "Category editor actions persist metadata on the same ID",
    child.name === editedName && response.categoryId === child.id,
  );
  response = await call("setCategoryActiveAction", {
    id: child.id,
    active: "true",
  });
  check(
    "Category visibility remains functional",
    response.status === "success" &&
      need(
        await db
          .from("categories")
          .select("active")
          .eq("id", child.id)
          .single(),
        "Activated category",
      ).active,
  );
  const invalid = await call("createCategoryAction", {
    name: f.marker + " invalid",
    slug: "INVALID SPACE",
    parentId: "",
  });
  check(
    "Category validation returns an error beside the identifier",
    invalid.status === "error" && !!invalid.fieldErrors?.slug,
  );
  const cycle = await call("updateCategoryAction", {
    id: parent.id,
    name: parent.name,
    slug: parent.slug,
    parentId: child.id,
  });
  check(
    "A cyclic hierarchy is rejected without changing the category",
    cycle.status === "error" &&
      !!cycle.fieldErrors?.parentId &&
      need(
        await db
          .from("categories")
          .select("parent_id")
          .eq("id", parent.id)
          .single(),
        "No cycle",
      ).parent_id === null,
  );
  check(
    "Deleting a category with a subcategory is rejected",
    (await remove("category", parent)).status === "error",
  );
  const training = need(
    await db
      .from("trainings")
      .insert({
        title: f.marker + " training",
        slug: f.slug + "-training",
        publication_status: "draft",
      })
      .select("id")
      .single(),
    "Fixture training",
  );
  f.trainings.push(training.id);
  journal();
  assert.ok(
    !(
      await db
        .from("training_categories")
        .insert({ training_id: training.id, category_id: child.id })
    ).error,
  );
  check(
    "Deleting a category linked to a training is rejected",
    (await remove("category", child)).status === "error",
  );
  assert.ok(
    !(
      await db
        .from("training_categories")
        .delete()
        .eq("training_id", training.id)
        .eq("category_id", child.id)
    ).error,
  );
  const createdBrand = await call("createBrandAction", {
    name: f.marker + " brand",
    slug: f.slug + "-delete-brand",
  });
  assert.equal(createdBrand.status, "success", createdBrand.message);
  const brand = need(
    await db.from("brands").select("*").eq("id", createdBrand.brandId).single(),
    "Fixture brand",
  );
  f.brands.push(brand.id);
  journal();
  const png = await sharp({
    create: { width: 96, height: 64, channels: 4, background: "#80BA01" },
  })
    .png()
    .toBuffer();
  const upload = await postLogo(adminCookie, logoForm(brand.id, "", png));
  assert.equal(upload.status, 201);
  assert.equal(
    (await call("setBrandActiveAction", { id: brand.id, active: "true" }))
      .status,
    "success",
  );
  const product = need(
    await db
      .from("products")
      .insert({
        name: f.marker + " linked product",
        sku: "QA-BRANDS-" + f.tag,
        slug: f.slug + "-linked-product",
        kind: "equipment",
        brand_id: brand.id,
        category_id: child.id,
        publication_status: "draft",
      })
      .select("id")
      .single(),
    "Fixture product",
  );
  f.products.push(product.id);
  journal();
  check(
    "Deleting a brand assigned even to a draft product is rejected",
    (await remove("brand", brand)).status === "error",
  );
  check(
    "Blocked brand deletion preserves its stored and public logo",
    (await get("/api/brand-logos/" + brand.id)).status === 200 &&
      need(await db.storage.from("brand-logos").list(brand.id), "Retained logo")
        .length === 1,
  );
  check(
    "Deleting a category assigned to a draft product is rejected",
    (await remove("category", child)).status === "error",
  );
  assert.ok(!(await db.from("products").delete().eq("id", product.id)).error);
  for (const [label, cookie] of [
    ["customer", customerCookie],
    ["operator", operatorCookie],
    ["anonymous", ""],
  ]) {
    for (const [kind, row] of [
      ["brand", brand],
      ["category", child],
    ]) {
      check(
        label + " cannot execute " + kind + " deletion",
        (await remove(kind, row, cookie)).status === "error",
      );
    }
  }
  check(
    "A deletion request without confirmation is rejected",
    (await remove("brand", brand, adminCookie, { confirmation: "" })).status ===
      "error",
  );
  check(
    "A stale record name cannot be deleted",
    (
      await remove("category", child, adminCookie, {
        expectedName: f.marker + " stale",
      })
    ).status === "error",
  );
  const filtered = await get(
    `/admin/catalogo?view=categories&categories_q=${f.tag}&categories_filter=true&categories_sort=name&categories_dir=asc&categories_size=10&categories_page=99`,
    adminCookie,
  );
  const body = filtered.text.match(/<tbody[\s\S]*?<\/tbody>/)?.[0] ?? "";
  check(
    "Category search/filter/sort/page size stay server-side and out-of-range pages clamp",
    filtered.status === 200 &&
      [...body.matchAll(/<tr\b/g)].length === 1 &&
      body.includes(editedName) &&
      !body.includes("<strong>" + parent.name + "</strong>") &&
      filtered.text.includes("categories_q=" + f.tag),
  );
  response = await remove("brand", brand);
  check(
    "An unreferenced brand is actually deleted",
    response.status === "success" &&
      !need(
        await db.from("brands").select("id").eq("id", brand.id),
        "Deleted brand",
      ).length,
  );
  check(
    "Successful brand deletion also removes its owned logo and public access",
    need(
      await db.storage.from("brand-logos").list(brand.id),
      "Deleted logo files",
    ).length === 0 &&
      (await get("/api/brand-logos/" + brand.id)).status === 404,
  );
  response = await remove("category", child);
  check(
    "An unreferenced subcategory is actually deleted",
    response.status === "success" &&
      !need(
        await db.from("categories").select("id").eq("id", child.id),
        "Deleted child",
      ).length,
  );
  response = await remove("category", parent);
  check(
    "Parent deletion works after its dependencies are removed",
    response.status === "success" &&
      !need(
        await db.from("categories").select("id").eq("id", parent.id),
        "Deleted parent",
      ).length,
  );
  const empty = await get(
    `/admin/catalogo?view=categories&categories_q=${f.tag}&categories_page=99`,
    adminCookie,
  );
  check(
    "After deletion, the filtered list uses a valid empty page",
    empty.status === 200 &&
      empty.text.includes("No hay coincidencias") &&
      !(empty.text.match(/<tbody[\s\S]*?<\/tbody>/)?.[0] ?? "").includes("<tr"),
  );
  const brandsPage = await get("/admin/catalogo?view=brands", adminCookie);
  check(
    "Brands retain Edit alongside the new Delete action",
    brandsPage.status === 200 &&
      brandsPage.text.includes('aria-label="Editar ') &&
      brandsPage.text.includes('aria-label="Eliminar '),
  );
}

async function productLoadQa() {
  const [adminCookie, customerCookie, operatorCookie] = await Promise.all(
    ["admin", "customer", "operator"].map(account),
  );
  const rows = need(
    await db.from("products").select("id").order("name").limit(1),
    "One existing product, read only",
  );
  assert.equal(rows.length, 1);
  const id = rows[0].id;
  const path = "/api/admin/products/" + id;
  const times = [];
  let payload;
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = performance.now();
    const result = await get(path, adminCookie);
    times.push(Math.round(performance.now() - started));
    check(
      "Targeted product data read " + (attempt + 1) + " completes successfully",
      result.status === 200,
    );
    payload = JSON.parse(result.text);
    check(
      "Response is private and belongs only to requested product " +
        (attempt + 1),
      result.headers.get("cache-control") === "private, no-store" &&
        payload.product.id === id &&
        [...payload.images, ...payload.specs, ...payload.inclusions].every(
          (row) => row.product_id === id,
        ),
    );
  }
  check(
    "Targeted reads complete within the UI timeout",
    times.every((value) => value < 10_000),
  );
  const source = await Promise.all([
    db
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", id),
    db
      .from("product_specs")
      .select("id", { count: "exact", head: true })
      .eq("product_id", id),
    db
      .from("product_inclusions")
      .select("id", { count: "exact", head: true })
      .eq("product_id", id),
  ]);
  check(
    "Loaded image/specification/inclusion counts match existing records",
    source.every((result) => !result.error) &&
      [payload.images, payload.specs, payload.inclusions].every(
        (items, index) => items.length === source[index].count,
      ),
  );
  check(
    "Response omits storage paths, raw queries and credentials",
    !JSON.stringify(payload).includes('"storage_path"') &&
      !JSON.stringify(payload).includes('"service_role"'),
  );
  const selected = await loadProductEditorData(id, {
    request: (url, options) =>
      fetch(origin + url, { ...options, headers: { Cookie: adminCookie } }),
  });
  check(
    "Production client loader receives complete product details over HTTP",
    selected.product.id === id &&
      selected.images.length === payload.images.length &&
      selected.specs.length === payload.specs.length,
  );
  for (const [role, cookie] of [
    ["anonymous", ""],
    ["customer", customerCookie],
    ["operator", operatorCookie],
  ]) {
    const result = await get(path, cookie);
    check(
      "Targeted details denied to " + role,
      result.status === (role === "anonymous" ? 401 : 403) &&
        !result.text.includes('"product":'),
    );
  }
  check(
    "Unknown product returns explicit 404",
    (await get("/api/admin/products/" + randomUUID(), adminCookie)).status ===
      404,
  );
  check(
    "Malformed product ID returns explicit 404",
    (await get("/api/admin/products/not-a-product", adminCookie)).status ===
      404,
  );
  const adminId = need(
    await db
      .from("user_roles")
      .select("user_id")
      .in("user_id", f.users)
      .eq("role", "admin")
      .single(),
    "Identify this run's temporary administrator deterministically",
  ).user_id;
  need(
    await db
      .from("profiles")
      .update({ active: false })
      .eq("id", adminId)
      .select("id"),
    "Disable only this run's temporary admin for ACL check",
  );
  check(
    "Inactive administrator cannot load private details",
    (await get(path, adminCookie)).status === 403,
  );
  need(
    await db
      .from("profiles")
      .update({ active: true })
      .eq("id", adminId)
      .select("id"),
    "Restore only temporary admin before cleanup",
  );
  mkdirSync("docs/products", { recursive: true });
  writeFileSync(
    "docs/products/2026-10-25-load-performance.json",
    JSON.stringify(
      {
        time: new Date().toISOString(),
        mode: "DEV read only, temporary identities removed",
        milliseconds: times,
        counts: {
          images: payload.images.length,
          specs: payload.specs.length,
          inclusions: payload.inclusions.length,
        },
        browser: "NO EJECUTADO",
      },
      null,
      2,
    ) + "\n",
  );
}

async function productSlugQa() {
  const [adminCookie, customerCookie] = await Promise.all(
    ["admin", "customer"].map(account),
  );
  const category = need(
    await db
      .from("categories")
      .insert({
        name: f.marker + " categoría",
        slug: f.slug + "-slugs",
        active: false,
      })
      .select("id")
      .single(),
    "Temporary slug-test category",
  );
  const values = {
    id: "",
    name: f.marker + " Aspersór Élite",
    sku: "QA-BRANDS-" + f.tag,
    model: "",
    kind: "equipment",
    brandId: "",
    categoryId: category.id,
    shortDescription: "",
    description: "",
    regularPrice: "123.45",
    warrantyMonths: "",
    warrantyTerms: "",
    publicationStatus: "draft",
  };
  const page = await get(
    "/admin/catalogo?view=products&product=new",
    adminCookie,
  );
  check(
    "Product form removes the link field, including hidden inputs",
    page.status === 200 &&
      page.text.includes("Código del producto") &&
      !page.text.includes('name="slug"') &&
      !page.text.includes("Nombre en el enlace"),
  );
  async function create(values) {
    const created = await brandAction("saveProductAction", values, adminCookie);
    assert.equal(created.status, "success", created.message);
    assert.match(created.productId, /^[a-f0-9-]{36}$/);
    f.products.push(created.productId);
    journal();
    return need(
      await db
        .from("products")
        .select("*")
        .eq("id", created.productId)
        .single(),
      "Saved temporary product",
    );
  }
  const first = await create(values);
  check(
    "Creating without a slug persists an automatically generated readable link",
    first.slug === generateProductSlug(values.name, values.sku),
  );
  check(
    "Creation preserves code, price, category and draft status",
    first.sku === values.sku &&
      Number(first.regular_price) === 123.45 &&
      first.category_id === category.id &&
      first.publication_status === "draft",
  );
  need(
    await db
      .from("categories")
      .update({ active: true })
      .eq("id", category.id)
      .select("id"),
    "Activate only this run's category for the public-link check",
  );
  const published = await brandAction(
    "saveProductAction",
    { ...values, id: first.id, publicationStatus: "published" },
    adminCookie,
  );
  check(
    "Editing without any slug input succeeds",
    published.status === "success" && published.productId === first.id,
  );
  const publicBefore = need(
    await anon
      .from("catalog_products")
      .select("id,name,sku")
      .eq("slug", first.slug)
      .single(),
    "Public catalog lookup using the generated address",
  );
  check(
    "Generated address resolves to the product in the anonymous public catalog",
    publicBefore.id === first.id &&
      publicBefore.name === values.name &&
      publicBefore.sku === values.sku,
  );
  const saved = await brandAction(
    "saveProductAction",
    {
      ...values,
      id: first.id,
      name: values.name + " renombrado",
      sku: values.sku + "-renombrado",
      slug: "no-aceptar-url-del-cliente",
      publicationStatus: "published",
    },
    adminCookie,
  );
  check(
    "Renaming and changing code still save successfully",
    saved.status === "success" && saved.productId === first.id,
  );
  const renamed = need(
    await db
      .from("products")
      .select("slug,name,sku,regular_price")
      .eq("id", first.id)
      .single(),
    "Renamed temporary product",
  );
  check(
    "Existing link stays stable and a client-supplied slug is ignored",
    renamed.slug === first.slug &&
      renamed.name.endsWith("renombrado") &&
      renamed.sku.endsWith("renombrado") &&
      Number(renamed.regular_price) === 123.45,
  );
  const publicAfter = need(
    await anon
      .from("catalog_products")
      .select("id,name,sku")
      .eq("slug", first.slug)
      .single(),
    "Public catalog lookup after renaming",
  );
  check(
    "The same address still resolves to the renamed product in the public catalog",
    publicAfter.id === first.id &&
      publicAfter.name === renamed.name &&
      publicAfter.sku === renamed.sku,
  );
  const forged = await create({
    ...values,
    sku: values.sku + "-forged",
    slug: "no-aceptar-url-del-cliente",
  });
  check(
    "A new product also ignores a forged client-supplied slug",
    forged.slug === generateProductSlug(values.name, values.sku + "-forged"),
  );
  const pair = await Promise.all([
    create({ ...values, sku: values.sku + "-A B" }),
    create({ ...values, sku: values.sku + "-A-B" }),
  ]);
  const base = generateProductSlug(values.name, values.sku + "-A B");
  check(
    "Concurrent normalized collisions create two products with unique valid links",
    pair[0].slug !== pair[1].slug &&
      pair.some((p) => p.slug === base) &&
      pair.every(
        (p) =>
          p.slug.startsWith(base) &&
          p.slug.length <= 160 &&
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug),
      ),
  );
  const duplicate = await brandAction(
    "saveProductAction",
    { ...values, sku: forged.sku },
    adminCookie,
  );
  check(
    "Duplicate company code is still rejected",
    duplicate.status === "error",
  );
  for (const [role, cookie] of [
    ["customer", customerCookie],
    ["anonymous", ""],
  ]) {
    const denied = await brandAction(
      "saveProductAction",
      { ...values, sku: values.sku + "-denied" },
      cookie,
    );
    check(
      "Automatic generation does not bypass save permissions for " + role,
      denied.status === "error",
    );
  }
  check(
    "Rejected saves create no extra products",
    need(
      await db
        .from("products")
        .select("id")
        .like("sku", values.sku + "%"),
      "Only temporary products",
    ).length === 4,
  );
}

async function productsEditorQa() {
  const [adminCookie, customerCookie, operatorCookie] = await Promise.all(
    ["admin", "customer", "operator"].map(account),
  );
  const category = need(
    await db
      .from("categories")
      .insert({
        name: f.marker + " categoría",
        slug: f.slug + "-products",
        active: false,
      })
      .select("id")
      .single(),
    "Temporary product category",
  );
  const values = {
    id: "",
    name: f.marker + " producto",
    sku: "QA-BRANDS-" + f.tag,
    model: "",
    kind: "agricultural",
    brandId: "",
    categoryId: category.id,
    shortDescription: "",
    description: "",
    regularPrice: "123.45",
    warrantyMonths: "",
    warrantyTerms: "",
    publicationStatus: "draft",
  };
  const page = await get(
    "/admin/catalogo?view=products&product=new",
    adminCookie,
  );
  check(
    "New product direct URL renders the real editor without a manual link field",
    page.status === 200 &&
      page.text.includes("Código del producto") &&
      !page.text.includes("Nombre en el enlace") &&
      page.text.includes('id="editor-producto"'),
  );
  const created = await brandAction("saveProductAction", values, adminCookie);
  check(
    "Product save returns its confirmed ID without changing price",
    created.status === "success" && /^[a-f0-9-]{36}$/.test(created.productId),
  );
  const id = created.productId;
  f.products.push(id);
  f.mediaProducts = [id];
  journal();
  const row = need(
    await db.from("products").select("*").eq("id", id).single(),
    "Created product",
  );
  check(
    "Product values and category persist exactly",
    row.sku === values.sku &&
      row.slug === generateProductSlug(values.name, values.sku) &&
      row.category_id === category.id &&
      Number(row.regular_price) === 123.45 &&
      row.kind === "agricultural",
  );
  const current = await get(
    `/admin/catalogo?view=products&product=${id}&products_q=${encodeURIComponent(values.sku)}`,
    adminCookie,
  );
  check(
    "Product list exposes thumbnail plus Edit/Delete, and selected drawer loads",
    current.status === 200 &&
      current.text.includes('aria-label="Editar ' + values.name) &&
      current.text.includes('aria-label="Eliminar ' + values.name) &&
      current.text.includes("/images/product-placeholder.svg") &&
      current.text.includes("catalog-images-title"),
  );
  check(
    "Product image section precedes product data and main save is in the footer",
    current.text.indexOf('id="catalog-images-title"') <
      current.text.indexOf("Datos del producto") &&
      /<footer[^>]*>[\s\S]*?form="[^"]+"[\s\S]*?Guardar cambios/.test(
        current.text,
      ),
  );
  const classifications =
    current.text.match(/<h3>Marca y categoría<\/h3>[\s\S]*?<\/section>/)?.[0] ??
    "";
  check(
    "Brand and category have one closed trigger each, without separate search inputs",
    (classifications.match(/aria-haspopup="dialog"/g) ?? []).length === 2 &&
      !classifications.includes('type="search"'),
  );
  check(
    "Selected category name resolves even outside its taxonomy list page",
    classifications.includes(category.id) &&
      classifications.includes(f.marker + " categoría"),
  );
  const confirm = { id, expectedName: values.name, confirmation: "delete" };
  for (const [role, cookie] of [
    ["customer", customerCookie],
    ["operator", operatorCookie],
    ["anonymous", ""],
  ]) {
    check(
      "Product delete denied to " + role,
      (await brandAction("deleteProductAction", confirm, cookie)).status ===
        "error",
    );
  }
  check(
    "Delete requires explicit confirmation",
    (
      await brandAction(
        "deleteProductAction",
        { ...confirm, confirmation: "" },
        adminCookie,
      )
    ).status === "error",
  );
  check(
    "Stale product name is rejected",
    (
      await brandAction(
        "deleteProductAction",
        { ...confirm, expectedName: values.name + " obsoleto" },
        adminCookie,
      )
    ).status === "error",
  );
  const spec = need(
    await db
      .from("product_specs")
      .insert({
        product_id: id,
        label: "QA",
        value: "Conservar",
        sort_order: 0,
      })
      .select("id")
      .single(),
    "Temporary specification",
  );
  const blocked = await brandAction(
    "deleteProductAction",
    confirm,
    adminCookie,
  );
  check(
    "Existing FK prevents product deletion with linked details",
    blocked.status === "error" &&
      blocked.message.includes("información vinculada"),
  );
  check(
    "Rejected deletion preserves both product and specification",
    need(
      await db.from("products").select("id").eq("id", id).single(),
      "Preserved fixture product",
    ).id === id &&
      need(
        await db
          .from("product_specs")
          .select("value")
          .eq("id", spec.id)
          .single(),
        "Preserved fixture spec",
      ).value === "Conservar",
  );
  const bytes = await sharp({
    create: { width: 50, height: 50, channels: 3, background: "#1E3A1F" },
  })
    .png()
    .toBuffer();
  const upload = new FormData();
  upload.set("productId", id);
  upload.set("altText", "Fotografía temporal de QA");
  upload.set(
    "image",
    new File([bytes], "qa-product.png", { type: "image/png" }),
  );
  const response = await fetch(origin + "/api/admin/product-images", {
    method: "POST",
    headers: { Origin: origin, Cookie: adminCookie },
    body: upload,
    signal: AbortSignal.timeout(45000),
  });
  const image = await response.json();
  check(
    "Existing upload persists a temporary product photo",
    response.status === 201 &&
      image.status === "recorded" &&
      typeof image.id === "string",
  );
  const previewUrl = origin + "/api/admin/product-images/" + image.id;
  const preview = await fetch(previewUrl, { headers: { Cookie: adminCookie } });
  check(
    "Administrator can preview a draft image with exact PNG bytes",
    preview.status === 200 &&
      preview.headers.get("cache-control") === "private, no-store" &&
      createHash("sha256")
        .update(Buffer.from(await preview.arrayBuffer()))
        .digest("hex") === createHash("sha256").update(bytes).digest("hex"),
  );
  for (const [role, cookie] of [
    ["customer", customerCookie],
    ["operator", operatorCookie],
    ["anonymous", ""],
  ]) {
    const denial = await fetch(previewUrl, { headers: { Cookie: cookie } });
    check(
      "Private draft image denied to " + role,
      denial.status === (role === "anonymous" ? 401 : 403),
    );
  }
  check(
    "Public route cannot expose a draft image",
    (await fetch(origin + "/api/product-images/" + image.id)).status === 404,
  );
  need(
    await db
      .from("product_images")
      .update({ is_primary: true })
      .eq("id", image.id)
      .eq("product_id", id)
      .select("id"),
    "Set only this fixture's cover for thumbnail read QA",
  );
  check(
    "Fixture cover prepared for thumbnail read QA without generating another audit actor",
    true,
    "DEV",
  );
  const withCover = await get(
    `/admin/catalogo?view=products&products_q=${encodeURIComponent(values.sku)}`,
    adminCookie,
  );
  check(
    "List uses the saved primary image thumbnail",
    withCover.status === 200 &&
      withCover.text.includes(`/api/admin/product-images/${image.id}`),
  );
  assert.ok(
    !(
      await db
        .from("product_specs")
        .delete()
        .eq("id", spec.id)
        .eq("product_id", id)
    ).error,
  );
  const imageBlocked = await brandAction(
    "deleteProductAction",
    confirm,
    adminCookie,
  );
  check(
    "Product with an image is protected from implicit media deletion",
    imageBlocked.status === "error",
  );
  const media = need(
    await db
      .from("product_images")
      .select("storage_path")
      .eq("id", image.id)
      .eq("product_id", id)
      .single(),
    "Own temporary media",
  );
  assert.ok(media.storage_path.startsWith(id + "/"));
  assert.ok(
    !(
      await db
        .from("product_images")
        .delete()
        .eq("id", image.id)
        .eq("product_id", id)
    ).error,
  );
  assert.ok(
    !(await db.storage.from("product-images").remove([media.storage_path]))
      .error,
  );
  const deleted = await brandAction(
    "deleteProductAction",
    confirm,
    adminCookie,
  );
  check(
    "Administrator deletes an unlinked fixture product through the server action",
    deleted.status === "success" &&
      !(await db.from("products").select("id").eq("id", id).maybeSingle()).data,
  );
}

let failed;
try {
  if (mode === "--product-slug") await productSlugQa();
  else if (mode === "--product-load") await productLoadQa();
  else if (mode === "--products") await productsEditorQa();
  else if (mode === "--classifications") await classifications();
  else if (mode === "--editor-load") await editorLoad();
  else if (mode === "--unified-save") await unifiedSave();
  else if (mode === "--logo-limits") await imageLimits();
  else {
    const home = await get("/");
    assert.ok(
      home.text.includes("GreenBel") && home.text.includes("/productos"),
      "Correct local application",
    );
    const [adminCookie, operatorCookie, customerCookie] = await Promise.all(
      ["admin", "operator", "customer"].map(account),
    );
    const adminPage = await get(
      "/admin/catalogo?view=brands&brand=new",
      adminCookie,
    );
    check(
      "Administrator sees a separate create editor",
      adminPage.status === 200 && adminPage.text.includes("Crea tu marca"),
    );
    const name = f.marker + " principal";
    await action(
      adminPage.text,
      "name",
      { name, slug: f.slug + "-main" },
      adminCookie,
    );
    const brand = need(
      await db
        .from("brands")
        .select("*")
        .eq("slug", f.slug + "-main")
        .single(),
      "Created brand",
    );
    f.brands.push(brand.id);
    journal();
    check(
      "Create action persists one inactive brand",
      brand.name === name && brand.active === false && brand.logo_path === null,
    );
    await action(
      adminPage.text,
      "name",
      { name, slug: brand.slug },
      adminCookie,
    );
    const duplicate = need(
      await db.from("brands").select("id").eq("slug", brand.slug),
      "Duplicate check",
    );
    check(
      "Repeated creation does not duplicate the brand",
      duplicate.length === 1,
    );
    await action(
      adminPage.text,
      "name",
      { name: f.marker + " forbidden", slug: f.slug + "-forbidden" },
      customerCookie,
    );
    check(
      "Customer cannot execute the brand server action",
      need(
        await db
          .from("brands")
          .select("id")
          .eq("slug", f.slug + "-forbidden"),
        "Forbidden action",
      ).length === 0,
    );
    const selected = await get(
      `/admin/catalogo?view=brands&brand=${brand.id}`,
      adminCookie,
    );
    check(
      "Selected editor survives a direct URL request",
      selected.text.includes("Datos de la marca") &&
        selected.text.includes("Mostrar esta marca en el sitio"),
    );
    const renamed = f.marker + " editada";
    await action(
      selected.text,
      "name",
      { id: brand.id, name: renamed, slug: brand.slug },
      adminCookie,
    );
    check(
      "Edit action persists the brand name",
      need(
        await db.from("brands").select("name").eq("id", brand.id).single(),
        "Renamed brand",
      ).name === renamed,
    );
    const more = need(
      await db
        .from("brands")
        .insert(
          Array.from({ length: 11 }, (_, i) => ({
            name: `${f.marker} ${String(i).padStart(2, "0")}`,
            slug: `${f.slug}-${i}`,
            active: false,
          })),
        )
        .select("id"),
      "Pagination fixtures",
    );
    f.brands.push(...more.map((x) => x.id));
    journal();
    const list = await get(
      `/admin/catalogo?view=brands&brands_q=${f.tag}&brands_size=10&brands_sort=name&brands_dir=asc`,
      adminCookie,
    );
    const body = list.text.match(/<tbody[\s\S]*?<\/tbody>/)?.[0] || "";
    check(
      "Search/page size returns only ten bounded rows",
      [...body.matchAll(/<tr\b/g)].length === 10 &&
        list.text.includes("de <!-- -->12"),
    );
    const page2 = await get(
      `/admin/catalogo?view=brands&brands_q=${f.tag}&brands_size=10&brands_page=2&brands_sort=name&brands_dir=asc`,
      adminCookie,
    );
    const body2 = page2.text.match(/<tbody[\s\S]*?<\/tbody>/)?.[0] || "";
    check(
      "Page two retains query/order and returns two rows",
      [...body2.matchAll(/<tr\b/g)].length === 2 &&
        page2.text.includes(`brands_q=${f.tag}`),
    );
    const activeEmpty = await get(
      `/admin/catalogo?view=brands&brands_q=${f.tag}&brands_filter=true`,
      adminCookie,
    );
    check(
      "Active filter distinguishes no matches",
      !(activeEmpty.text.match(/<tbody[\s\S]*?<\/tbody>/)?.[0] || "").includes(
        "<tr",
      ),
    );
    await publicPair(brand.id, false);
    const activate = await get(
      `/admin/catalogo?view=brands&brand=${brand.id}`,
      adminCookie,
    );
    await action(
      activate.text,
      "active",
      { id: brand.id, active: "true" },
      adminCookie,
    );
    check(
      "Activation persists using the protected action",
      need(
        await db.from("brands").select("active").eq("id", brand.id).single(),
        "Activation",
      ).active,
    );
    await publicPair(brand.id, true);
    const options = await get(
      `/api/admin/lookup?entity=brands&q=${f.tag}`,
      adminCookie,
    );
    const items = JSON.parse(options.text).items;
    check(
      "The same new brand appears in product assignment",
      items.some((i) => i.id === brand.id && i.label === renamed),
    );
    const category = need(
      await db.from("categories").select("id").eq("active", true).limit(1),
      "Existing active category",
    )[0];
    assert.ok(category);
    const product = need(
      await db
        .from("products")
        .insert({
          name: f.marker + " producto",
          sku: "QA-BRANDS-" + f.tag,
          slug: f.slug + "-product",
          kind: "equipment",
          category_id: category.id,
          publication_status: "draft",
        })
        .select("id")
        .single(),
      "Temporary draft product",
    );
    f.products.push(product.id);
    journal();
    const productPage = await get(
      `/admin/catalogo?view=products&product=${product.id}`,
      adminCookie,
    );
    await action(
      productPage.text,
      "sku",
      {
        id: product.id,
        sku: "QA-BRANDS-" + f.tag,
        slug: f.slug + "-product",
        name: f.marker + " producto",
        model: "",
        kind: "equipment",
        brandId: brand.id,
        categoryId: category.id,
        shortDescription: "",
        description: "",
        regularPrice: "",
        warrantyMonths: "",
        warrantyTerms: "",
        publicationStatus: "draft",
      },
      adminCookie,
    );
    check(
      "Product save persists the same brand relation",
      need(
        await db
          .from("products")
          .select("brand_id")
          .eq("id", product.id)
          .single(),
        "Product assignment",
      ).brand_id === brand.id,
    );
    for (const [cookie, label] of [
      [customerCookie, "Customer"],
      [operatorCookie, "Operator"],
      ["", "Anonymous"],
    ]) {
      check(
        label + " cannot upload brand logos",
        (
          await postLogo(
            cookie,
            logoForm(brand.id, "", Buffer.from("not an image")),
          )
        ).status === 403,
      );
      check(
        label + " cannot read administrative previews",
        (await get("/api/admin/brand-logos/" + brand.id, cookie)).status ===
          403,
      );
    }
    check(
      "Foreign origins are denied",
      (
        await postLogo(adminCookie, logoForm(brand.id, "", null), {
          Origin: "https://example.invalid",
        })
      ).status === 403,
    );
    check(
      "Forged image content is rejected",
      (
        await postLogo(
          adminCookie,
          logoForm(
            brand.id,
            "",
            Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
          ),
        )
      ).status === 400,
    );
    check(
      "Oversized actual multipart body is rejected",
      (
        await postLogo(
          adminCookie,
          logoForm(brand.id, "", Buffer.alloc(5_040_000)),
        )
      ).status === 413,
    );
    const png = await sharp({
      create: { width: 320, height: 120, channels: 4, background: "#80BA01" },
    })
      .png()
      .toBuffer();
    if (mode === "--with-logos") {
      const upload = await postLogo(adminCookie, logoForm(brand.id, "", png));
      check(
        "Logo upload persists a normalized private WebP",
        upload.status === 201 && upload.body.status === "recorded",
      );
      let row = need(
        await db.from("brands").select("logo_path").eq("id", brand.id).single(),
        "Logo pointer",
      );
      assert.ok(row.logo_path.startsWith(brand.id + "/"));
      const image = await fetch(origin + "/api/brand-logos/" + brand.id);
      check(
        "Active logo is publicly served through its controlled route",
        image.status === 200 &&
          image.headers.get("content-type") === "image/webp",
      );
      const bytes = Buffer.from(await image.arrayBuffer());
      const stored = need(
        await db.storage.from("brand-logos").download(row.logo_path),
        "Private image",
      );
      check(
        "HTTP bytes match private Storage",
        digest(bytes) === digest(Buffer.from(await stored.arrayBuffer())),
      );
      const direct = await anon.storage
        .from("brand-logos")
        .download(row.logo_path);
      check("Anonymous direct Storage access is denied", !!direct.error);
      const stale = await postLogo(adminCookie, logoForm(brand.id, "", png));
      check(
        "Stale/repeated upload cannot replace the winning image",
        stale.status === 409 &&
          need(
            await db
              .from("brands")
              .select("logo_path")
              .eq("id", brand.id)
              .single(),
            "Stale pointer",
          ).logo_path === row.logo_path,
      );
      const concurrent = await Promise.all([
        postLogo(adminCookie, logoForm(brand.id, row.logo_path, png)),
        postLogo(adminCookie, logoForm(brand.id, row.logo_path, png)),
      ]);
      check(
        "Concurrent replacements accept exactly one winner",
        concurrent.filter((x) => x.status === 201).length === 1 &&
          concurrent.filter((x) => x.status === 409).length === 1,
      );
      row = need(
        await db.from("brands").select("logo_path").eq("id", brand.id).single(),
        "Winning pointer",
      );
      const files = need(
        await db.storage.from("brand-logos").list(brand.id),
        "Remaining image files",
      );
      check(
        "Rejected/old uploads leave only the winning image",
        files.length === 1 && row.logo_path.endsWith(files[0].name),
      );
      const off = await get(
        `/admin/catalogo?view=brands&brand=${brand.id}`,
        adminCookie,
      );
      await action(
        off.text,
        "active",
        { id: brand.id, active: "false" },
        adminCookie,
      );
      check(
        "Inactive brand logo is denied publicly",
        (await get("/api/brand-logos/" + brand.id)).status === 404,
      );
      check(
        "Administrator can preview an inactive brand logo",
        (await get("/api/admin/brand-logos/" + brand.id, adminCookie))
          .status === 200,
      );
      const removed = await postLogo(
        adminCookie,
        logoForm(brand.id, row.logo_path, null, "image/png", "remove"),
      );
      check(
        "Removing a logo preserves brand/product relation",
        removed.status === 200 &&
          need(
            await db
              .from("brands")
              .select("logo_path")
              .eq("id", brand.id)
              .single(),
            "Removed logo",
          ).logo_path === null &&
          need(
            await db
              .from("products")
              .select("brand_id")
              .eq("id", product.id)
              .single(),
            "Preserved product relation",
          ).brand_id === brand.id,
      );
      check(
        "Repeated removal is safe",
        (
          await postLogo(
            adminCookie,
            logoForm(brand.id, row.logo_path, null, "image/png", "remove"),
          )
        ).status === 200,
      );
    }
    const deactivate = await get(
      `/admin/catalogo?view=brands&brand=${brand.id}`,
      adminCookie,
    );
    await action(
      deactivate.text,
      "active",
      { id: brand.id, active: "false" },
      adminCookie,
    );
    await publicPair(brand.id, false);
  }
} catch (error) {
  failed = error;
  console.error("FAIL:", error.message);
} finally {
  try {
    await cleanup();
    const after = await protectedState();
    for (const table of ["profiles", "user_roles"])
      after[table] = after[table].filter(
        (row) =>
          !(f.retainedUsers ?? []).includes(
            table === "profiles" ? row.id : row.user_id,
          ),
      );
    check(
      f.retainedUsers?.length
        ? "Removable fixtures removed; preexisting records unchanged; immutable audit actors retained without access"
        : "All temporary brands/products/accounts removed; preexisting records unchanged",
      digest(after) === digest(baseline),
      "DEV",
    );
  } catch (error) {
    console.error("FAIL cleanup:", error.message);
    failed ||= error;
  }
}
mkdirSync("docs/brands", { recursive: true });
writeFileSync(
  mode === "--product-slug"
    ? "docs/products/2026-10-25-slug-verification.json"
    : mode === "--product-load"
      ? "docs/products/2026-10-25-load-verification.json"
      : mode === "--products"
        ? "docs/brands/product-editor-verification.json"
        : mode === "--classifications"
          ? "docs/brands/classification-verification.json"
          : mode === "--editor-load"
            ? "docs/brands/editor-load-verification.json"
            : mode === "--unified-save"
              ? "docs/brands/unified-save-verification.json"
              : mode === "--logo-limits"
                ? "docs/brands/image-limits-verification.json"
                : "docs/brands/http-verification.json",
  JSON.stringify(
    {
      time: new Date().toISOString(),
      mode,
      origin,
      results,
      failed: failed?.message || null,
      retainedAuditActors: f.retainedUsers?.length ?? 0,
      browser: "NO EJECUTADO: browser automation surface unavailable",
    },
    null,
    2,
  ) + "\n",
);
if (failed) process.exitCode = 1;

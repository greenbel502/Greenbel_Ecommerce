/** DEV-only contacts and cart/PDF verification. Own temporary fixtures; no WhatsApp messages. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
const { encodeReply } = createRequire(import.meta.url)(
  "next/dist/compiled/react-server-dom-webpack/client.node",
);
const e = process.env;
assert.equal(e.APP_ENV, "DEV");
assert.equal(
  new URL(e.DEV_SUPABASE_URL).hostname,
  e.SUPABASE_DEV_PROJECT_REF + ".supabase.co",
);
assert.equal(
  readFileSync("supabase/.temp/project-ref", "utf8").trim(),
  e.SUPABASE_DEV_PROJECT_REF,
);
assert.ok(
  !e.DEV_EMAIL_DELIVERY_MODE || e.DEV_EMAIL_DELIVERY_MODE === "disabled",
);
const origin = "http://localhost:3000",
  db = createClient(e.DEV_SUPABASE_URL, e.DEV_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  anon = createClient(e.DEV_SUPABASE_URL, e.DEV_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const dir = homedir() + "/.codex/private/greenbel-whatsapp-qa";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const journal = dir + "/current.json";
const need = (r, label) => {
  assert.ok(
    !r.error && r.data !== null,
    label + (r.error ? " [" + r.error.code + "]" : ""),
  );
  return r.data;
};
const results = [],
  check = (name, ok) => {
    assert.ok(ok, name);
    results.push({ name, status: "PASS" });
    console.log("PASS:", name);
  };
const digest = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
let f, failed;
const note = () =>
  writeFileSync(journal, JSON.stringify(f, null, 2), { mode: 0o600 });
async function state() {
  return Object.fromEntries(
    await Promise.all(
      [
        "orders",
        "order_items",
        "payments",
        "stock_reservations",
        "inventory_balances",
        "inventory_movements",
        "quotes",
        "quote_items",
        "financing_requests",
        "contact_messages",
        "reviews",
        "products",
        "brands",
        "categories",
      ].map(async (table) => [
        table,
        need(await db.from(table).select("*"), "Baseline " + table).sort(
          (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)),
        ),
      ]),
    ),
  );
}
async function cleanup() {
  const current = need(
    await db
      .from("site_content")
      .select("id,payload,edited_by,updated_at")
      .eq("key", "contact"),
    "Read own contact fixture",
  )[0];
  if (current) {
    if (
      !f.contactRow &&
      f.users.includes(current.edited_by) &&
      current.payload.entries.every((c) => c.label.startsWith(f.marker))
    ) {
      f.contactRow = current.id;
      note();
    }
    assert.equal(current.id, f.contactRow, "Only this run's configuration row");
    assert.ok(
      current.payload.entries.every((c) => c.label.startsWith(f.marker)),
      "Do not remove any user-added contacts",
    );
    need(
      await db
        .from("site_content")
        .delete()
        .eq("id", current.id)
        .eq("updated_at", current.updated_at)
        .select("id"),
      "Remove only own config row",
    );
  }
  for (const id of f.users) {
    const u = need(await db.auth.admin.getUserById(id), "Own account").user;
    assert.equal(u.user_metadata.qa_marker, f.marker);
    assert.ok(u.email.endsWith("@example.invalid"));
    assert.ok(!(await db.from("user_roles").delete().eq("user_id", id)).error);
    assert.ok(!(await db.from("profiles").delete().eq("id", id)).error);
    assert.ok(!(await db.auth.admin.deleteUser(id)).error);
  }
  renameSync(journal, dir + "/completed-" + f.tag + ".json");
}
if (process.argv[2] === "--cleanup") {
  f = JSON.parse(readFileSync(journal));
  assert.match(f.marker, /^QA WhatsApp [a-f0-9]{8}$/);
  await cleanup();
  console.log("PASS: own interrupted fixtures removed");
  process.exit(0);
}
assert.ok(!existsSync(journal), "Finish pending cleanup before a new run");
const previous = need(
  await db.from("site_content").select("id").eq("key", "contact"),
  "Existing contact settings",
);
assert.equal(
  previous.length,
  0,
  "Do not replace real contact settings; this test requires the unconfigured baseline",
);
f = { tag: randomUUID().slice(0, 8), users: [], contactRow: null };
f.marker = "QA WhatsApp " + f.tag;
note();
const baseline = await state();
f.baselineDigest = digest(baseline);
note();
async function account(label, role = "customer") {
  const email = "qa-whatsapp-" + f.tag + "-" + label + "@example.invalid",
    password = randomBytes(30).toString("base64url") + "Aa1!";
  const user = need(
    await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { qa_marker: f.marker },
    }),
    "Temporary Auth identity",
  ).user;
  f.users.push(user.id);
  note();
  if (role !== "customer")
    assert.ok(
      !(await db.from("user_roles").update({ role }).eq("user_id", user.id))
        .error,
    );
  const jar = new Map(),
    client = createServerClient(
      e.DEV_SUPABASE_URL,
      e.DEV_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (items) => items.forEach((i) => jar.set(i.name, i.value)),
        },
      },
    );
  need(
    await client.auth.signInWithPassword({ email, password }),
    "Fixture sign-in",
  );
  return {
    id: user.id,
    client,
    cookie: [...jar]
      .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
      .join("; "),
  };
}
async function get(path, cookie = "") {
  return fetch(origin + path, {
    headers: { Cookie: cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(45000),
  });
}
async function action(name, input, cookie = "") {
  const source = readFileSync(
      ".next/static/chunks/app/admin/contacto/page.js",
      "utf8",
    ),
    matches = [
      ...source.matchAll(
        /createServerReference\)\([^a-f0-9]*([a-f0-9]{40,})[^;]+?\b(saveContactAction|deleteContactAction)\b/g,
      ),
    ],
    ref = matches.find((m) => m[2] === name)?.[1];
  assert.ok(ref, "Compiled " + name);
  const response = await fetch(origin + "/admin/contacto", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Next-Action": ref,
      Accept: "text/x-component",
    },
    body: await encodeReply([input]),
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  const value = text.split("\n").flatMap((line) => {
    try {
      const v = JSON.parse(line.slice(line.indexOf(":") + 1));
      return v && ["success", "error"].includes(v.status) ? [v] : [];
    } catch {
      return [];
    }
  })[0];
  assert.ok(value, "Action result " + name);
  return value;
}
const pdf = (body, customOrigin = origin) =>
  fetch(origin + "/api/cart/whatsapp/pdf", {
    method: "POST",
    headers: { Origin: customOrigin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
let settings = { revision: null, contacts: { version: 1, entries: [] } },
  admin;
async function save(overrides) {
  const r = await action(
    "saveContactAction",
    {
      company: "greenbel",
      kind: "phone",
      label: f.marker,
      value: "+1 202 555 0100",
      primary: true,
      revision: settings.revision,
      ...overrides,
    },
    admin.cookie,
  );
  assert.equal(r.status, "success", r.message);
  settings = r.settings;
  f.contactRow = need(
    await db.from("site_content").select("id").eq("key", "contact"),
    "Own config identity",
  )[0].id;
  note();
  return settings.contacts.entries.at(-1);
}
try {
  const [ad, customer, operator] = await Promise.all([
    account("admin", "admin"),
    account("customer"),
    account("operator", "operator"),
  ]);
  admin = ad;
  const page = await get("/admin/contacto", admin.cookie),
    html = await page.text();
  console.log(
    "CHECK admin page",
    JSON.stringify({
      status: page.status,
      location: page.headers.get("location"),
      cooperative: html.includes("Cooperativa"),
      addPhone: html.includes("Agregar teléfono de GreenBel"),
      errorSnippets: (
        html.match(
          /.{0,40}(?:Error:|digest|not-found|No se pudieron).{0,100}/g,
        ) || []
      ).slice(-6),
    }),
  );
  check(
    "Admin Contacto displays two organizations and add actions",
    page.status === 200 &&
      html.includes("Cooperativa") &&
      html.includes("Agregar teléfono de GreenBel"),
  );
  const products = need(
    await db
      .from("catalog_products")
      .select("id,slug,name,effective_price")
      .not("effective_price", "is", null)
      .limit(3),
    "Public products",
  );
  assert.ok(products.length >= 2);
  const selection = {
    lines: products.slice(0, 2).map((p) => ({ productId: p.id, quantity: 2 })),
  };
  check(
    "Unconfigured WhatsApp blocks continuation instead of using a fictitious fallback",
    (await pdf(selection)).status === 503,
  );
  const initial = {
    company: "greenbel",
    kind: "phone",
    label: f.marker,
    value: "+1 202 555 0100",
    primary: true,
    revision: null,
  };
  for (const [label, user] of [
    ["anonymous", { cookie: "" }],
    ["customer", customer],
    ["operator", operator],
  ])
    check(
      "Contact mutation denied to " + label,
      (await action("saveContactAction", initial, user.cookie)).status ===
        "error",
    );
  const phone = await save({});
  check(
    "Admin saves a normalized international WhatsApp destination",
    phone.value === "12025550100" && phone.primary,
  );
  await save({ kind: "email", value: `public-${f.tag}@example.invalid` });
  await save({
    company: "cooperative",
    kind: "phone",
    value: "+1 202 555 0101",
  });
  await save({
    company: "cooperative",
    kind: "email",
    value: `private-${f.tag}@example.invalid`,
  });
  const publicPage = await get("/contacto"),
    publicHtml = await publicPage.text();
  check(
    "Public contact uses the primary GreenBel phone and email",
    publicHtml.includes("12025550100") &&
      publicHtml.includes(`public-${f.tag}@example.invalid`),
  );
  check(
    "Cooperative contact values are absent from public HTML and serialized props",
    !publicHtml.includes("12025550101") &&
      !publicHtml.includes(`private-${f.tag}@example.invalid`),
  );
  check(
    "Anonymous table access cannot read the private contact payload",
    need(
      await anon.from("site_content").select("payload").eq("key", "contact"),
      "Private CMS RLS",
    ).length === 0,
  );
  const response = await pdf(selection);
  assert.equal(
    response.status,
    200,
    await (response.status !== 200
      ? response.text()
      : Promise.resolve("PDF response")),
  );
  const bytes = Buffer.from(await response.arrayBuffer()),
    url = new URL(response.headers.get("X-Greenbel-WhatsApp-Url"));
  check(
    "Public PDF endpoint returns real PDF bytes and the configured WhatsApp URL",
    bytes.subarray(0, 5).toString() === "%PDF-" &&
      url.origin === "https://wa.me" &&
      url.pathname === "/12025550100" &&
      url.searchParams.get("text").includes("Adjuntaré el PDF"),
  );
  mkdirSync("output/pdf", { recursive: true });
  writeFileSync("output/pdf/seleccion-greenbel-qa.pdf", bytes);
  writeFileSync(
    "docs/commerce/2026-10-25-whatsapp-pdf-expectations.json",
    JSON.stringify(
      {
        names: products.slice(0, 2).map((p) => p.name),
        quantities: [2, 2],
        subtotal:
          Number(
            products
              .slice(0, 2)
              .reduce(
                (s, p) => s + Math.round(Number(p.effective_price) * 100) * 2,
                0,
              ),
          ) / 100,
      },
      null,
      2,
    ),
  );
  check(
    "PDF rejects a foreign origin",
    (await pdf(selection, "https://example.invalid")).status === 403,
  );
  check(
    "Browser-supplied prices cannot replace server prices",
    (await pdf({ ...selection, total: 0 })).status === 400,
  );
  check(
    "Invalid quantity, duplicate lines and missing products are rejected",
    (await pdf({ lines: [{ productId: products[0].id, quantity: 1000 }] }))
      .status === 400 &&
      (await pdf({ lines: [selection.lines[0], selection.lines[0]] }))
        .status === 400 &&
      (await pdf({ lines: [{ productId: randomUUID(), quantity: 1 }] }))
        .status === 409,
  );
  const staleRevision = settings.revision;
  await save({ id: phone.id, value: "+1 202 555 0102" });
  check(
    "Stale admin form cannot overwrite another saved revision",
    (
      await action(
        "saveContactAction",
        {
          ...initial,
          id: phone.id,
          value: "+1 202 555 0103",
          revision: staleRevision,
        },
        admin.cookie,
      )
    ).status === "error",
  );
  const updated = await pdf(selection);
  check(
    "New PDFs immediately use an edited WhatsApp number",
    updated.status === 200 &&
      new URL(updated.headers.get("X-Greenbel-WhatsApp-Url")).pathname ===
        "/12025550102",
  );
  await updated.arrayBuffer();
  if (process.argv[2] === "--hold") {
    f.browserReady = true;
    f.sampleProductSlug = products[0].slug;
    note();
    console.log(
      "BROWSER_READY",
      JSON.stringify({
        productSlug: products[0].slug,
        testDestination: "12025550102",
        releaseFile: dir + "/release-" + f.tag,
      }),
    );
    const until = Date.now() + 600000;
    while (!existsSync(dir + "/release-" + f.tag) && Date.now() < until)
      await new Promise((r) => setTimeout(r, 500));
    assert.ok(
      existsSync(dir + "/release-" + f.tag),
      "Browser QA release before cleanup deadline",
    );
  }
  await save({ value: "+1 202 555 0104", primary: false });
  const denied = await action(
    "deleteContactAction",
    { id: phone.id, revision: settings.revision, confirmation: "" },
    admin.cookie,
  );
  check(
    "Deleting a contact requires explicit confirmation",
    denied.status === "error",
  );
  const removed = await action(
    "deleteContactAction",
    { id: phone.id, revision: settings.revision, confirmation: "delete" },
    admin.cookie,
  );
  assert.equal(removed.status, "success", removed.message);
  settings = removed.settings;
  check(
    "Deleting the primary number closes the handoff rather than silently selecting a secondary/cooperative number",
    (await pdf(selection)).status === 503,
  );
  for (const [path, method] of [
    ["/api/checkout/options", "GET"],
    ["/api/checkout/review", "GET"],
    ["/api/checkout/review", "POST"],
    ["/api/checkout/confirm", "POST"],
  ])
    check(
      "Paused checkout API " + method + " " + path,
      (
        await fetch(origin + path, {
          method,
          headers: { Origin: origin, "Content-Type": "application/json" },
          ...(method === "POST" ? { body: "{}" } : {}),
        })
      ).status === 410,
    );
  const checkout = await get("/checkout");
  const checkoutHtml = await checkout.text();
  check(
    "Old checkout route returns customers to the cart",
    ([307, 308].includes(checkout.status) &&
      checkout.headers.get("location") === "/carrito") ||
      (checkout.status === 200 &&
        /<meta[^>]+http-equiv="refresh"[^>]+content="1;url=\/carrito"/.test(
          checkoutHtml,
        )),
  );
  const policy = need(
    await db
      .from("checkout_settings")
      .select(
        "online_reservation_minutes,offline_review_hours,simulated_gateway_enabled",
      )
      .eq("id", true)
      .single(),
    "Paused DB policy",
  );
  check(
    "Existing database policy closes both online/offline reservation paths",
    policy.online_reservation_minutes === null &&
      policy.offline_review_hours === null &&
      !policy.simulated_gateway_enabled,
  );
} catch (error) {
  failed = error;
  console.error("FAIL:", error.message);
} finally {
  try {
    await cleanup();
    check(
      "Temporary contacts/accounts removed and all original business data preserved",
      digest(await state()) === digest(baseline),
    );
  } catch (error) {
    failed ??= error;
    console.error("FAIL cleanup:", error.message);
  }
}
writeFileSync(
  "docs/commerce/2026-10-25-whatsapp-http-verification.json",
  JSON.stringify(
    {
      time: new Date().toISOString(),
      results,
      failed: failed?.message ?? null,
    },
    null,
    2,
  ) + "\n",
);
if (failed) process.exitCode = 1;

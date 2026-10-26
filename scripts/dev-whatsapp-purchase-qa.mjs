import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
const e = process.env;
assert.equal(e.APP_ENV, "DEV");
assert.equal(
  new URL(e.DEV_SUPABASE_URL).hostname,
  e.SUPABASE_DEV_PROJECT_REF + ".supabase.co",
);
assert.equal(
  fs.readFileSync("supabase/.temp/project-ref", "utf8").trim(),
  e.SUPABASE_DEV_PROJECT_REF,
);
const db = createClient(e.DEV_SUPABASE_URL, e.DEV_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  origin = "http://localhost:3000";
const dir = os.homedir() + "/.codex/private/greenbel-purchase-qa";
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const journal = dir + "/current.json";
const need = (r) => {
  assert.ok(!r.error, r.error?.code);
  return r.data;
};
async function baseline() {
  const data = {};
  for (const table of [
    "products",
    "brands",
    "categories",
    "orders",
    "order_items",
    "payments",
    "inventory_balances",
    "inventory_movements",
    "quotes",
    "quote_items",
    "contact_messages",
    "financing_requests",
    "site_content",
  ])
    data[table] = need(await db.from(table).select("*")).sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
let f;
if (process.argv.includes("--cleanup")) {
  f = JSON.parse(fs.readFileSync(journal));
  const user = need(await db.auth.admin.getUserById(f.id)).user;
  assert.equal(user.user_metadata.qa_marker, f.marker);
  assert.equal(user.email, f.email);
  assert.equal(await baseline(), f.baseline);
  need(
    await db.from("user_roles").delete().eq("user_id", f.id).select("user_id"),
  );
  need(await db.from("profiles").delete().eq("id", f.id).select("id"));
  need(await db.auth.admin.deleteUser(f.id));
  assert.equal(await baseline(), f.baseline);
  fs.renameSync(journal, dir + "/completed-" + f.tag + ".json");
  fs.writeFileSync(
    "docs/commerce/2026-10-25-purchase-cleanup.json",
    JSON.stringify(
      {
        status: "PASS",
        ownQaAccountRemoved: true,
        businessDataUnchanged: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("PASS: own QA account removed; business data unchanged");
  process.exit(0);
}
assert.ok(
  !fs.existsSync(journal),
  "Clean previous fixtures before another run",
);
f = {
  tag: randomUUID().slice(0, 8),
  password: randomBytes(24).toString("base64url") + "Aa1!",
  baseline: await baseline(),
};
f.marker = "QA purchase " + f.tag;
f.email = "qa-purchase-" + f.tag + "@example.invalid";
const note = () =>
  fs.writeFileSync(journal, JSON.stringify(f, null, 2), { mode: 0o600 });
note();
const user = need(
  await db.auth.admin.createUser({
    email: f.email,
    password: f.password,
    email_confirm: true,
    user_metadata: { qa_marker: f.marker, display_name: f.marker },
  }),
).user;
f.id = user.id;
note();
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
  await client.auth.signInWithPassword({
    email: f.email,
    password: f.password,
  }),
);
f.cookie = [...jar]
  .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
  .join("; ");
note();
const product = need(
  await db.from("products").select("id").eq("sku", "FUT1023").single(),
);
f.productId = product.id;
note();
const post = (data, cookie = f.cookie, source = origin) =>
  fetch(origin + "/api/cart/whatsapp/pdf", {
    method: "POST",
    headers: {
      Origin: source,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
    redirect: "manual",
    signal: AbortSignal.timeout(45000),
  });
const body = {
  lines: [{ productId: f.productId, quantity: 2 }],
  preferences: { paymentMethod: "transfer", deliveryMethod: "home_delivery" },
};
const results = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  results.push({ name, status: "PASS" });
  console.log("PASS:", name);
};
try {
  check(
    "anonymous endpoint access denied",
    (await post(body, "")).status === 401,
  );
  check(
    "foreign origin rejected",
    (await post(body, f.cookie, "https://evil.invalid")).status === 403,
  );
  check(
    "both preferences required",
    (await post({ lines: body.lines })).status === 400,
  );
  check(
    "unknown preferences rejected",
    (
      await post({
        ...body,
        preferences: { ...body.preferences, paymentMethod: "online_gateway" },
      })
    ).status === 400,
  );
  check(
    "client-selected identity rejected",
    (await post({ ...body, userId: f.id })).status === 400,
  );
  const response = await post(body);
  check(
    "active authenticated account receives PDF",
    response.status === 200 &&
      response.headers.get("content-type").startsWith("application/pdf"),
  );
  const url = new URL(response.headers.get("X-Greenbel-WhatsApp-Url")),
    message = url.searchParams.get("text");
  check(
    "message includes server product total and both choices",
    message.includes("Q 166.50") &&
      message.includes("Transferencia") &&
      message.includes("Envío a domicilio"),
  );
  fs.mkdirSync("output/pdf", { recursive: true });
  fs.writeFileSync(
    "output/pdf/seleccion-greenbel-verificacion.pdf",
    Buffer.from(await response.arrayBuffer()),
  );
  const pickup = await post({
    ...body,
    preferences: { paymentMethod: "cash", deliveryMethod: "pickup" },
  });
  check(
    "cash and pickup produce a corresponding message",
    pickup.status === 200 &&
      new URL(pickup.headers.get("X-Greenbel-WhatsApp-Url")).searchParams
        .get("text")
        .includes("Forma de pago: Efectivo"),
  );
  need(
    await db
      .from("profiles")
      .update({ active: false })
      .eq("id", f.id)
      .select("id"),
  );
  check(
    "inactive account cannot prepare a purchase",
    (await post(body)).status === 403,
  );
  need(
    await db
      .from("profiles")
      .update({ active: true })
      .eq("id", f.id)
      .select("id"),
  );
  check(
    "no order, payment, stock, consultation or settings changes",
    (await baseline()) === f.baseline,
  );
  fs.writeFileSync(
    "docs/commerce/2026-10-25-purchase-http.json",
    JSON.stringify({ status: "PASS", results }, null, 2) + "\n",
  );
  console.log(
    "Fixture ready for browser QA; credentials remain in private journal.",
  );
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
}

import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";
const e = process.env,
  origin = "http://localhost:3000";
assert.equal(e.APP_ENV, "DEV");
assert.equal(
  new URL(e.DEV_SUPABASE_URL).hostname,
  e.SUPABASE_DEV_PROJECT_REF + ".supabase.co",
);
assert.equal(
  readFileSync("supabase/.temp/project-ref", "utf8").trim(),
  e.SUPABASE_DEV_PROJECT_REF,
);
const db = createClient(e.DEV_SUPABASE_URL, e.DEV_SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(e.DEV_SUPABASE_URL, e.DEV_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const results = [],
  check = (name, ok) => {
    assert.ok(ok, name);
    results.push({ name, status: "PASS" });
    console.log("PASS:", name);
  };
const dir = homedir() + "/.codex/private/greenbel-gmail-qa";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const journal = dir + "/current.json";
const post = (path, data, headers = {}) =>
  fetch(origin + path, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
    redirect: "manual",
  });
const payload = {
  idempotencyKey: randomUUID(),
  name: "QA Gmail validation",
  email: "qa-greenbel@example.invalid",
  phone: "+50200000000",
  type: "Solicitar asesoría",
  product: "QA-GMAIL",
  message: "Prueba técnica controlada de notificación Gmail.",
};
const need = (r) => {
  assert.ok(!r.error, r.error?.code);
  return r.data;
};
const digest = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
async function protectedState() {
  return Object.fromEntries(
    await Promise.all(
      [
        "orders",
        "order_items",
        "payments",
        "inventory_balances",
        "inventory_movements",
        "quotes",
        "quote_items",
        "financing_requests",
        "products",
        "brands",
        "categories",
      ].map(async (t) => [
        t,
        need(await db.from(t).select("*")).sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b)),
        ),
      ]),
    ),
  );
}
let error;
try {
  check(
    "Private Gmail token RPC denies anonymous access",
    !!(await anon.rpc("gmail_connection_read")).error,
  );
  check(
    "Private Gmail queue RPC denies anonymous access",
    !!(
      await anon.rpc("gmail_notification_claim", {
        p_contact_id: randomUUID(),
        p_retry: false,
      })
    ).error,
  );
  check(
    "Anonymous visitor can open the existing contact form",
    (await (await fetch(origin + "/contacto")).text()).includes(
      "Registrar consulta",
    ),
  );
  check(
    "OAuth connection requires admin authentication",
    (await post("/api/integrations/gmail/connect", {})).status === 401,
  );
  check(
    "OAuth connection rejects foreign origin",
    (
      await post(
        "/api/integrations/gmail/connect",
        {},
        { Origin: "https://evil.invalid" },
      )
    ).status === 403,
  );
  check(
    "Notification retry requires admin authentication",
    (await post("/api/integrations/gmail/retry", { contactId: randomUUID() }))
      .status === 401,
  );
  check(
    "Invalid email is rejected",
    (await post("/api/contacto", { ...payload, email: "invalid" })).status ===
      400,
  );
  check(
    "Honeypot blocks automated submissions",
    (
      await post("/api/contacto", {
        ...payload,
        website: "https://spam.invalid",
      })
    ).status === 400,
  );
  check(
    "Visitor cannot choose a notification recipient",
    (
      await post("/api/contacto", {
        ...payload,
        to: "arbitrary@example.invalid",
      })
    ).status === 400,
  );
  check(
    "Contact endpoint rejects a foreign origin",
    (await post("/api/contacto", payload, { Origin: "https://evil.invalid" }))
      .status === 403,
  );
  check(
    "Contact body byte limit is enforced",
    (await post("/api/contacto", { ...payload, message: "x".repeat(9000) }))
      .status === 413,
  );
  if (process.argv.includes("--send-test")) {
    const connection = need(await db.rpc("gmail_connection_read"));
    assert.equal(
      connection?.status,
      "connected",
      "Authorize Gmail before the one real test",
    );
    const baseline = await protectedState();
    let f = existsSync(journal)
      ? JSON.parse(readFileSync(journal, "utf8"))
      : { tag: randomUUID().slice(0, 8), idempotencyKey: randomUUID() };
    const data = {
      ...payload,
      idempotencyKey: f.idempotencyKey,
      name: "QA Gmail GreenBel " + f.tag,
      message:
        "Prueba técnica autorizada del formulario de GreenBel.\nContenido completo: <etiqueta> & acentos áéíóú.\nReferencia QA: " +
        f.tag,
    };
    f.payload = data;
    writeFileSync(journal, JSON.stringify(f, null, 2), { mode: 0o600 });
    const saved = await post("/api/contacto", data);
    check(
      "Anonymous valid consultation is confirmed by persistence",
      [200, 201].includes(saved.status) &&
        (await saved.json()).status === "recorded",
    );
    const contact = need(
      await db
        .from("contact_messages")
        .select(
          "id,name,email,phone,inquiry_type,product,message,notification_status,created_at",
        )
        .eq("idempotency_key", f.idempotencyKey)
        .single(),
    );
    f.contactId = contact.id;
    f.createdAt = contact.created_at;
    writeFileSync(journal, JSON.stringify(f, null, 2), { mode: 0o600 });
    check(
      "Supabase contains the complete registered consultation",
      contact.name === data.name &&
        contact.email === data.email &&
        contact.phone === data.phone &&
        contact.inquiry_type === data.type &&
        contact.product === data.product &&
        contact.message === data.message,
    );
    let jobs = [];
    for (let i = 0; i < 45; i++) {
      jobs = need(
        await db.rpc("gmail_notification_status", {
          p_contact_ids: [contact.id],
        }),
      );
      if (["sent", "failed", "unknown"].includes(jobs[0]?.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    f.notification = jobs[0];
    writeFileSync(journal, JSON.stringify(f, null, 2), { mode: 0o600 });
    check(
      "Gmail API accepted one real notification",
      jobs[0]?.status === "sent",
    );
    const sentId = jobs[0].provider_message_id;
    check(
      "A repeated browser submission is idempotent",
      (await post("/api/contacto", data)).status === 200,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    const again = need(
      await db.rpc("gmail_notification_status", {
        p_contact_ids: [contact.id],
      }),
    )[0];
    check(
      "Repeat does not create another send attempt",
      again.attempts === 1 && again.provider_message_id === sentId,
    );
    check(
      "Changed data with an existing key is rejected",
      (
        await post("/api/contacto", {
          ...data,
          message: data.message + " Changed",
        })
      ).status === 409,
    );
    check(
      "Unrelated business data is unchanged",
      digest(await protectedState()) === digest(baseline),
    );
    writeFileSync(
      "docs/gmail/2026-10-25-real-send.json",
      JSON.stringify(
        {
          contactId: contact.id,
          name: contact.name,
          createdAt: contact.created_at,
          gmailMessageId: sentId,
          attempts: again.attempts,
          notificationStatus: again.status,
          replyTo: data.email,
          sender: e.GMAIL_SENDER_DEV_EMAIL,
          recipient: e.GMAIL_NOTIFICATION_DEV_EMAIL,
          receiptVerified: false,
        },
        null,
        2,
      ),
    );
    console.log(
      "MAIL_REFERENCE",
      JSON.stringify({
        contactId: contact.id,
        subject: "Greenbel | Nueva consulta de " + contact.name,
        gmailMessageId: sentId,
      }),
    );
  }
} catch (err) {
  error = err.message;
  console.error("FAIL:", error);
}
writeFileSync(
  "docs/gmail/2026-10-25-http-results.json",
  JSON.stringify({ results, error }, null, 2),
);
if (error) process.exitCode = 1;

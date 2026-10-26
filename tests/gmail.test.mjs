import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
const require = createRequire(import.meta.url),
  Module = require("module"),
  load = Module._load;
for (const ext of [".ts", ".tsx"])
  require.extensions[ext] = (m, p) =>
    m._compile(
      ts.transpileModule(readFileSync(p, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
      p,
    );
const realGoogle = require("googleapis/build/src/apis/gmail");
const id = "11111111-1111-4111-8111-111111111111",
  actor = "22222222-2222-4222-8222-222222222222",
  attempt = "33333333-3333-4333-8333-333333333333";
let active = {
    appEnvironment: "DEV",
    appUrl: "http://localhost:3000",
    supabase: { url: "https://qa.supabase.co" },
  },
  calls,
  job,
  sendError,
  refreshError,
  finishErrors,
  saveResult,
  scheduled,
  afterThrows,
  denied,
  callbackCookie;
let deliverMode = false,
  connection;
const repo = {
  claimContactNotification: async () => {
    calls.push("claim");
    if (!["pending", "failed"].includes(job)) return null;
    job = "sending";
    return { attempt_id: attempt, contact };
  },
  readGmailConnection: async () => connection,
  finishContactNotification: async (_id, _attempt, status, messageId, code) => {
    calls.push({ finish: status, messageId, code });
    if (finishErrors-- > 0) throw Error("database write uncertain");
    job = status;
  },
  requireGmailReconnect: async () => {
    calls.push("reconnect");
  },
  saveGmailConnection: async (value) => {
    calls.push({ connectionSaved: value });
  },
};
Module._load = function (request, parent, main) {
  if (request === "server-only") return {};
  if (request === "next/headers")
    return {
      cookies: async () => ({
        get: () => (callbackCookie ? { value: callbackCookie } : undefined),
      }),
    };
  if (request === "@/lib/server/environment")
    return { getActiveEnvironment: () => active };
  if (
    request === "./repository" &&
    parent?.filename.endsWith("/gmail/deliver.ts")
  )
    return repo;
  if (request === "./oauth" && parent?.filename.endsWith("/gmail/deliver.ts"))
    return {
      gmailOAuth: () => ({
        setCredentials: () => {},
        getAccessToken: async () => {
          calls.push("refresh");
          if (refreshError) throw refreshError;
          return { token: "not-a-real-token" };
        },
      }),
    };
  if (request === "googleapis/build/src/apis/gmail" && deliverMode)
    return {
      ...realGoogle,
      gmail: () => ({
        users: {
          messages: {
            send: async (params, options) => {
              calls.push({ send: params, options });
              if (sendError) throw sendError;
              return { data: { id: "gmail_message_1" } };
            },
          },
        },
      }),
    };
  if (request === "@/lib/supabase/admin")
    return {
      createSupabaseAdminClient: () => ({
        rpc: () => ({ single: async () => saveResult }),
      }),
    };
  if (request === "@/lib/server/public-submission")
    return {
      isAllowedSubmissionOrigin: (r) =>
        r.headers.get("origin") === "http://localhost:3000",
      abuseSourceHash: () => "a".repeat(64),
      readLimitedBody: async (r, max) => {
        const s = await r.text();
        return Buffer.byteLength(s) > max ? null : s;
      },
    };
  if (request === "next/server") {
    const real = load.call(this, request, parent, main);
    return {
      ...real,
      after: (fn) => {
        if (afterThrows) throw Error("after unavailable");
        scheduled.push(fn);
      },
    };
  }
  if (request === "@/lib/server/staff-authorization")
    return {
      requireStaffActor: async () => {
        if (denied) throw new StaffAuthorizationError(denied);
        return { userId: actor, role: "admin" };
      },
      StaffAuthorizationError,
    };
  if (request.startsWith("@/"))
    return load.call(
      this,
      process.cwd() + "/src/" + request.slice(2),
      parent,
      main,
    );
  return load.call(this, request, parent, main);
};
class StaffAuthorizationError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}
Object.assign(process.env, {
  GOOGLE_GMAIL_CLIENT_ID: "qa.apps.googleusercontent.com",
  GOOGLE_GMAIL_CLIENT_SECRET: "qa-client-secret",
  GOOGLE_GMAIL_REDIRECT_URI:
    "http://localhost:3000/api/integrations/gmail/callback",
  GMAIL_SENDER_EMAIL: "sender@example.invalid",
  GMAIL_NOTIFICATION_EMAIL: "owner@example.invalid",
  GMAIL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
});
const { gmailConfig, GMAIL_SCOPE } = require("../src/lib/gmail/config.ts");
const { seal, unseal } = require("../src/lib/gmail/crypto.ts");
const {
  prepareGmailAuthorization,
  validateGmailState,
} = require("../src/lib/gmail/oauth.ts");
const { buildContactMime } = require("../src/lib/gmail/message.ts");
const {
  renderContactContent,
} = require("../src/lib/gmail/contact-template.ts");
deliverMode = true;
const {
  deliverContactNotification,
  classifyGmailFailure,
} = require("../src/lib/gmail/deliver.ts");
const { POST: postContact } = require("../src/app/api/contacto/route.ts");
// Avoid any live token read in administrative route tests.
const repoFile = require.resolve("../src/lib/gmail/repository.ts");
require.cache[repoFile] = {
  id: repoFile,
  filename: repoFile,
  loaded: true,
  exports: repo,
};
const {
  POST: connect,
} = require("../src/app/api/integrations/gmail/connect/route.ts");
const contact = {
  id,
  name: "María López",
  email: "client@example.invalid",
  phone: "+50200000000",
  inquiry_type: "Solicitar asesoría",
  product: "QA-123",
  message: 'Mensaje completo\n<script>bad()</script> & "prueba"',
  created_at: "2026-10-26T01:00:00.000Z",
};
beforeEach(() => {
  calls = [];
  job = "pending";
  sendError = null;
  refreshError = null;
  finishErrors = 0;
  scheduled = [];
  afterThrows = false;
  denied = null;
  saveResult = { data: { contact_id: id, repeated: false }, error: null };
  const c = gmailConfig();
  connection = {
    status: "connected",
    sender_email: c.senderEmail,
    client_fingerprint: c.clientFingerprint,
    scopes: [GMAIL_SCOPE],
    revision: actor,
    refresh_token_ciphertext: seal(
      "qa-refresh",
      c.encryptionKey,
      c.tokenContext,
    ),
  };
});
const request = (data, options = {}) =>
  new Request("http://localhost:3000/api/contacto", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: JSON.stringify(data),
  });
const input = () => ({
  idempotencyKey: actor,
  name: contact.name,
  email: contact.email,
  phone: contact.phone,
  type: contact.inquiry_type,
  product: contact.product,
  message: contact.message,
});
const silence = async (fn) => {
  const old = console.error;
  const logs = [];
  console.error = (...x) => logs.push(x);
  try {
    return { value: await fn(), logs };
  } finally {
    console.error = old;
  }
};

test("tokens use authenticated encryption, different nonces and account/environment binding", () => {
  const c = gmailConfig(),
    v = seal("secreto-ñ", c.encryptionKey, c.tokenContext);
  assert.equal(unseal(v, c.encryptionKey, c.tokenContext), "secreto-ñ");
  assert.notEqual(v, seal("secreto-ñ", c.encryptionKey, c.tokenContext));
  assert.throws(() => unseal(v, c.encryptionKey, "other-environment"));
  assert.throws(() => unseal(v, Buffer.alloc(32, 8), c.tokenContext));
  assert.throws(() =>
    unseal(v.slice(0, -5) + "xxxxx", c.encryptionKey, c.tokenContext),
  );
});
test("OAuth requests only send permission, offline consent and PKCE; state is session-bound and expires", () => {
  const c = gmailConfig(),
    f = prepareGmailAuthorization(c, actor, null),
    url = new URL(f.url);
  assert.equal(url.searchParams.get("scope"), GMAIL_SCOPE);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("prompt"), /consent/);
  assert.equal(url.searchParams.get("include_granted_scopes"), "false");
  assert.ok(!f.cookie.includes(actor));
  const s = validateGmailState(
    c,
    f.cookie,
    url.searchParams.get("state"),
    actor,
  );
  assert.throws(() => validateGmailState(c, f.cookie, "wrong", actor));
  assert.throws(() => validateGmailState(c, f.cookie, s.state, id));
  assert.throws(() =>
    validateGmailState(c, f.cookie, s.state, actor, s.issuedAt + 600001),
  );
});
test("configuration rejects a cross-origin callback and invalid encryption key", () => {
  const original = process.env.GOOGLE_GMAIL_REDIRECT_URI;
  process.env.GOOGLE_GMAIL_REDIRECT_URI =
    "https://evil.invalid/api/integrations/gmail/callback";
  assert.throws(gmailConfig);
  process.env.GOOGLE_GMAIL_REDIRECT_URI = original;
  const k = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "weak";
  assert.throws(gmailConfig);
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = k;
});
test("MIME has fixed From/To, client Reply-To, complete fields, escaped HTML and stable reference", () => {
  const c = gmailConfig(),
    mime = buildContactMime(contact, c.senderEmail, c.notificationEmail);
  assert.match(mime, /From: GreenBel <sender@example.invalid>/);
  assert.match(mime, /To: <owner@example.invalid>/);
  assert.match(mime, /Reply-To: <client@example.invalid>/);
  assert.match(mime, new RegExp(`Message-ID: <contact-${id}@greenbel.gt>`));
  const bodies = [
    ...mime.matchAll(
      /Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g,
    ),
  ].map((m) => Buffer.from(m[1].replace(/\s/g, ""), "base64").toString());
  assert.equal(bodies.length, 3);
  for (const s of [
    contact.name,
    contact.email,
    contact.phone,
    contact.product,
    contact.inquiry_type,
    contact.message,
    id,
  ])
    assert.ok(bodies[0].includes(s), s);
  assert.ok(bodies[1].includes("&lt;script&gt;"));
  assert.ok(!bodies[1].includes("<script>"));
  assert.match(mime, /Content-Type: multipart\/related/);
  assert.match(mime, /Content-ID: <greenbel-contact-logo>/);
  assert.match(bodies[1], /src="cid:greenbel-contact-logo"/);
  const image = [
    ...mime.matchAll(
      /Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g,
    ),
  ][2];
  assert.deepEqual(
    Buffer.from(image[1].replace(/\s/g, ""), "base64"),
    readFileSync("public/images/brand/greenbel-email.png"),
  );
  assert.throws(() =>
    buildContactMime(
      { ...contact, name: "name\r\nBcc: victim@example.invalid" },
      c.senderEmail,
      c.notificationEmail,
    ),
  );
  assert.throws(() =>
    buildContactMime(
      { ...contact, email: "a@example.invalid\r\nCc:b@example.invalid" },
      c.senderEmail,
      c.notificationEmail,
    ),
  );
});
test("new contact template omits the removed product field and preserves multiline messages", () => {
  const content = renderContactContent({
    ...contact,
    product: null,
    message: "Primera línea\n<etiqueta> & segunda línea",
  });
  assert.ok(!content.text.includes("Producto:"));
  assert.ok(!content.html.includes(">Producto<"));
  assert.ok(
    content.html.includes(
      "Primera línea<br>&lt;etiqueta&gt; &amp; segunda línea",
    ),
  );
  assert.match(
    content.html,
    /href="mailto:client@example.invalid\?subject=Re%3A/,
  );
  assert.match(content.html, /max-width:640px/);
});
test("anonymous registration accepts the new form payload without a product", async () => {
  const data = input();
  delete data.product;
  const response = await postContact(request(data));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).status, "recorded");
  assert.equal(scheduled.length, 1);
});
test("successful delivery calls Gmail once with configured mailbox and disables transport retries", async () => {
  assert.equal(await deliverContactNotification(id), "sent");
  const sent = calls.filter((x) => x?.send);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].send.userId, "sender@example.invalid");
  assert.equal(sent[0].options.retry, false);
  assert.match(
    Buffer.from(sent[0].send.requestBody.raw, "base64url").toString(),
    /To: <owner@example.invalid>/,
  );
  assert.equal(job, "sent");
});
test("an already sent delivery is not claimed or sent again", async () => {
  job = "sent";
  assert.equal(await deliverContactNotification(id, true), "not_claimed");
  assert.equal(calls.filter((x) => x?.send).length, 0);
});
test("an explicit Gmail rejection is recorded as failed without touching the contact", async () => {
  sendError = { response: { status: 429, data: { secret: "must-not-log" } } };
  const r = await silence(() => deliverContactNotification(id));
  assert.equal(r.value, "failed");
  assert.equal(job, "failed");
  assert.ok(!JSON.stringify(r.logs).includes("must-not-log"));
});
test("lost/5xx send outcomes become unknown and cannot be automatically resent", async () => {
  sendError = { response: { status: 503 } };
  await silence(async () => {
    assert.equal(await deliverContactNotification(id), "unknown");
    assert.equal(await deliverContactNotification(id, true), "not_claimed");
  });
  assert.equal(calls.filter((x) => x?.send).length, 1);
  assert.equal(classifyGmailFailure(Error("timeout"), true).status, "unknown");
});
test("lost database acknowledgement retries the acknowledgement, never Gmail", async () => {
  finishErrors = 1;
  assert.equal(await deliverContactNotification(id), "sent");
  assert.equal(calls.filter((x) => x?.send).length, 1);
  assert.equal(calls.filter((x) => x?.finish).length, 2);
});
test("revoked refresh authorization marks reconnect required before any send", async () => {
  refreshError = {
    response: { status: 400, data: { error: "invalid_grant" } },
  };
  await silence(async () =>
    assert.equal(await deliverContactNotification(id), "failed"),
  );
  assert.ok(calls.includes("reconnect"));
  assert.equal(calls.filter((x) => x?.send).length, 0);
});
test("anonymous valid registration returns a persistence receipt and schedules delivery after response", async () => {
  const r = await postContact(request(input()));
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { status: "recorded" });
  assert.equal(scheduled.length, 1);
  assert.equal(calls.filter((x) => x?.send).length, 0);
  sendError = { response: { status: 403 } };
  await silence(() => scheduled[0]());
  assert.equal(job, "failed");
});
test("invalid input, honeypot and client-selected destinations never schedule a notification", async () => {
  for (const v of [
    { ...input(), email: "not-an-email" },
    { ...input(), website: "https://spam.invalid" },
    { ...input(), to: "victim@example.invalid" },
  ])
    assert.equal((await postContact(request(v))).status, 400);
  assert.equal(scheduled.length, 0);
  assert.equal(
    (
      await postContact(
        request(input(), { headers: { Origin: "https://evil.invalid" } }),
      )
    ).status,
    403,
  );
});
test("failed persistence never schedules delivery; idempotent receipt stays successful", async () => {
  saveResult = { data: null, error: { code: "P0000" } };
  assert.equal((await postContact(request(input()))).status, 503);
  assert.equal(scheduled.length, 0);
  saveResult = { data: { contact_id: id, repeated: true }, error: null };
  assert.equal((await postContact(request(input()))).status, 200);
});
test("background scheduling failure does not turn a saved consultation into a failed record", async () => {
  afterThrows = true;
  await silence(async () => {
    const r = await postContact(request(input()));
    assert.equal(r.status, 201);
    assert.equal((await r.json()).status, "recorded");
  });
});
test("only active administrators can start authorization; origin is checked", async () => {
  for (const role of ["unauthenticated", "forbidden"]) {
    denied = role;
    assert.equal(
      (await connect(request({}))).status,
      role === "unauthenticated" ? 401 : 403,
    );
  }
  denied = null;
  const r = await connect(request({}));
  assert.equal(r.status, 303);
  assert.equal(
    new URL(r.headers.get("location")).searchParams.get("scope"),
    GMAIL_SCOPE,
  );
  const cookie = r.headers.get("set-cookie");
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(cookie.includes("SameSite=lax"));
  assert.ok(!cookie.includes("qa-refresh"));
  assert.equal(
    (
      await connect(
        request({}, { headers: { Origin: "https://evil.invalid" } }),
      )
    ).status,
    403,
  );
});

const {
  GET: callback,
} = require("../src/app/api/integrations/gmail/callback/route.ts");
test("JSON connection handoff exposes only a Google authorization URL and keeps state HttpOnly", async () => {
  const r = await connect(
    request({}, { headers: { Accept: "application/json" } }),
  );
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(
    new URL(data.authorizationUrl).origin,
    "https://accounts.google.com",
  );
  assert.ok(!JSON.stringify(data).includes("qa-client-secret"));
  assert.ok(r.headers.get("set-cookie").includes("HttpOnly"));
});
test("production callback requires HTTPS and produces secure cookies", () => {
  const prior = active,
    uri = process.env.GOOGLE_GMAIL_REDIRECT_URI;
  try {
    active = {
      ...active,
      appEnvironment: "PROD",
      appUrl: "https://green-bel.vercel.app",
    };
    process.env.GOOGLE_GMAIL_REDIRECT_URI =
      "https://green-bel.vercel.app/api/integrations/gmail/callback";
    const c = gmailConfig();
    assert.equal(c.secureCookies, true);
    assert.match(c.tokenContext, /PROD/);
    process.env.GOOGLE_GMAIL_REDIRECT_URI =
      "http://localhost:3000/api/integrations/gmail/callback";
    assert.throws(gmailConfig);
  } finally {
    active = prior;
    process.env.GOOGLE_GMAIL_REDIRECT_URI = uri;
  }
});
test("valid callback encrypts the refresh token and clears state without exposing credentials", async () => {
  const c = gmailConfig(),
    flow = prepareGmailAuthorization(c, actor, actor),
    url = new URL(flow.url);
  callbackCookie = flow.cookie;
  const old = realGoogle.auth.OAuth2.prototype.getToken;
  realGoogle.auth.OAuth2.prototype.getToken = async () => ({
    tokens: {
      refresh_token: "callback-refresh-private",
      access_token: "callback-access-private",
      scope: GMAIL_SCOPE,
    },
  });
  try {
    const r = await callback(
      new Request(
        c.redirectUri + "?code=qa-code&state=" + url.searchParams.get("state"),
      ),
    );
    assert.equal(
      new URL(r.headers.get("location")).searchParams.get("gmail"),
      "connected",
    );
    assert.ok(r.headers.get("set-cookie").includes("Max-Age=0"));
    const saved = calls.find((x) => x?.connectionSaved).connectionSaved;
    assert.equal(
      unseal(saved.ciphertext, c.encryptionKey, c.tokenContext),
      "callback-refresh-private",
    );
    assert.equal(saved.revision, actor);
    assert.ok(
      !(JSON.stringify([...r.headers]) + (await r.text())).includes(
        "callback-refresh-private",
      ),
    );
  } finally {
    realGoogle.auth.OAuth2.prototype.getToken = old;
    callbackCookie = null;
  }
});
test("callback rejects a mismatched state before contacting Google", async () => {
  callbackCookie = prepareGmailAuthorization(gmailConfig(), actor, null).cookie;
  const old = realGoogle.auth.OAuth2.prototype.getToken;
  let invoked = 0;
  realGoogle.auth.OAuth2.prototype.getToken = async () => {
    invoked++;
    throw Error("must not happen");
  };
  try {
    const r = await callback(
      new Request(gmailConfig().redirectUri + "?code=bad&state=wrong"),
    );
    assert.equal(
      new URL(r.headers.get("location")).searchParams.get("gmail"),
      "authorization_failed",
    );
    assert.equal(invoked, 0);
    assert.equal(calls.filter((x) => x?.connectionSaved).length, 0);
  } finally {
    realGoogle.auth.OAuth2.prototype.getToken = old;
    callbackCookie = null;
  }
});
test("callback never persists tokens with inbox-read permissions", async () => {
  const c = gmailConfig(),
    flow = prepareGmailAuthorization(c, actor, null);
  callbackCookie = flow.cookie;
  const old = realGoogle.auth.OAuth2.prototype.getToken;
  realGoogle.auth.OAuth2.prototype.getToken = async () => ({
    tokens: {
      refresh_token: "private",
      access_token: "private",
      scope: GMAIL_SCOPE + " https://www.googleapis.com/auth/gmail.readonly",
    },
  });
  try {
    const r = await callback(
      new Request(
        c.redirectUri +
          "?code=test&state=" +
          new URL(flow.url).searchParams.get("state"),
      ),
    );
    assert.equal(
      new URL(r.headers.get("location")).searchParams.get("gmail"),
      "scope_invalid",
    );
    assert.equal(calls.filter((x) => x?.connectionSaved).length, 0);
  } finally {
    realGoogle.auth.OAuth2.prototype.getToken = old;
    callbackCookie = null;
  }
});

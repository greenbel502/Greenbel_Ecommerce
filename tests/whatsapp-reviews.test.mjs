import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
const require = createRequire(import.meta.url),
  Module = require("module"),
  original = Module._load;
for (const ext of [".ts", ".tsx"])
  require.extensions[ext] = (m, p) =>
    m._compile(
      ts.transpileModule(readFileSync(p, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
      p,
    );
class CustomerProfileError extends Error {
  constructor(status) {
    super("private secret");
    this.status = status;
  }
}
const id = "11111111-1111-4111-8111-111111111111";
let authError, denied, response, calls, revalidated;
const client = {
  rpc: async (name, args) => {
    calls.push({ name, args });
    return response;
  },
};
Module._load = function (r, p, m) {
  if (r === "server-only") return {};
  if (r === "next/cache")
    return { revalidatePath: (path) => revalidated.push(path) };
  if (r === "@/lib/server/customer-profile")
    return {
      CustomerProfileError,
      requireCustomerProfile: async () => {
        if (authError) throw new CustomerProfileError(authError);
        return { client, user: { id } };
      },
    };
  if (r === "@/lib/server/staff-authorization")
    return {
      requireStaffActor: async () => {
        if (denied) throw Error("private secret");
        return { userId: id };
      },
    };
  if (r === "@/lib/supabase/server")
    return { createSupabaseActionClient: async () => client };
  if (r === "@/lib/supabase/admin")
    return {
      createSupabaseAdminClient: () => {
        throw Error("Unexpected admin access");
      },
    };
  if (r === "@/lib/server/public-submission")
    return {
      isAllowedSubmissionOrigin: (req) =>
        req.headers.get("origin") === "http://localhost:3000",
      readLimitedBody: async (req, max) => {
        const s = await req.text();
        return Buffer.byteLength(s) > max ? null : s;
      },
    };
  if (r.startsWith("@/"))
    return original.call(this, process.cwd() + "/src/" + r.slice(2), p, m);
  return original.call(this, r, p, m);
};
const { POST } = require("../src/app/api/cart/whatsapp/reviews/route.ts");
const { moderateReviewAction } = require("../src/app/admin/resenas/actions.ts");
const {
  whatsAppReviewInput,
  publicReviewerName,
} = require("../src/lib/reviews/validation.ts");
const input = () => ({
  invitationId: id,
  rating: 4,
  comment: "Buena experiencia",
});
const post = (
  body,
  origin = "http://localhost:3000",
  type = "application/json",
) =>
  POST(
    new Request("http://localhost:3000/api/cart/whatsapp/reviews", {
      method: "POST",
      headers: { origin, "content-type": type },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
beforeEach(() => {
  authError = null;
  denied = false;
  calls = [];
  revalidated = [];
  response = { data: id, error: null };
});
test("strict input rejects forged author, moderation, invalid stars and control chars", () => {
  for (const body of [
    { ...input(), customerId: id },
    { ...input(), moderationStatus: "visible" },
    { ...input(), rating: 0 },
    { ...input(), rating: 6 },
    { ...input(), rating: 4.5 },
    { ...input(), comment: " " },
    { ...input(), comment: "\u0001test" },
    { ...input(), comment: "a".repeat(3001) },
  ])
    assert.equal(whatsAppReviewInput.safeParse(body).success, false);
  assert.equal(
    whatsAppReviewInput.safeParse({ ...input(), comment: "Primera\nSegunda" })
      .success,
    true,
  );
});
test("anonymous, inactive and unavailable auth fail before storage", async () => {
  for (const status of [401, 403, 503]) {
    authError = status;
    const r = await post(input());
    assert.equal(r.status, status);
    assert.ok(!(await r.text()).includes("private secret"));
  }
  assert.equal(calls.length, 0);
});
test("CSRF, media type, malformed JSON and excessive input rejected", async () => {
  assert.equal((await post(input(), "https://evil.example")).status, 403);
  assert.equal((await post(input(), undefined, "text/plain")).status, 415);
  assert.equal((await post("{")).status, 400);
  assert.equal((await post("x".repeat(17000))).status, 413);
  assert.equal(calls.length, 0);
});
test("valid review uses session RPC and only server-approved fields", async () => {
  const r = await post({ ...input(), comment: "  Experiencia\nclara  " });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: "saved", id });
  assert.deepEqual(calls, [
    {
      name: "submit_whatsapp_review",
      args: {
        p_invitation_id: id,
        p_rating: 4,
        p_comment: "Experiencia\nclara",
      },
    },
  ]);
  assert.match(r.headers.get("cache-control"), /no-store/);
});
test("foreign invitation, duplicate and quota have safe responses", async () => {
  for (const [code, status] of [
    ["42501", 403],
    ["P4090", 409],
    ["P4290", 429],
    ["PGRST202", 503],
  ]) {
    response = { data: null, error: { code, message: "private secret" } };
    const r = await post(input());
    assert.equal(r.status, status);
    assert.ok(!(await r.text()).includes("private secret"));
  }
});
test("unconfirmed save never emits success", async () => {
  response = { data: null, error: null };
  const r = await post(input());
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes('"saved"'));
});
test("public reviewer name does not leak email or surname", () => {
  assert.equal(publicReviewerName(" Ana Apellido "), "Ana");
  assert.equal(publicReviewerName("persona@example.invalid"), "Cliente");
  assert.equal(publicReviewerName(" "), "Cliente");
});
const form = (overrides = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    id,
    source: "whatsapp",
    expectedStatus: "pending",
    decision: "visible",
    reason: "",
    ...overrides,
  }))
    f.set(k, v);
  return f;
};
test("admin authorization enforced before moderation", async () => {
  denied = true;
  const r = await moderateReviewAction({}, form());
  assert.equal(r.status, "error");
  assert.equal(calls.length, 0);
});
test("admin moderation preserves origin, expected status and safe reasons", async () => {
  const r = await moderateReviewAction({}, form());
  assert.equal(r.status, "success");
  assert.equal(calls[0].name, "moderate_whatsapp_review");
  assert.equal(calls[0].args.p_expected_status, "pending");
  assert.equal(calls[0].args.p_reason, null);
  assert.ok(revalidated.includes("/"));
});
test("forged source or unsupported hiding reason cannot moderate", async () => {
  for (const args of [
    { source: "other" },
    { decision: "hidden", reason: "negative_rating" },
    { expectedStatus: "deleted" },
  ])
    assert.equal((await moderateReviewAction({}, form(args))).status, "error");
  assert.equal(calls.length, 0);
});
test("failed or stale moderation never claims success or refreshes published data", async () => {
  response = {
    data: null,
    error: { code: "P4090", message: "private secret" },
  };
  const r = await moderateReviewAction({}, form());
  assert.equal(r.status, "error");
  assert.ok(!r.message.includes("private secret"));
  assert.equal(revalidated.length, 0);
});

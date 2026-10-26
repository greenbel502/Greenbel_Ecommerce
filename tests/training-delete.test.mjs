import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url),
  Module = require("module"),
  original = Module._load;
for (const ext of [".ts", ".tsx"])
  require.extensions[ext] = (m, file) =>
    m._compile(
      ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true,
        },
      }).outputText,
      file,
    );
const id = "11111111-1111-4111-8111-111111111111",
  actor = "22222222-2222-4222-8222-222222222222",
  fileId = "33333333-3333-4333-8333-333333333333";
let calls, denied, response, cleanupError;
Module._load = function (request, parent, main) {
  if (request === "server-only") return {};
  if (request === "next/cache")
    return { revalidatePath: (path) => calls.push(["revalidate", path]) };
  if (request === "@/lib/server/staff-authorization")
    return {
      requireStaffActor: async (roles) => {
        calls.push(["auth", roles]);
        if (denied) throw Error("forbidden");
        return { userId: actor, role: "admin" };
      },
    };
  if (request === "@/lib/supabase/public") return {};
  if (request === "@/lib/supabase/admin")
    return {
      createSupabaseAdminClient: () => ({
        rpc: async (name, args) => {
          calls.push(["rpc", name, args]);
          return response;
        },
        storage: {
          from: (bucket) => ({
            remove: async (paths) => {
              calls.push(["remove", bucket, paths]);
              return {
                error: cleanupError ? { message: "Storage unavailable" } : null,
              };
            },
          }),
        },
      }),
    };
  if (request.startsWith("@/"))
    return original.call(
      this,
      process.cwd() + "/src/" + request.slice(2),
      parent,
      main,
    );
  return original.call(this, request, parent, main);
};
const {
  deleteTrainingAction,
} = require("../src/app/admin/capacitaciones/actions.ts");
const values = (overrides = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    id,
    expectedName: "Uso del equipo",
    confirmation: "delete",
    actorId: "untrusted",
    ...overrides,
  }))
    f.set(k, v);
  return f;
};
const run = (f = values()) =>
  deleteTrainingAction({ status: "idle", message: "" }, f);
beforeEach(() => {
  calls = [];
  denied = false;
  cleanupError = false;
  response = {
    error: null,
    data: {
      id,
      cover_path: id + "/" + fileId + ".png",
      video_storage_path: id + "/" + fileId + ".mp4",
    },
  };
});
test("delete validates explicit confirmation and current admin before reaching the database", async () => {
  assert.equal((await run(values({ confirmation: "" }))).status, "error");
  assert.equal(calls.length, 0);
  denied = true;
  assert.equal((await run()).status, "error");
  assert.deepEqual(calls, [["auth", ["admin"]]]);
});
test("stale title and failed transaction never remove files or report success", async () => {
  response = { error: { code: "PT409" }, data: null };
  const r = await run();
  assert.equal(r.status, "error");
  assert.match(r.message, /cambió/);
  assert.equal(
    calls.some((c) => c[0] === "remove" || c[0] === "revalidate"),
    false,
  );
});
test("successful delete uses the authenticated actor and cleans only returned owned media after the atomic RPC", async () => {
  assert.equal((await run()).status, "success");
  assert.deepEqual(calls[1], [
    "rpc",
    "admin_delete_training",
    {
      p_training_id: id,
      p_expected_title: "Uso del equipo",
      p_actor_id: actor,
    },
  ]);
  assert.deepEqual(
    calls.filter((c) => c[0] === "remove"),
    [
      ["remove", "training-covers", [id + "/" + fileId + ".png"]],
      ["remove", "training-videos", [id + "/" + fileId + ".mp4"]],
    ],
  );
  assert.ok(
    calls.findIndex((c) => c[0] === "remove") >
      calls.findIndex((c) => c[0] === "rpc"),
  );
  assert.ok(calls.some((c) => c[0] === "revalidate" && c[1] === "/admin"));
});
test("an unexpected deletion result cannot authorize cleanup", async () => {
  response.data.id = actor;
  assert.equal((await run()).status, "error");
  assert.equal(
    calls.some((c) => c[0] === "remove"),
    false,
  );
});
test("storage failure or an unowned media path reports pending cleanup rather than deleting another record's files", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    response.data.cover_path = actor + "/" + fileId + ".png";
    cleanupError = true;
    const r = await run();
    assert.equal(r.status, "success");
    assert.match(r.message, /limpieza de sus archivos está pendiente/);
    assert.equal(calls.filter((c) => c[0] === "remove").length, 1);
    assert.equal(calls.find((c) => c[0] === "remove")[1], "training-videos");
  } finally {
    console.warn = warn;
  }
});

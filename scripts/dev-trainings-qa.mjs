/** DEV integration checks. Own ephemeral fixtures only. No SMTP or payments. */
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import sharp from "sharp";
import { uploadTrainingVideo } from "../src/lib/trainings/upload-video.ts";
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
const origin = "http://localhost:3000";
const db = createClient(e.DEV_SUPABASE_URL, e.DEV_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  anon = createClient(e.DEV_SUPABASE_URL, e.DEV_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const dir = homedir() + "/.codex/private/greenbel-training-qa";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const journal = dir + "/current.json";
const results = [];
let f, failed;
const need = (r, label) => {
  assert.ok(
    !r.error && r.data !== null,
    label + (r.error ? " [" + (r.error.code || "remote") + "]" : ""),
  );
  return r.data;
};
const check = (name, ok) => {
  assert.ok(ok, name);
  results.push({ name, status: "PASS" });
  console.log("PASS:", name);
};
const digest = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const note = () =>
  writeFileSync(journal, JSON.stringify(f, null, 2), { mode: 0o600 });
async function cleanup() {
  const discovered = need(
    await db
      .from("trainings")
      .select("id")
      .like("title", f.marker + "%"),
    "Discover own interrupted fixtures",
  );
  f.trainings = [...new Set([...f.trainings, ...discovered.map((r) => r.id)])];
  note();
  for (const id of f.trainings) {
    const row = await db
      .from("trainings")
      .select("title")
      .eq("id", id)
      .maybeSingle();
    assert.ok(!row.error);
    if (row.data) {
      assert.ok(row.data.title.startsWith(f.marker));
      for (const table of [
        "training_ratings",
        "training_products",
        "training_categories",
      ])
        assert.ok(!(await db.from(table).delete().eq("training_id", id)).error);
      assert.ok(!(await db.from("trainings").delete().eq("id", id)).error);
    }
    for (const bucket of ["training-videos", "training-covers"]) {
      const list = need(
        await db.storage.from(bucket).list(id, { limit: 100 }),
        "List own temporary media",
      );
      if (list.length)
        assert.ok(
          !(
            await db.storage
              .from(bucket)
              .remove(list.map((x) => id + "/" + x.name))
          ).error,
        );
    }
  }
  for (const id of f.users) {
    const user = need(
      await db.auth.admin.getUserById(id),
      "Own temporary account",
    ).user;
    assert.equal(user.user_metadata.qa_marker, f.marker);
    assert.ok(user.email.endsWith("@example.invalid"));
    const audit = await db
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", id);
    assert.ok(
      !audit.error && audit.count === 0,
      "No immutable audit may be bypassed",
    );
    assert.ok(!(await db.from("user_roles").delete().eq("user_id", id)).error);
    assert.ok(!(await db.from("profiles").delete().eq("id", id)).error);
    assert.ok(!(await db.auth.admin.deleteUser(id)).error);
  }
  renameSync(journal, dir + "/completed-" + f.tag + ".json");
}
if (process.argv[2] === "--cleanup") {
  f = JSON.parse(readFileSync(journal));
  assert.match(f.marker, /^QA Capacitaciones [a-f0-9]{8}$/);
  await cleanup();
  console.log("PASS: interrupted fixtures removed");
  process.exit(0);
}
assert.ok(!existsSync(journal), "Clean the pending journal before a new run");
f = { tag: randomUUID().slice(0, 8), trainings: [], users: [] };
f.marker = "QA Capacitaciones " + f.tag;
note();
async function protectedState() {
  return Object.fromEntries(
    await Promise.all(
      [
        "trainings",
        "training_ratings",
        "training_products",
        "training_categories",
        "products",
        "brands",
        "categories",
        "profiles",
        "user_roles",
      ].map(async (table) => [
        table,
        need(
          await db
            .from(table)
            .select("*")
            .order(
              table === "user_roles"
                ? "user_id"
                : table === "training_ratings"
                  ? "training_id"
                  : table === "training_products" ||
                      table === "training_categories"
                    ? "training_id"
                    : "id",
            ),
          "Protected baseline " + table,
        ),
      ]),
    ),
  );
}
const baseline = await protectedState();
f.baselineDigest = digest(baseline);
note();
async function account(label, role = "customer", active = true) {
  const password = randomBytes(32).toString("base64url") + "Aa1!",
    email = "qa-training-" + f.tag + "-" + label + "@example.invalid";
  const user = need(
    await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { qa_marker: f.marker },
    }),
    "Temporary identity",
  ).user;
  f.users.push(user.id);
  note();
  if (role !== "customer")
    assert.ok(
      !(await db.from("user_roles").update({ role }).eq("user_id", user.id))
        .error,
    );
  if (!active)
    assert.ok(
      !(await db.from("profiles").update({ active: false }).eq("id", user.id))
        .error,
    );
  const jar = new Map(),
    client = createServerClient(
      e.DEV_SUPABASE_URL,
      e.DEV_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (items) => items.forEach((x) => jar.set(x.name, x.value)),
        },
      },
    );
  need(
    await client.auth.signInWithPassword({ email, password }),
    "Temporary sign in",
  );
  return {
    id: user.id,
    client,
    cookie: [...jar]
      .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
      .join("; "),
  };
}
async function get(path, cookie = "", headers = {}) {
  const r = await fetch(origin + path, {
    headers: { Cookie: cookie, ...headers },
    redirect: "manual",
    signal: AbortSignal.timeout(45000),
  });
  const bytes = Buffer.from(await r.arrayBuffer());
  return {
    status: r.status,
    text: bytes.toString(),
    bytes,
    headers: r.headers,
  };
}
async function json(method, path, values, cookie = "", customOrigin = origin) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: customOrigin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
    signal: AbortSignal.timeout(45000),
  });
  return { status: r.status, body: await r.json() };
}
async function action(
  name,
  values,
  cookie,
  path = "/admin/capacitaciones",
  bound = [],
) {
  const chunk =
    name === "rateTraining"
      ? ".next/static/chunks/app/capacitaciones/[slug]/page.js"
      : ".next/static/chunks/app/admin/capacitaciones/page.js";
  const source = readFileSync(chunk, "utf8");
  const matches = [
    ...source.matchAll(
      /createServerReference\)\([^a-f0-9]*([a-f0-9]{40,})[^;]+?\b(saveTrainingAction|saveTrainingRelationAction|deleteTrainingAction|rateTraining)\b/g,
    ),
  ];
  const ref = matches.find((m) => m[2] === name)?.[1];
  assert.ok(ref, "Compiled action " + name);
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, String(v));
  const body = await encodeReply([
    ...bound,
    { status: "idle", message: "" },
    data,
  ]);
  const r = await fetch(origin + path, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Next-Action": ref,
      Accept: "text/x-component",
    },
    body,
    signal: AbortSignal.timeout(45000),
  });
  const text = await r.text();
  assert.ok(r.status < 500, "Server Action response " + name);
  const value = text.split("\n").flatMap((line) => {
    try {
      const v = JSON.parse(line.slice(line.indexOf(":") + 1));
      return v && ["success", "error"].includes(v.status) ? [v] : [];
    } catch {
      return [];
    }
  })[0];
  assert.ok(value, "Structured result " + name);
  return value;
}
async function verifyDeletion() {
  const beforeStats = need(
    await db.from("admin_training_rating_overview").select("*").single(),
    "Existing ratings overview",
  );
  const id = randomUUID(),
    asset = randomUUID();
  const coverPath = id + "/" + asset + ".png",
    videoPath = id + "/" + asset + ".mp4";
  const title = f.marker + " Eliminación confirmada",
    slug = "qa-delete-" + f.tag;
  f.trainings.push(id);
  note();
  need(
    await db
      .from("trainings")
      .insert({ id, title, slug, publication_status: "draft" })
      .select("id"),
    "Own delete fixture",
  );
  const coverBytes = await sharp({
    create: { width: 320, height: 180, channels: 3, background: "#E7E7CF" },
  })
    .png()
    .toBuffer();
  need(
    await db.storage
      .from("training-covers")
      .upload(coverPath, coverBytes, { contentType: "image/png" }),
    "Own delete cover",
  );
  need(
    await db.storage
      .from("training-videos")
      .upload(videoPath, readFileSync("/tmp/greenbel-training-qa-flower.mp4"), {
        contentType: "video/mp4",
      }),
    "Own delete video",
  );
  need(
    await db
      .from("trainings")
      .update({
        cover_path: coverPath,
        video_storage_path: videoPath,
        publication_status: "published",
      })
      .eq("id", id)
      .select("id"),
    "Publish own fixture",
  );
  const product = need(
    await db.from("products").select("id,category_id").limit(1),
    "Existing link target",
  )[0];
  assert.ok(product);
  need(
    await db
      .from("training_products")
      .insert({ training_id: id, product_id: product.id })
      .select("training_id"),
    "Own product link",
  );
  need(
    await db
      .from("training_categories")
      .insert({ training_id: id, category_id: product.category_id })
      .select("training_id"),
    "Own category link",
  );
  need(
    await a.client
      .from("training_ratings")
      .insert({ training_id: id, user_id: a.id, rating: 5 })
      .select("rating"),
    "Own training vote",
  );
  const html = await get("/admin/capacitaciones", admin.cookie);
  check(
    "Admin list exposes an explicitly labelled Delete action",
    html.status === 200 && html.text.includes("Eliminar " + title),
  );
  const values = { id, expectedName: title, confirmation: "delete" };
  for (const [label, user] of [
    ["anonymous", { cookie: "" }],
    ["customer", a],
    ["operator", operator],
    ["inactive account", inactive],
  ])
    check(
      "Deletion denied to " + label,
      (await action("deleteTrainingAction", values, user.cookie)).status ===
        "error",
    );
  check(
    "An active administrator must explicitly confirm",
    (
      await action(
        "deleteTrainingAction",
        { ...values, confirmation: "" },
        admin.cookie,
      )
    ).status === "error",
  );
  for (const [label, client] of [
    ["anonymous", anon],
    ["customer", a.client],
    ["operator", operator.client],
  ])
    check(
      "Direct deletion RPC inaccessible to " + label,
      !!(
        await client.rpc("admin_delete_training", {
          p_training_id: id,
          p_expected_title: title,
          p_actor_id: admin.id,
        })
      ).error,
    );
  check(
    "RPC itself rejects an inactive actor even with service credentials",
    !!(
      await db.rpc("admin_delete_training", {
        p_training_id: id,
        p_expected_title: title,
        p_actor_id: inactive.id,
      })
    ).error,
  );
  const directStart = Date.now();
  const directStale = await db
    .rpc("admin_delete_training", {
      p_training_id: id,
      p_expected_title: title + " obsoleto",
      p_actor_id: admin.id,
    })
    .abortSignal(AbortSignal.timeout(12000));
  console.log(
    "CHECK: direct stale RPC",
    JSON.stringify({
      elapsedMs: Date.now() - directStart,
      code: directStale.error?.code,
      message: directStale.error?.message,
    }),
  );
  check(
    "Direct service RPC rejects the stale title promptly without deleting",
    directStale.error?.code === "PT409",
  );
  console.log("CHECK: stale confirmation via authenticated Server Action");
  const stale = await action(
    "deleteTrainingAction",
    { ...values, expectedName: title + " obsoleto" },
    admin.cookie,
  );
  check(
    "Stale confirmation cannot delete a changed training",
    stale.status === "error" && stale.message.includes("cambió"),
  );
  check(
    "Rejected deletions preserve the training and rating",
    need(
      await db.from("trainings").select("id").eq("id", id),
      "Preserved training",
    ).length === 1 &&
      need(
        await db
          .from("training_ratings")
          .select("rating")
          .eq("training_id", id),
        "Preserved vote",
      ).length === 1,
  );
  check(
    "Rejected deletions preserve cover and video",
    !(await db.storage.from("training-covers").info(coverPath)).error &&
      !(await db.storage.from("training-videos").info(videoPath)).error,
  );
  console.log("CHECK: confirmed deletion via authenticated Server Action");
  const deleted = await action("deleteTrainingAction", values, admin.cookie);
  check(
    "Confirmed admin deletion succeeds including a rated training with associations",
    deleted.status === "success" && !deleted.message.includes("pendiente"),
  );
  for (const [table, column] of [
    ["trainings", "id"],
    ["training_ratings", "training_id"],
    ["training_products", "training_id"],
    ["training_categories", "training_id"],
  ])
    check(
      "Deleted training has no remaining rows in " + table,
      need(
        await db.from(table).select(column).eq(column, id),
        "Delete result " + table,
      ).length === 0,
    );
  check(
    "Deleted cover and video are removed from Storage",
    !!(await db.storage.from("training-covers").info(coverPath)).error &&
      !!(await db.storage.from("training-videos").info(videoPath)).error,
  );
  check(
    "Master product and category remain available",
    need(
      await db.from("products").select("id").eq("id", product.id),
      "Preserved master product",
    ).length === 1 &&
      need(
        await db.from("categories").select("id").eq("id", product.category_id),
        "Preserved master category",
      ).length === 1,
  );
  check(
    "Global star average and count return to their original values",
    digest(
      need(
        await db.from("admin_training_rating_overview").select("*").single(),
        "Updated overview",
      ),
    ) === digest(beforeStats),
  );
  const missingDetail = await get("/capacitaciones/" + slug);
  check(
    "Deleted detail renders the not-found state without a player or media URL",
    [200, 404].includes(missingDetail.status) &&
      missingDetail.text.includes("Capacitación no encontrada") &&
      missingDetail.text.includes('content="noindex"') &&
      !missingDetail.text.includes("<video") &&
      !missingDetail.text.includes("/api/training-videos/"),
  );
  for (const path of [
    "/api/training-videos/" + id,
    "/api/training-covers/" + id,
  ])
    check(
      "Deleted training media responds 404 at " +
        path.split("/").slice(0, -1).join("/"),
      (await get(path)).status === 404,
    );
  check(
    "Repeated delete is explicit about the missing training",
    (await action("deleteTrainingAction", values, admin.cookie)).status ===
      "error",
  );
}
let admin, a, b, inactive, operator;
try {
  [admin, a, b, inactive, operator] = await Promise.all([
    account("admin", "admin"),
    account("a"),
    account("b"),
    account("inactive", "customer", false),
    account("operator", "operator"),
  ]);
  if (process.argv[2] === "--delete") {
    await verifyDeletion();
  } else {
    const bucket = need(
      await db.storage.getBucket("training-videos"),
      "Video bucket",
    );
    check(
      "Private video bucket enforces 50 MB and MP4/WebM only",
      bucket.public === false &&
        bucket.file_size_limit === 50000000 &&
        bucket.allowed_mime_types.length === 2,
    );
    const first = await get("/admin/capacitaciones?edit=new", admin.cookie);
    check(
      "Admin renders lateral editor, cover/video controls and final save",
      first.status === 200 &&
        first.text.includes("editor-capacitacion") &&
        first.text.includes("Imagen de portada") &&
        first.text.includes("Subir archivo") &&
        first.text.includes("Crear capacitación") &&
        !first.text.includes('name="slug"'),
    );
    const values = {
      id: "",
      title: f.marker + " Uso y cuidado",
      description: "Descripción real de la fixture de verificación.",
      videoOperation: "keep",
      videoUrl: "",
      publicationStatus: "draft",
    };
    const created = await action("saveTrainingAction", values, admin.cookie);
    assert.equal(created.status, "success", created.message);
    const t = created.training;
    f.trainings.push(t.id);
    note();
    check(
      "Creates draft with automatic stable URL and no invented video",
      t.slug.length <= 160 &&
        t.publication_status === "draft" &&
        !t.video_url &&
        !t.video_storage_path,
    );
    const save = (overrides = {}) =>
      action(
        "saveTrainingAction",
        { ...values, id: t.id, ...overrides },
        admin.cookie,
      );
    check(
      "Cannot publish without a video",
      (await save({ publicationStatus: "published" })).status === "error",
    );
    for (const [role, user] of [
      ["anonymous", { cookie: "" }],
      ["customer", a],
      ["operator", operator],
    ])
      check(
        "Training writes denied to " + role,
        (await action("saveTrainingAction", values, user.cookie)).status ===
          "error",
      );
    const stored = await get("/api/admin/trainings/" + t.id, admin.cookie);
    check(
      "Scoped editor endpoint returns only requested training",
      stored.status === 200 && JSON.parse(stored.text).training.id === t.id,
    );
    check(
      "Editor details denied to customers",
      (await get("/api/admin/trainings/" + t.id, a.cookie)).status === 403,
    );
    const coverBytes = await sharp({
      create: { width: 640, height: 360, channels: 3, background: "#E7E7CF" },
    })
      .png()
      .toBuffer();
    const coverForm = new FormData();
    coverForm.set("trainingId", t.id);
    coverForm.set(
      "image",
      new File([coverBytes], "qa-cover.png", { type: "image/png" }),
    );
    const coverResponse = await fetch(origin + "/api/admin/training-covers", {
      method: "POST",
      headers: { Cookie: admin.cookie, Origin: origin },
      body: coverForm,
    });
    const cover = await coverResponse.json();
    check(
      "Cover upload confirms a persisted pointer",
      coverResponse.status === 201 &&
        cover.status === "recorded" &&
        cover.coverPath.startsWith(t.id + "/"),
    );
    check(
      "Draft cover stays private but active admin can preview",
      (await get("/api/training-covers/" + t.id)).status === 404 &&
        (await get("/api/training-covers/" + t.id, admin.cookie)).status ===
          200,
    );
    const bytes = readFileSync("/tmp/greenbel-training-qa-flower.mp4"),
      file = new File([bytes], "qa-flower.mp4", { type: "video/mp4" });
    const ticket = await json(
      "POST",
      "/api/admin/training-videos",
      { trainingId: t.id, mime: file.type, size: file.size },
      admin.cookie,
    );
    check(
      "Admin obtains a scoped temporary video upload authorization",
      ticket.status === 201 && ticket.body.path.startsWith(t.id + "/"),
    );
    for (const user of [a, operator, { cookie: "" }])
      check(
        "Video upload authorization denied outside active admin " +
          (user === a
            ? "customer"
            : user === operator
              ? "operator"
              : "anonymous"),
        (
          await json(
            "POST",
            "/api/admin/training-videos",
            { trainingId: t.id, mime: file.type, size: file.size },
            user.cookie,
          )
        ).status === 403,
      );
    check(
      "Oversized and non-video requests rejected",
      (
        await json(
          "POST",
          "/api/admin/training-videos",
          { trainingId: t.id, mime: file.type, size: 50000001 },
          admin.cookie,
        )
      ).status === 400 &&
        (
          await json(
            "POST",
            "/api/admin/training-videos",
            { trainingId: t.id, mime: "text/html", size: 20 },
            admin.cookie,
          )
        ).status === 400,
    );
    check(
      "Foreign origins rejected",
      (
        await json(
          "POST",
          "/api/admin/training-videos",
          { trainingId: t.id, mime: file.type, size: file.size },
          admin.cookie,
          "https://example.invalid",
        )
      ).status === 403,
    );
    const preflight = await fetch(ticket.body.endpoint, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers":
          "tus-resumable,x-signature,upload-length,upload-metadata",
      },
    });
    check(
      "Storage CORS preflight accepts the browser upload",
      preflight.ok &&
        ["*", origin].includes(
          preflight.headers.get("access-control-allow-origin"),
        ),
    );
    const progress = [];
    await uploadTrainingVideo(file, ticket.body, (value) =>
      progress.push(value),
    );
    check(
      "Actual resumable video upload finishes with confirmed 100 percent",
      progress.at(-1) === 100,
    );
    const confirm = {
      trainingId: t.id,
      path: ticket.body.path,
      expectedPath: null,
      expectedUrl: null,
    };
    const concurrent = await Promise.all([
      json("PUT", "/api/admin/training-videos", confirm, admin.cookie),
      json("PUT", "/api/admin/training-videos", confirm, admin.cookie),
    ]);
    check(
      "Concurrent confirmation of the same video preserves the winning file",
      concurrent.every((r) => r.status === 200),
    );
    const confirmed = concurrent[0];
    check(
      "Completed video is validated and linked to the draft",
      confirmed.status === 200 && confirmed.body.status === "recorded",
    );
    check(
      "Repeated confirmation is idempotent",
      (await json("PUT", "/api/admin/training-videos", confirm, admin.cookie))
        .status === 200,
    );
    check(
      "Attached video cannot be removed as an orphan",
      (
        await json(
          "DELETE",
          "/api/admin/training-videos",
          { trainingId: t.id, path: ticket.body.path },
          admin.cookie,
        )
      ).status === 409,
    );
    check(
      "Draft video hidden from visitor and customer",
      (await get("/api/training-videos/" + t.id)).status === 404 &&
        (await get("/api/training-videos/" + t.id, a.cookie)).status === 404,
    );
    const preview = await get("/api/training-videos/" + t.id, admin.cookie, {
      Range: "bytes=0-63",
    });
    check(
      "Admin preview supports byte ranges with matching media bytes",
      preview.status === 206 &&
        preview.headers.get("content-range") === `bytes 0-63/${bytes.length}` &&
        preview.bytes.equals(bytes.subarray(0, 64)),
    );
    check(
      "Bucket objects cannot be downloaded anonymously",
      Boolean(
        (await anon.storage.from("training-videos").download(ticket.body.path))
          .error,
      ),
    );
    const published = await save({ publicationStatus: "published" });
    check(
      "Publication supports the uploaded file without an external URL",
      published.status === "success" &&
        published.training.video_storage_path === ticket.body.path &&
        !published.training.video_url,
    );
    const publicVideo = await get("/api/training-videos/" + t.id, "", {
      Range: "bytes=100-199",
    });
    check(
      "Published video serves requested ranges publicly",
      publicVideo.status === 206 &&
        publicVideo.bytes.equals(bytes.subarray(100, 200)),
    );
    check(
      "Invalid range returns a controlled 416",
      (
        await get("/api/training-videos/" + t.id, "", {
          Range: "bytes=0-1,3-4",
        })
      ).status === 416,
    );
    const coverPublic = await get("/api/training-covers/" + t.id);
    check(
      "Published cover bytes match the uploaded file",
      coverPublic.status === 200 && coverPublic.bytes.equals(coverBytes),
    );
    const publicPage = await get("/capacitaciones/" + t.slug);
    check(
      "Public detail renders video, description and sign-in rating action",
      publicPage.status === 200 &&
        publicPage.text.includes("/api/training-videos/" + t.id) &&
        publicPage.text.includes(values.description) &&
        publicPage.text.includes("Iniciar sesión para calificar"),
    );
    const signed = await get("/capacitaciones/" + t.slug, a.cookie);
    check(
      "Active customer sees exactly five accessible star choices",
      (signed.text.match(/type="radio"/g) || []).length === 5 &&
        signed.text.includes("5 estrellas"),
    );
    const rate = (user, value, id = t.id) =>
      action(
        "rateTraining",
        { rating: value, user_id: b.id },
        user.cookie,
        "/capacitaciones/" + t.slug,
        [id],
      );
    check(
      "Customer A can submit five stars",
      (await rate(a, 5)).status === "success",
    );
    check(
      "Customer B can submit three stars",
      (await rate(b, 3)).status === "success",
    );
    let stats = need(
      await anon.rpc("training_rating_summaries", { p_training_ids: [t.id] }),
      "Public real aggregates",
    )[0];
    check(
      "Two real ratings produce average 4 with count 2",
      Number(stats.average_rating) === 4 && Number(stats.rating_count) === 2,
    );
    check(
      "Client-supplied user ID cannot replace Auth ownership",
      need(
        await db.from("training_ratings").select("*").eq("training_id", t.id),
        "Own votes",
      ).some((r) => r.user_id === a.id && r.rating === 5),
    );
    check(
      "Updating A to one star replaces its previous vote",
      (await rate(a, 1)).status === "success",
    );
    stats = need(
      await anon.rpc("training_rating_summaries", { p_training_ids: [t.id] }),
      "Updated aggregates",
    )[0];
    check(
      "Updated average is 2 and vote count remains 2",
      Number(stats.average_rating) === 2 && Number(stats.rating_count) === 2,
    );
    for (const n of [0, 6, 2.5])
      check(
        "Invalid star value " + n + " rejected",
        (await rate(a, n)).status === "error",
      );
    check(
      "Unauthenticated and inactive accounts cannot rate",
      (await rate({ cookie: "" }, 5)).status === "error" &&
        (await rate(inactive, 5)).status === "error",
    );
    check(
      "RLS blocks inserting a vote for another user",
      Boolean(
        (
          await b.client
            .from("training_ratings")
            .insert({ training_id: t.id, user_id: admin.id, rating: 5 })
        ).error,
      ),
    );
    const otherUpdate = await b.client
      .from("training_ratings")
      .update({ rating: 5 })
      .eq("training_id", t.id)
      .eq("user_id", a.id)
      .select("rating");
    check(
      "RLS blocks modifying someone else’s vote",
      !otherUpdate.error && otherUpdate.data.length === 0,
    );
    check(
      "Visitors cannot inspect individual ratings",
      Boolean((await anon.from("training_ratings").select("*")).error),
    );
    check(
      "Admin aggregate views denied to customers",
      Boolean(
        (await a.client.from("admin_training_rating_overview").select("*"))
          .error,
      ),
    );
    const second = await action(
      "saveTrainingAction",
      {
        ...values,
        title: f.marker + " Segundo video",
        videoOperation: "url",
        videoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
        publicationStatus: "published",
      },
      admin.cookie,
    );
    assert.equal(second.status, "success");
    f.trainings.push(second.training.id);
    note();
    check(
      "Additional video can use an external source",
      Boolean(second.training.video_url),
    );
    check(
      "Rating a second training succeeds",
      (await rate(a, 5, second.training.id)).status === "success",
    );
    const overview = need(
      await db.from("admin_training_rating_overview").select("*").single(),
      "Weighted aggregate",
    );
    check(
      "Admin global average weights actual votes, not per-video averages",
      Number(overview.average_rating) === 3 &&
        Number(overview.rating_count) === 3 &&
        Number(overview.rated_trainings) === 2,
    );
    const adminPage = await get(
      "/admin/capacitaciones?edit=" + t.id,
      admin.cookie,
    );
    check(
      "Admin training list contains real per-video averages and counts",
      adminPage.status === 200 &&
        adminPage.text.includes("2 de 5") &&
        adminPage.text.includes("Calificación general"),
    );
    const dashboard = await get("/admin", admin.cookie);
    check(
      "Admin dashboard displays real training ratings",
      dashboard.status === 200 &&
        dashboard.text.includes("Calificaciones de capacitaciones") &&
        dashboard.text.includes("3 de 5"),
    );
    const library = await get("/capacitaciones?q=" + f.tag);
    check(
      "Library search finds both published cards and cover",
      library.status === 200 &&
        library.text.includes(t.slug) &&
        library.text.includes(second.training.slug) &&
        library.text.includes("/api/training-covers/" + t.id),
    );
    const draft = await save({ publicationStatus: "draft" });
    check(
      "Unpublishing preserves votes but hides the video",
      draft.status === "success" &&
        (await get("/api/training-videos/" + t.id)).status === 404,
    );
    check(
      "A draft cannot receive ratings",
      (await rate(a, 5)).status === "error",
    );
    check(
      "Public aggregates do not reveal draft ratings",
      need(
        await anon.rpc("training_rating_summaries", { p_training_ids: [t.id] }),
        "Hidden draft aggregate",
      ).length === 0,
    );
    check(
      "Existing training URL remains stable after a title change",
      (await save({ title: f.marker + " Título modificado" })).training.slug ===
        t.slug,
    );
    const extra = need(
      await db
        .from("trainings")
        .insert(
          Array.from({ length: 12 }, (_, i) => ({
            title: f.marker + " Listado " + String(i).padStart(2, "0"),
            slug: "qa-training-" + f.tag + "-" + i,
            video_url: "https://example.invalid/qa.mp4",
            publication_status: "published",
          })),
        )
        .select("id"),
      "Own temporary pagination videos",
    );
    f.trainings.push(...extra.map((r) => r.id));
    note();
    const page2 = await get("/capacitaciones?q=" + f.tag + "&page=2");
    check(
      "Library paginates real matching rows at 12 cards per page",
      page2.status === 200 &&
        page2.text.replace(/<!--.*?-->/gs, "").includes("Página 2 de 2") &&
        (page2.text.match(/>Ver capacitación/g) || []).length === 1,
    );
    const outOfRange = await get("/capacitaciones?q=" + f.tag + "&page=99999");
    check(
      "Out-of-range page clamps to the actual last page",
      outOfRange.status === 200 &&
        outOfRange.text.replace(/<!--.*?-->/gs, "").includes("Página 2 de 2"),
    );
    const unmatched = await get("/capacitaciones?q=nonexistent-" + f.tag);
    check(
      "Library empty search remains usable",
      unmatched.status === 200 &&
        unmatched.text.includes("No encontramos esa capacitación"),
    );
    const invalidTicket = await json(
      "POST",
      "/api/admin/training-videos",
      { trainingId: t.id, mime: "video/mp4", size: 16 },
      admin.cookie,
    );
    assert.equal(invalidTicket.status, 201);
    need(
      await db.storage
        .from("training-videos")
        .uploadToSignedUrl(
          invalidTicket.body.path,
          invalidTicket.body.token,
          new Blob(["not a real video"], { type: "video/mp4" }),
          { contentType: "video/mp4" },
        ),
      "Own forged media fixture",
    );
    const invalidConfirm = await json(
      "PUT",
      "/api/admin/training-videos",
      {
        trainingId: t.id,
        path: invalidTicket.body.path,
        expectedPath: ticket.body.path,
        expectedUrl: null,
      },
      admin.cookie,
    );
    check(
      "Forged MP4 bytes are rejected and removed",
      invalidConfirm.status === 400 &&
        !!(
          await db.storage.from("training-videos").info(invalidTicket.body.path)
        ).error,
    );
    const staleTicket = await json(
      "POST",
      "/api/admin/training-videos",
      { trainingId: t.id, mime: file.type, size: file.size },
      admin.cookie,
    );
    assert.equal(staleTicket.status, 201);
    need(
      await db.storage
        .from("training-videos")
        .uploadToSignedUrl(
          staleTicket.body.path,
          staleTicket.body.token,
          new Blob([bytes], { type: file.type }),
          { contentType: file.type },
        ),
      "Own stale fixture",
    );
    const stale = await json(
      "PUT",
      "/api/admin/training-videos",
      {
        trainingId: t.id,
        path: staleTicket.body.path,
        expectedPath: null,
        expectedUrl: null,
      },
      admin.cookie,
    );
    check(
      "Stale replacement cannot overwrite the current video",
      stale.status === 409 &&
        need(
          await db
            .from("trainings")
            .select("video_storage_path")
            .eq("id", t.id)
            .single(),
          "Current video",
        ).video_storage_path === ticket.body.path,
    );
    check(
      "Unlinked failed candidate can be removed explicitly",
      (
        await json(
          "DELETE",
          "/api/admin/training-videos",
          { trainingId: t.id, path: staleTicket.body.path },
          admin.cookie,
        )
      ).status === 200,
    );
    const restored = await save({ publicationStatus: "published" });
    check(
      "Re-publishing a rated training preserves its existing votes",
      restored.status === "success" &&
        Number(
          need(
            await anon.rpc("training_rating_summaries", {
              p_training_ids: [t.id],
            }),
            "Restored votes",
          )[0].rating_count,
        ) === 2,
    );
    const publicProduct = need(
      await anon.from("catalog_products").select("id,category_id").limit(1),
      "Published association target",
    )[0];
    assert.ok(publicProduct);
    const relation = await action(
      "saveTrainingRelationAction",
      {
        trainingId: t.id,
        targetId: publicProduct.id,
        kind: "product",
        operation: "attach",
      },
      admin.cookie,
    );
    check(
      "Existing product associations still save",
      relation.status === "success",
    );
    const linked = await get("/api/admin/trainings/" + t.id, admin.cookie);
    check(
      "Scoped editor loads the saved product association",
      JSON.parse(linked.text).productLinks.some(
        (r) => r.product_id === publicProduct.id,
      ),
    );
    const detached = await action(
      "saveTrainingRelationAction",
      {
        trainingId: t.id,
        targetId: publicProduct.id,
        kind: "product",
        operation: "detach",
      },
      admin.cookie,
    );
    check(
      "Existing product association can be removed",
      detached.status === "success",
    );
  }
} catch (error) {
  failed = error;
  console.error("FAIL:", error.message);
} finally {
  try {
    await cleanup();
    check(
      "All ephemeral training data, media and accounts removed; original data preserved",
      digest(await protectedState()) === digest(baseline),
    );
  } catch (error) {
    failed ||= error;
    console.error("FAIL cleanup:", error.message);
  }
}
writeFileSync(
  process.argv[2] === "--delete"
    ? "docs/trainings/2026-10-25-delete-http-verification.json"
    : "docs/trainings/2026-10-25-http-verification.json",
  JSON.stringify(
    {
      time: new Date().toISOString(),
      results,
      failed: failed?.message ?? null,
      browser:
        process.argv[2] === "--delete"
          ? "Chrome: apertura, Cancelar/Escape, teclado y responsive verificados por separado; eliminación real ejecutada por HTTP con fixtures"
          : "See separate browser evidence; HTTP is not a browser click",
    },
    null,
    2,
  ) + "\n",
);
if (failed) process.exitCode = 1;

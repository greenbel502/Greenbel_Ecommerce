/** HTTP/Storage QA for TAL-03 covers. Writes one archived PRUEBA DEV training. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

if (process.argv[2] !== "--run" || process.argv.length !== 3) {
  console.error("NO EJECUTADO: usa --run solo contra Supabase DEV enlazado.");
  process.exit(2);
}
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const appUrl = process.env.DEV_APP_URL?.trim();
const key = process.env.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
const secret = process.env.DEV_SUPABASE_SECRET_KEY?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && appUrl && key && secret && linked === ref);
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
assert.ok(["localhost", "127.0.0.1"].includes(new URL(appUrl).hostname));
assert.ok(!process.env.DEV_EMAIL_DELIVERY_MODE || process.env.DEV_EMAIL_DELIVERY_MODE === "disabled");

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(url, secret, opts);
const anon = createClient(url, key, opts);
const marker = `PRUEBA DEV training-cover ${randomUUID().slice(0, 8)}`;
const slug = marker.toLowerCase().replaceAll(" ", "-");
const ids = [];
const checks = [];
let trainingId;
function check(label, ok, code = "") {
  checks.push(Boolean(ok));
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${code ? ` (${code})` : ""}`);
}
function need(result, label) {
  if (result.error || result.data == null) throw new Error(`${label}: ${result.error?.code ?? "sin_datos"}`);
  return result.data;
}
async function actor(role) {
  const email = `${slug}-${role}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const user = need(await db.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { qa_marker: marker } }), `Auth ${role}`).user;
  ids.push(user.id);
  if (role !== "customer") need(await db.from("user_roles").update({ role })
    .eq("user_id", user.id).select("user_id").single(), `rol ${role}`);
  const jar = new Map();
  const client = createServerClient(url, key, { cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (items) => items.forEach(({ name, value }) => jar.set(name, value))
  }});
  need(await client.auth.signInWithPassword({ email, password }), `login ${role}`);
  return { jar, client };
}
function cookie(actorValue) {
  return [...actorValue.jar.entries()].map(([name, value]) =>
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("; ");
}
async function get(path, actorValue) {
  const response = await fetch(new URL(path, appUrl), {
    headers: actorValue ? { Cookie: cookie(actorValue) } : {},
    signal: AbortSignal.timeout(30_000), redirect: "manual"
  });
  return { status: response.status, type: response.headers.get("content-type"), body: await response.text() };
}
function form(id = trainingId, valid = true) {
  const body = new FormData();
  body.set("trainingId", id);
  const bytes = valid
    ? Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKxkAAAAASUVORK5CYII=", "base64")
    : Buffer.from("not-an-image");
  body.set("image", new File([bytes], `${slug}.png`, { type: "image/png" }));
  return body;
}
async function upload(actorValue, body = form(), origin = new URL(appUrl).origin) {
  const response = await fetch(new URL("/api/admin/training-covers", appUrl), {
    method: "POST", headers: { Origin: origin, ...(actorValue ? { Cookie: cookie(actorValue) } : {}) },
    body, signal: AbortSignal.timeout(30_000)
  });
  return { status: response.status, body: await response.json() };
}

try {
  const admin = await actor("admin");
  const operator = await actor("operator");
  const customer = await actor("customer");
  const training = need(await db.from("trainings").insert({
    slug, title: marker, description: "Capacitación ficticia exclusiva DEV.",
    video_url: "https://example.invalid/prueba-dev-video", publication_status: "draft"
  }).select("id").single(), "capacitación ficticia");
  trainingId = training.id;
  console.log(`Fixture: ${marker}`);
  const [anonDraft, adminDraft] = await Promise.all([
    get(`/api/training-covers/${trainingId}`), get(`/api/training-covers/${trainingId}`, admin)
  ]);
  check("sin portada devuelve 404", anonDraft.status === 404 && adminDraft.status === 404);

  const [unauthorizedOperator, unauthorizedCustomer, unauthorizedAnon, badOrigin, badBytes] = await Promise.all([
    upload(operator), upload(customer), upload(null), upload(admin, form(), "https://example.invalid"),
    upload(admin, form(trainingId, false))
  ]);
  check("operador, cliente y anónimo no cargan portada", unauthorizedOperator.status === 403
    && unauthorizedCustomer.status === 403 && unauthorizedAnon.status === 403);
  check("origen ajeno y firma inválida rechazados", badOrigin.status === 403 && badBytes.status === 400);

  const first = await upload(admin);
  const saved = need(await db.from("trainings").select("cover_path")
    .eq("id", trainingId).single(), "cover_path");
  check("admin carga portada privada en ruta del registro", first.status === 201
    && first.body.status === "recorded" && saved.cover_path?.startsWith(`${trainingId}/`),
    first.status === 201 ? "" : `HTTP ${first.status}: ${first.body.error ?? "sin detalle"}`);
  if (!saved.cover_path) throw new Error("cover_path ausente después de carga");
  const directStorage = await anon.storage.from("training-covers").download(saved.cover_path);
  const [adminPreview, customerDraft, publicDraft] = await Promise.all([
    get(`/api/training-covers/${trainingId}`, admin),
    get(`/api/training-covers/${trainingId}`, customer),
    get(`/api/training-covers/${trainingId}`)
  ]);
  check("Storage directo privado; vista previa de borrador solo admin", Boolean(directStorage.error)
    && adminPreview.status === 200 && adminPreview.type === "image/png"
    && customerDraft.status === 404 && publicDraft.status === 404);

  need(await db.from("trainings").update({ publication_status: "published" })
    .eq("id", trainingId).select("id").single(), "publicar capacitación");
  const [publicCover, listing, detail] = await Promise.all([
    get(`/api/training-covers/${trainingId}`), get("/capacitaciones"),
    get(`/capacitaciones/${slug}`)
  ]);
  check("portada publicada se sirve en listado y ficha", publicCover.status === 200
    && publicCover.type === "image/png" && listing.body.includes(`/api/training-covers/${trainingId}`)
    && detail.body.includes(`/api/training-covers/${trainingId}`));

  const replaced = await upload(admin);
  const afterReplace = need(await db.from("trainings").select("cover_path")
    .eq("id", trainingId).single(), "portada reemplazada");
  const oldFile = await db.storage.from("training-covers").download(saved.cover_path);
  check("reemplazo actualiza ruta y retira objeto anterior", replaced.status === 201
    && afterReplace.cover_path !== saved.cover_path && !replaced.body.cleanupPending
    && Boolean(oldFile.error));

  need(await db.from("trainings").update({ publication_status: "archived" })
    .eq("id", trainingId).select("id").single(), "archivar capacitación");
  const [archivedCover, adminArchive, archivedDetail] = await Promise.all([
    get(`/api/training-covers/${trainingId}`), get(`/api/training-covers/${trainingId}`, admin),
    get(`/capacitaciones/${slug}`)
  ]);
  check("archivo oculta portada y ficha al público; admin conserva vista previa", archivedCover.status === 404
    && adminArchive.status === 200 && !archivedDetail.body.includes(`<h1>${marker}</h1>`));
} catch (error) {
  check("ejecución completa", false, error?.message?.slice(0, 160) ?? "error");
} finally {
  if (trainingId) {
    const archived = await db.from("trainings").update({ publication_status: "archived" })
      .eq("id", trainingId);
    check("fixture queda archivada", !archived.error);
  }
  for (const id of ids) {
    const role = await db.from("user_roles").delete().eq("user_id", id);
    const profile = await db.from("profiles").delete().eq("id", id);
    const removed = await db.auth.admin.deleteUser(id);
    check("cuenta temporal retirada", !role.error && !profile.error && !removed.error);
  }
  const failed = checks.filter((value) => !value).length;
  console.log(`${failed ? "FAIL" : "PASS"}: portada capacitación DEV ${checks.length - failed}/${checks.length}.`);
  if (failed) process.exitCode = 1;
}

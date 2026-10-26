/** Import the eight reviewed PNGs into existing DEV brands. Never overwrite a saved logo. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const mode = process.argv[2] || "--plan";
assert.ok(["--plan", "--apply", "--verify"].includes(mode));
const origin = process.argv[3] || "http://localhost:3000";
assert.ok(["http://localhost:3000", "http://localhost:3001"].includes(origin));
const e = process.env;
assert.equal(e.APP_ENV, "DEV");
assert.equal(new URL(e.DEV_SUPABASE_URL).hostname, e.SUPABASE_DEV_PROJECT_REF + ".supabase.co");
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), e.SUPABASE_DEV_PROJECT_REF);
assert.ok(!e.DEV_EMAIL_DELIVERY_MODE || e.DEV_EMAIL_DELIVERY_MODE === "disabled");
const db = createClient(e.DEV_SUPABASE_URL, e.DEV_SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(e.DEV_SUPABASE_URL, e.DEV_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const need = (result, label) => {
  assert.ok(!result.error && result.data != null, label);
  return result.data;
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (value) => hash(JSON.stringify(value));
const manifest = JSON.parse(readFileSync("docs/brands/logo-sources-2026-10-24.json"));
const sources = manifest.sources;
assert.deepEqual(sources.map((s) => s.slug).sort(), [
  "futureco", "interie", "kawashima", "kawashima-pro", "parazzini", "syngenta", "takashi", "upl",
]);
const bucket = need(await db.storage.getBucket("brand-logos"), "Brand bucket unavailable");
assert.equal(bucket.public, false);
assert.equal(Number(bucket.file_size_limit), 2_000_000);
assert.deepEqual(bucket.allowed_mime_types, ["image/webp"]);
const brands = need(await db.from("brands").select("*").order("id"), "Brand inventory unavailable");
const assets = new Map();
for (const source of sources) {
  assert.equal(source.asset_path, "public/images/brands/catalog/" + source.slug + ".png");
  const png = readFileSync(source.asset_path);
  assert.equal(hash(png), source.png_sha256, source.slug + ": PNG changed since review");
  const metadata = await sharp(png, { limitInputPixels: 16_000_000 }).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, source.width);
  assert.equal(metadata.height, source.height);
  assert.ok(png.length <= 5_000_000 && metadata.width >= 8 && metadata.height >= 8);
  const normalized = await sharp(png).rotate().resize({
    width: 1600, height: 1600, fit: "inside", withoutEnlargement: true,
  }).webp({ lossless: true }).toBuffer();
  assert.ok(normalized.length <= 2_000_000);
  assets.set(source.slug, normalized);
  const matches = brands.filter((brand) => brand.slug === source.slug);
  assert.equal(matches.length, 1, "Expected exactly one existing brand: " + source.slug);
  assert.equal(matches[0].name, source.name);
}
if (mode === "--plan") {
  console.log(JSON.stringify(sources.map((source) => ({
    brand: source.name,
    action: brands.find((b) => b.slug === source.slug).logo_path ? "PRESERVE existing logo" : "ADD reviewed PNG through existing WebP normalization",
    png: source.asset_path,
  })), null, 2));
  process.exit(0);
}

const evidencePath = "docs/brands/logo-import-2026-10-24.json";
const privateDir = homedir() + "/.codex/private/greenbel-brand-logo-import-20261024";
const current = privateDir + "/current.json";
const protectedState = async () => Object.fromEntries(await Promise.all(
  ["products", "profiles", "user_roles"].map(async (table) => [table, digest(need(
    await db.from(table).select("*").order(table === "user_roles" ? "user_id" : "id"),
    "Protected records unavailable: " + table,
  ))]),
));
const brandData = (items) => items.map((item) => Object.fromEntries(
  Object.entries(item).filter(([key]) => !["logo_path", "updated_at"].includes(key)),
));
let report;
if (mode === "--apply") {
  assert.ok(!existsSync(current), "Inspect the previous private journal before retrying an interrupted import");
  mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  const protectedBefore = await protectedState();
  report = { date: "2026-10-24", target: "DEV", time: new Date().toISOString(), results: [], checks: [] };
  const backup = { brands, protectedDigests: protectedBefore, report };
  const journal = () => writeFileSync(current, JSON.stringify(backup, null, 2), { mode: 0o600 });
  journal();
  for (const source of sources) {
    const brand = need(await db.from("brands").select("*").eq("slug", source.slug).single(), "Brand changed");
    let path = brand.logo_path;
    const result = { slug: source.slug, id: brand.id, action: path ? "preserved" : "imported", logoPath: path, status: "pending" };
    report.results.push(result);
    journal();
    if (!path) {
      path = brand.id + "/" + randomUUID() + ".webp";
      result.logoPath = path;
      journal();
      const uploaded = await db.storage.from("brand-logos").upload(path, assets.get(source.slug), {
        contentType: "image/webp", upsert: false,
      });
      assert.ok(!uploaded.error, "Upload failed: " + source.slug);
      result.status = "uploaded";
      journal();
      const update = await db.from("brands").update({ logo_path: path }).eq("id", brand.id)
        .is("logo_path", null).select("id").maybeSingle();
      const confirmed = await db.from("brands").select("logo_path").eq("id", brand.id).single();
      if (confirmed.error || confirmed.data?.logo_path !== path) {
        // A lost UPDATE response can follow a commit: only remove when a fresh read proves it unused.
        if (!confirmed.error && confirmed.data && confirmed.data.logo_path !== path) {
          const removed = await db.storage.from("brand-logos").remove([path]);
          assert.ok(!removed.error, "Unassociated upload cleanup needs review");
        }
        throw new Error("Association not confirmed; review private journal: " + source.slug);
      }
      assert.ok(!update.error || confirmed.data.logo_path === path);
    }
    const object = need(await db.storage.from("brand-logos").download(path), "Stored logo unavailable");
    const stored = Buffer.from(await object.arrayBuffer());
    if (result.action === "imported") assert.equal(hash(stored), hash(assets.get(source.slug)));
    result.sha256 = hash(stored);
    result.status = "PASS";
    journal();
    console.log("PASS:", source.name, result.action);
  }
  const after = need(await db.from("brands").select("*").order("id"), "Final brand inventory");
  assert.deepEqual(brandData(after), brandData(brands), "Names, status, IDs and other brand data must be preserved");
  for (const before of brands.filter((b) => b.logo_path)) {
    assert.deepEqual(after.find((b) => b.id === before.id), before, "Preexisting logo/record must remain untouched");
  }
  assert.deepEqual(await protectedState(), protectedBefore, "Products, profiles and roles must remain untouched");
  report.checks.push("PASS: all non-logo brand data preserved", "PASS: existing logo records preserved byte-for-byte", "PASS: products/profiles/roles unchanged");
  writeFileSync(evidencePath, JSON.stringify(report, null, 2) + "\n");
  renameSync(current, privateDir + "/completed-" + Date.now() + ".json");
} else {
  report = JSON.parse(readFileSync(evidencePath));
}

// Read-only verification also exercises the actual public delivery route and rendered pages.
const html = new Map();
for (const path of ["/", "/nosotros"]) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, "Public page unavailable: " + path);
  html.set(path, await response.text());
}
for (const result of report.results) {
  const row = need(await db.from("brands").select("id,slug,active,logo_path").eq("id", result.id).single(), "Persisted logo pointer");
  assert.equal(row.logo_path, result.logoPath, "Logo was changed after import: " + result.slug);
  assert.equal(row.active, true);
  const source = sources.find((s) => s.slug === row.slug);
  const version = row.logo_path.split("/")[1];
  for (const [path, text] of html) {
    assert.ok(text.includes('src="/api/brand-logos/' + row.id + '?v=' + version + '"'), path + ": missing persisted logo " + row.slug);
  }
  const response = await fetch(origin + "/api/brand-logos/" + row.id + "?v=" + version, { signal: AbortSignal.timeout(45000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^image\/webp/);
  const publicBytes = Buffer.from(await response.arrayBuffer());
  assert.equal(hash(publicBytes), result.sha256, "Public bytes differ: " + row.slug);
  if (result.action === "imported") assert.equal(hash(publicBytes), hash(assets.get(row.slug)));
  const direct = await anon.storage.from("brand-logos").download(row.logo_path);
  assert.ok(direct.error, "Private storage must not become public");
  const pngResponse = await fetch(origin + "/" + source.asset_path.replace(/^public\//, ""), { signal: AbortSignal.timeout(30000) });
  assert.equal(pngResponse.status, 200);
  assert.match(pngResponse.headers.get("content-type"), /^image\/png/);
  assert.equal(hash(Buffer.from(await pngResponse.arrayBuffer())), source.png_sha256);
  result.publicDelivery = "PASS";
  console.log("PASS:", row.slug, "PNG + persisted logo + Inicio/Nosotros + private storage");
}
report.verifiedAt = new Date().toISOString();
report.verificationScope = "DEV records, private storage, PNG files, public HTTP bytes and server-rendered Home/About HTML. Browser interaction/responsive NOT EXECUTED (browser unavailable).";
writeFileSync(evidencePath, JSON.stringify(report, null, 2) + "\n");

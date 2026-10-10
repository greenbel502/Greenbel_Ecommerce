/** Apply exactly one already reviewed pending migration to the linked DEV project. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const expected = process.argv[2];
assert.ok(process.argv.length === 3 && /^20260929\d{6}_[a-z0-9_]+\.sql$/.test(expected ?? ""),
  "Specify one reviewed migration filename");
const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
const linked = readFileSync(resolve("supabase/.temp/project-ref"), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && token && password && linked === ref,
  "DEV selector, linked reference, and tool credentials required");
assert.equal(new URL(url).hostname, `${ref}.supabase.co`, "URL does not match DEV link");
assert.ok(existsSync(resolve("supabase/migrations", expected)), "Reviewed migration missing");

let cli = resolve("node_modules/.bin/supabase");
if (!existsSync(cli)) {
  const cache = join(homedir(), ".npm/_npx");
  const packageName = `cli-${process.platform}-${process.arch}`;
  cli = readdirSync(cache, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(cache, entry.name, "node_modules", "@supabase", packageName, "bin", "supabase"))
    .find(existsSync);
}
assert.ok(cli, "Cached or local Supabase CLI required");

const childEnv = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "USER", "SHELL", "LANG", "LC_ALL", "TERM"]
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]])
);
childEnv.SUPABASE_ACCESS_TOKEN = token;
childEnv.SUPABASE_DB_PASSWORD = password;
childEnv.SUPABASE_TELEMETRY_DISABLED = "1";
childEnv.DO_NOT_TRACK = "1";
const sensitive = [token, password, url, ref].filter(Boolean);
const redact = (value) => sensitive.reduce((safe, secret) => safe.replaceAll(secret, "[redacted]"), value ?? "");
function run(args) {
  const result = spawnSync(cli, args, { env: childEnv, encoding: "utf8", timeout: 120_000,
    maxBuffer: 1024 * 1024 });
  if (result.status !== 0) {
    console.error(redact(result.stderr));
    throw new Error(`Supabase CLI failed (${result.status ?? result.error?.code ?? "unknown"})`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}
const dryRun = run(["db", "push", "--linked", "--skip-vault", "--dry-run"]);
const pending = [...dryRun.matchAll(/(?:Would push these migrations:|\n)\s*[•*]\s*([^\s]+\.sql)/g)]
  .map((match) => match[1]);
assert.deepEqual(pending, [expected], "Dry-run does not contain exactly the expected migration");
console.log(`PASS: DEV dry-run contains only ${expected}`);
const applied = run(["db", "push", "--linked", "--skip-vault", "--yes"]);
if (!applied.includes(`Applying migration ${expected}`)) {
  console.error(redact(applied));
  throw new Error("CLI did not report the expected migration application");
}
console.log(`PASS: DEV CLI reported application of ${expected}`);

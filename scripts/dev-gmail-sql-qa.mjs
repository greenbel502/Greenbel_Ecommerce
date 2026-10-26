import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const e = process.env,
  ref = e.SUPABASE_DEV_PROJECT_REF;
assert.equal(e.APP_ENV, "DEV");
assert.equal(readFileSync("supabase/.temp/project-ref", "utf8").trim(), ref);
assert.equal(new URL(e.DEV_SUPABASE_URL).hostname, ref + ".supabase.co");
const u = new URL(readFileSync("supabase/.temp/pooler-url", "utf8").trim());
const r = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At"], {
  env: {
    ...e,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGDATABASE: u.pathname.slice(1),
    PGPASSWORD: e.SUPABASE_DB_PASSWORD,
    PGSSLMODE: "require",
  },
  input: readFileSync("tests/gmail-notifications.sql", "utf8"),
  encoding: "utf8",
  timeout: 60000,
});
const redact = (s) =>
  [e.SUPABASE_DB_PASSWORD, e.SUPABASE_ACCESS_TOKEN, ref]
    .filter(Boolean)
    .reduce((a, k) => a.replaceAll(k, "[redacted]"), s ?? "");
writeFileSync(
  "docs/gmail/2026-10-25-sql-qa.log",
  redact(r.stdout) + redact(r.stderr),
);
console.log({
  exit: r.status,
  passed: (r.stderr.match(/PASS:/g) || []).length,
  rolledBack: r.stdout.includes("ROLLBACK"),
});
if (r.status !== 0) {
  console.log(redact(r.stderr));
  process.exit(1);
}

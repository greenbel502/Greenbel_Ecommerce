import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// Read-only CLI commands for the linked DEV project. Invoke with
// node --env-file=.env scripts/dev-supabase-cli.mjs list|dry-run|version
// No migration write command is exposed here.
const commands = {
  version: ["--version"],
  list: ["migration", "list", "--linked"],
  "dry-run": ["db", "push", "--linked", "--skip-vault", "--dry-run"]
};
const command = process.argv[2];
if (!(command in commands) || process.argv.length !== 3) {
  console.error("Uso: node --env-file=.env scripts/dev-supabase-cli.mjs list|dry-run|version");
  process.exit(2);
}

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim() ?? "";
let targetValid = process.env.APP_ENV === "DEV" && /^[a-z0-9-]{3,64}$/.test(ref);
try {
  const url = new URL(process.env.DEV_SUPABASE_URL ?? "");
  targetValid = targetValid && url.protocol === "https:"
    && url.hostname === `${ref}.supabase.co` && !url.username && !url.password;
} catch {
  targetValid = false;
}
const linkPath = resolve("supabase/.temp/project-ref");
targetValid = targetValid && existsSync(linkPath)
  && readFileSync(linkPath, "utf8").trim() === ref
  && Boolean(process.env.SUPABASE_ACCESS_TOKEN?.trim())
  && Boolean(process.env.SUPABASE_DB_PASSWORD?.trim());
if (command !== "version" && !targetValid) {
  console.error("FAIL: selector, URL, credenciales de herramientas o enlace real DEV no coinciden.");
  process.exit(2);
}

function findCli() {
  const local = resolve("node_modules/.bin/supabase");
  if (existsSync(local)) return local;
  const cache = join(homedir(), ".npm/_npx");
  if (!existsSync(cache)) return null;
  const packageName = `cli-${process.platform}-${process.arch}`;
  for (const entry of readdirSync(cache, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const executable = join(cache, entry.name, "node_modules", "@supabase", packageName, "bin", "supabase");
    if (existsSync(executable)) return executable;
  }
  return null;
}

const cli = findCli();
if (!cli) {
  console.error("NO EJECUTADO: no se encontró una CLI Supabase local o cacheada.");
  process.exit(3);
}

// Pass only tool credentials and ordinary process settings. App, PROD and email
// secrets are not inherited by the CLI process.
const childEnv = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "USER", "SHELL", "LANG", "LC_ALL", "TERM"]
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]])
);
if (command !== "version") {
  childEnv.SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
  childEnv.SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
}
childEnv.SUPABASE_TELEMETRY_DISABLED = "1";
childEnv.DO_NOT_TRACK = "1";

const result = spawnSync(cli, commands[command], {
  env: childEnv, encoding: "utf8", timeout: 90_000, maxBuffer: 1024 * 1024
});
const sensitive = [process.env.SUPABASE_ACCESS_TOKEN, process.env.SUPABASE_DB_PASSWORD,
  process.env.DEV_SUPABASE_URL, ref].filter(Boolean);
const redact = (output) => sensitive.reduce((safe, value) => safe.replaceAll(value, "[redacted]"), output ?? "");
console.log(redact(result.stdout));
if (result.stderr) console.error(redact(result.stderr));
if (result.error) console.error(`CLI error: ${result.error.code ?? result.error.name}`);
process.exit(result.status ?? 1);

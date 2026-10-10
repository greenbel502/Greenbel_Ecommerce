import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Read-only gate before any Supabase CLI use. Run with: node --env-file=.env scripts/dev-target-preflight.mjs
// This intentionally never logs project references, URLs, tokens or passwords.
const checks = [];
const check = (label, pass) => checks.push({ label, pass });

check("APP_ENV selecciona DEV", process.env.APP_ENV === "DEV");
const projectRef = process.env.SUPABASE_DEV_PROJECT_REF?.trim() ?? "";
check("referencia DEV configurada", /^[a-z0-9-]{3,64}$/.test(projectRef));

let urlMatches = false;
try {
  const url = new URL(process.env.DEV_SUPABASE_URL ?? "");
  urlMatches = url.protocol === "https:" && url.hostname === `${projectRef}.supabase.co`
    && !url.username && !url.password;
} catch {
  // Missing or malformed URL fails closed.
}
check("URL de Supabase corresponde a referencia DEV", urlMatches);

const linkPath = resolve("supabase/.temp/project-ref");
const linked = existsSync(linkPath) ? readFileSync(linkPath, "utf8").trim() : "";
check("enlace CLI real presente y coincidente con DEV", Boolean(projectRef && linked === projectRef));
check("token de herramientas presente", Boolean(process.env.SUPABASE_ACCESS_TOKEN?.trim()));
check("contraseña DB para herramientas presente", Boolean(process.env.SUPABASE_DB_PASSWORD?.trim()));

for (const { label, pass } of checks) console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
console.log("NO EJECUTADO: conexión, historial, esquema remoto y pertenencia de la contraseña DB a DEV.");
if (checks.some(({ pass }) => !pass)) process.exitCode = 1;

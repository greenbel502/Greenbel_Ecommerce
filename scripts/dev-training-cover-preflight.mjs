/** Read-only remote DEV preflight for private training cover migration 018. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && token && linked === ref,
  "Selector, enlace y token DEV requeridos");
assert.equal(new URL(url).hostname, `${ref}.supabase.co`, "URL fuera de DEV");

const query = `select
  (select count(*) from supabase_migrations.schema_migrations) as migration_count,
  (select count(*) from public.trainings where cover_path is not null) as training_covers_in_use,
  (select count(*) from storage.buckets where id='training-covers') as bucket_count,
  (select count(*) from storage.objects where bucket_id='training-covers') as object_count,
  (select relrowsecurity::int from pg_class where oid='storage.objects'::regclass) as storage_rls,
  (select count(*) from pg_constraint where conrelid='public.trainings'::regclass
    and conname='trainings_cover_path_format_check') as cover_constraint_count,
  (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.trainings'::regclass
    and conname='trainings_cover_path_format_check') as cover_constraint_definition,
  (to_regclass('public.trainings_cover_path_uq') is not null)::int as cover_unique_index,
  (select count(*) from pg_policies pol where pol.schemaname='storage'
    and pol.tablename='objects' and pol.cmd in ('SELECT','ALL')
    and exists (select 1 from unnest(pol.roles) role_name
      where role_name::text in ('public','anon','authenticated'))) as client_storage_select_policies`;
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query/read-only`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }), signal: AbortSignal.timeout(25_000)
});
if (response.status !== 201) throw new Error(`DEV read-only query HTTP ${response.status}`);
const rows = await response.json();
assert.ok(Array.isArray(rows) && rows.length === 1, "Schema response unexpectedly shaped");
console.log(JSON.stringify(rows[0]));

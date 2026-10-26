// Authorized DEV fixture cleanup for the account-financing QA only.
// Default: backup + rollback simulation. --apply commits the identical transaction.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const e = process.env;
assert.equal(e.APP_ENV, 'DEV');
assert.equal(fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim(), e.SUPABASE_DEV_PROJECT_REF);
assert.equal(new URL(e.DEV_SUPABASE_URL).hostname, e.SUPABASE_DEV_PROJECT_REF + '.supabase.co');
const pool = new URL(fs.readFileSync('supabase/.temp/pooler-url', 'utf8').trim());
assert.ok(decodeURIComponent(pool.username).endsWith('.' + e.SUPABASE_DEV_PROJECT_REF));
const dir = os.homedir() + '/.codex/private/greenbel-finance31-qa';
const journalPath = dir + '/current.json';
const f = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
assert.equal(f.marker, 'QA Finance account 1ee8947e');
assert.equal(f.users.length, 2);
const owner = f.users.find(x => x.role === 'owner');
const userIds = f.users.map(x => x.id);
const requestIds = [
  '60130745-5978-48af-a847-5133c45f9472',
  '7fc4e1eb-75b4-4711-b581-c5e65c8143fd',
  '56411324-437e-4722-8f88-d3687895b0ff',
];
const quoteIds = [
  '459bd7a7-e26c-4513-bd54-8feed0e3f39e',
  '48a45fea-ae24-4b8c-880f-9b2423c6d4fe',
];
for (const id of [...userIds, ...requestIds, ...quoteIds]) assert.match(id, /^[a-f0-9-]{36}$/);
const ids = a => a.map(x => "'" + x + "'").join(',');
const U = ids(userIds), F = ids(requestIds), Q = ids(quoteIds);
const db = createClient(e.DEV_SUPABASE_URL, e.DEV_SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
function sql(input) {
  const r = spawnSync('/opt/homebrew/bin/psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'], {
    env: { ...e, PGHOST: pool.hostname, PGPORT: pool.port || '5432', PGUSER: decodeURIComponent(pool.username), PGDATABASE: pool.pathname.slice(1), PGPASSWORD: e.SUPABASE_DB_PASSWORD, PGSSLMODE: 'require' },
    input, encoding: 'utf8', timeout: 45000,
  });
  assert.equal(r.status, 0, 'Scoped cleanup SQL failed: ' + r.stderr.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]'));
  return r.stdout.trim();
}
for (const user of f.users) {
  const result = await db.auth.admin.getUserById(user.id);
  assert.ok(!result.error, 'QA account unavailable; inspect before cleanup');
  assert.equal(result.data.user.email, user.email);
  assert.equal(result.data.user.user_metadata.qa_marker, f.marker);
}
const own = JSON.parse(sql(`select jsonb_build_object(
  'quotes',(select jsonb_agg(t) from public.quotes t where id in (${Q})),
  'requests',(select jsonb_agg(t) from public.financing_requests t where id in (${F})),
  'items',(select jsonb_agg(t) from public.quote_items t where quote_id in (${Q})),
  'grants',(select jsonb_agg(t) from public.guest_access_grants t where quote_id in (${Q}) or financing_request_id in (${F})),
  'challenges',(select jsonb_agg(t) from greenbel_private.financing_email_challenges t where financing_id in (${F})),
  'notifications',(select jsonb_agg(t) from greenbel_private.gmail_financing_notifications t where financing_id in (${F})),
  'profiles',(select jsonb_agg(t) from public.profiles t where id in (${U})),
  'roles',(select jsonb_agg(t) from public.user_roles t where user_id in (${U})));`));
assert.equal(own.quotes.length, 2);
assert.equal(own.requests.length, 3);
for (const q of own.quotes) {
  assert.ok([f.marker, f.marker + ' UI'].includes(q.customer_name));
  assert.equal(q.customer_email, owner.email);
}
for (const r of own.requests) {
  assert.ok([f.marker, f.marker + ' UI'].includes(r.applicant_name));
  assert.equal(r.account_user_id, owner.id);
  assert.equal(r.email, owner.email);
  assert.ok(quoteIds.includes(r.quote_id));
}
assert.ok(own.roles.every(x => x.role === 'customer'));
const backup = dir + '/cleanup-backup';
fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
fs.writeFileSync(backup + '/fixtures.json', JSON.stringify(own), { mode: 0o600 });
for (const q of own.quotes) {
  const result = await db.storage.from('quote-pdfs').download(q.pdf_storage_path);
  assert.ok(!result.error, 'Private PDF backup failed');
  const bytes = Buffer.from(await result.data.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), q.pdf_sha256);
  fs.writeFileSync(backup + '/' + q.id + '.pdf', bytes, { mode: 0o600 });
}
const apply = process.argv.includes('--apply');
sql(`begin;
set local lock_timeout='5s'; set local statement_timeout='30s';
create temporary table preserved(name text primary key,digest text);
create function pg_temp.snapshot_preserved() returns table(name text,digest text) language plpgsql as $$
declare t record; clause text; value text; begin
for t in select n.nspname as schema,c.relname as tab from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in('public','greenbel_private') loop
clause:=case t.tab
when 'quotes' then 'where id not in (${Q.replaceAll("'", "''")})'
when 'quote_items' then 'where quote_id not in (${Q.replaceAll("'", "''")})'
when 'financing_requests' then 'where id not in (${F.replaceAll("'", "''")})'
when 'guest_access_grants' then 'where (quote_id is null or quote_id not in (${Q.replaceAll("'", "''")})) and (financing_request_id is null or financing_request_id not in (${F.replaceAll("'", "''")}))'
when 'financing_email_challenges' then 'where financing_id not in (${F.replaceAll("'", "''")})'
when 'gmail_financing_notifications' then 'where financing_id not in (${F.replaceAll("'", "''")})'
when 'profiles' then 'where id not in (${U.replaceAll("'", "''")})'
when 'user_roles' then 'where user_id not in (${U.replaceAll("'", "''")})'
else '' end;
execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,''|'' order by to_jsonb(x)::text),'''')) from %I.%I x %s',t.schema,t.tab,clause) into value;
name:=t.schema||'.'||t.tab; digest:=value; return next;
end loop; end $$;
insert into preserved select * from pg_temp.snapshot_preserved();
do $$ begin
if exists(select 1 from public.orders where source_quote_id in (${Q})) or exists(select 1 from public.quotes where supersedes_id in (${Q}))
or exists(select 1 from public.financing_requests where quote_id in (${Q}) and id not in (${F}))
or exists(select 1 from public.financing_requests where account_user_id in (${U}) and id not in (${F}))
then raise exception 'Unexpected dependencies; stop'; end if;
if (select count(*) from public.financing_requests where id in (${F}) and account_user_id='${owner.id}' and applicant_name in ('${f.marker}','${f.marker} UI'))<>3 then raise exception 'Fixture identity changed'; end if;
end $$;
alter table public.guest_access_grants disable trigger guest_access_grants_guard_change;
alter table public.financing_requests disable trigger financing_requests_guard_draft;
alter table public.quote_items disable trigger quote_items_guard_change;
alter table public.quotes disable trigger quotes_guard_change;
delete from greenbel_private.financing_email_challenges where financing_id in (${F});
delete from greenbel_private.gmail_financing_notifications where financing_id in (${F});
delete from public.guest_access_grants where quote_id in (${Q}) or financing_request_id in (${F});
delete from public.financing_requests where id in (${F});
delete from public.quote_items where quote_id in (${Q});
delete from public.quotes where id in (${Q});
alter table public.guest_access_grants enable trigger guest_access_grants_guard_change;
alter table public.financing_requests enable trigger financing_requests_guard_draft;
alter table public.quote_items enable trigger quote_items_guard_change;
alter table public.quotes enable trigger quotes_guard_change;
delete from public.user_roles where user_id in (${U}) and role='customer';
delete from public.profiles where id in (${U});
do $$ begin
if exists(select 1 from preserved p full join pg_temp.snapshot_preserved() s using(name) where p.digest is distinct from s.digest) then raise exception 'Unrelated data changed'; end if;
if exists(select 1 from pg_trigger where tgname in('guest_access_grants_guard_change','financing_requests_guard_draft','quote_items_guard_change','quotes_guard_change') and tgenabled<>'O') then raise exception 'Guard not restored'; end if;
end $$;
${apply ? 'commit' : 'rollback'};`);
if (apply) {
  const removal = await db.storage.from('quote-pdfs').remove(own.quotes.map(q => q.pdf_storage_path));
  assert.ok(!removal.error, 'Private fixture objects remain; backup preserved');
  for (const user of f.users) {
    const deletion = await db.auth.admin.deleteUser(user.id);
    assert.ok(!deletion.error, 'Temporary auth account remains; inspect privately');
  }
  const counts = JSON.parse(sql(`select jsonb_build_object('quotes',(select count(*) from public.quotes where id in (${Q})),'requests',(select count(*) from public.financing_requests where id in (${F})),'profiles',(select count(*) from public.profiles where id in (${U})),'authUsers',(select count(*) from auth.users where id in (${U})));`));
  assert.ok(Object.values(counts).every(x => x === 0));
  f.cleaned = true;
  fs.writeFileSync(journalPath, JSON.stringify(f), { mode: 0o600 });
}
const report = { devOnly: true, mode: apply ? 'committed' : 'rollback_simulation', marker: f.marker, privateBackup: true, unrelatedPublicAndPrivateDataUnchanged: true, guardsRestored: true, requestCount: 3, quoteCount: 2, temporaryAccounts: 2, fixtureStorageRemoved: apply, publicBrandAssetsPreserved: true };
fs.writeFileSync('docs/gmail/2026-10-25-financing-account-cleanup-' + (apply ? 'applied' : 'simulation') + '.json', JSON.stringify(report, null, 2));
console.log(report);

// Narrow, authorized DEV cleanup of this task's two fixed fixture IDs only.
import fs from 'node:fs';import{spawnSync}from'node:child_process';import assert from'node:assert/strict';import{createClient}from'@supabase/supabase-js';
const e=process.env;assert.equal(e.APP_ENV,'DEV');assert.equal(fs.readFileSync('supabase/.temp/project-ref','utf8').trim(),e.SUPABASE_DEV_PROJECT_REF);assert.equal(new URL(e.DEV_SUPABASE_URL).hostname,e.SUPABASE_DEV_PROJECT_REF+'.supabase.co');const u=new URL(fs.readFileSync('supabase/.temp/pooler-url','utf8').trim());assert.ok(decodeURIComponent(u.username).endsWith('.'+e.SUPABASE_DEV_PROJECT_REF));
const q='ca9c9fc9-36b9-4f95-954d-8b4bee02b665',f='bd9393cd-20a3-4418-b33d-130753b4477d';
function sql(input){const r=spawnSync('/opt/homebrew/bin/psql',['-X','-v','ON_ERROR_STOP=1','-At'],{env:{...e,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGDATABASE:u.pathname.slice(1),PGPASSWORD:e.SUPABASE_DB_PASSWORD,PGSSLMODE:'require'},input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,'Scoped cleanup SQL failed');return r.stdout.trim();}
const own=JSON.parse(sql(`select jsonb_build_object('quote',(select to_jsonb(t) from public.quotes t where id='${q}'),'request',(select to_jsonb(t) from public.financing_requests t where id='${f}'),'items',(select jsonb_agg(t) from public.quote_items t where quote_id='${q}'),'grants',(select jsonb_agg(t) from public.guest_access_grants t where quote_id='${q}' or financing_request_id='${f}'),'challenges',(select jsonb_agg(t) from greenbel_private.financing_email_challenges t where financing_id='${f}'),'notification',(select to_jsonb(t) from greenbel_private.gmail_financing_notifications t where financing_id='${f}'));`));
assert.equal(own.quote.customer_name,'QA Financiamiento GreenBel 030');assert.equal(own.request.applicant_name,'QA Financiamiento GreenBel 030');assert.equal(own.request.quote_id,q);assert.equal(own.request.email,'greenbel502@gmail.com');
const backupDir='/tmp/greenbel-financing-030-private-backup';fs.mkdirSync(backupDir,{recursive:true,mode:0o700});fs.writeFileSync(backupDir+'/fixtures.json',JSON.stringify(own),{mode:0o600});fs.copyFileSync('output/pdf/financiamiento-prueba-dev.pdf',backupDir+'/quote.pdf');fs.chmodSync(backupDir+'/quote.pdf',0o600);
const apply=process.argv.includes('--apply');
const out=sql(`begin;
set local lock_timeout='5s';set local statement_timeout='20s';
create temporary table preserved(name text primary key,digest text);
create function pg_temp.snapshot_preserved() returns table(name text,digest text) language plpgsql as $$ declare t record; clause text; value text;begin
for t in select n.nspname as schema,c.relname as tab from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in('public','greenbel_private') loop
 clause:=case t.tab when 'quotes' then 'where id<>''${q}''' when 'quote_items' then 'where quote_id<>''${q}''' when 'financing_requests' then 'where id<>''${f}''' when 'guest_access_grants' then 'where quote_id is distinct from ''${q}''::uuid and financing_request_id is distinct from ''${f}''::uuid' when 'financing_email_challenges' then 'where financing_id<>''${f}''' when 'gmail_financing_notifications' then 'where financing_id<>''${f}''' else '' end;
 execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,''|'' order by to_jsonb(x)::text),'''')) from %I.%I x %s',t.schema,t.tab,clause) into value;
 name:=t.schema||'.'||t.tab;digest:=value;return next;
end loop;end $$;
insert into preserved select * from pg_temp.snapshot_preserved();
do $$ begin
if exists(select 1 from public.orders where source_quote_id='${q}') or exists(select 1 from public.quotes where supersedes_id='${q}') or (select count(*) from public.financing_requests where quote_id='${q}')<>1 then raise exception 'Unexpected dependents; stop';end if;
end $$;
alter table public.guest_access_grants disable trigger guest_access_grants_guard_change;
alter table public.financing_requests disable trigger financing_requests_guard_draft;
alter table public.quote_items disable trigger quote_items_guard_change;
alter table public.quotes disable trigger quotes_guard_change;
delete from greenbel_private.financing_email_challenges where financing_id='${f}';
delete from greenbel_private.gmail_financing_notifications where financing_id='${f}';
delete from public.guest_access_grants where quote_id='${q}' or financing_request_id='${f}';
delete from public.financing_requests where id='${f}' and applicant_name='QA Financiamiento GreenBel 030';
delete from public.quote_items where quote_id='${q}';
delete from public.quotes where id='${q}' and customer_name='QA Financiamiento GreenBel 030';
alter table public.guest_access_grants enable trigger guest_access_grants_guard_change;
alter table public.financing_requests enable trigger financing_requests_guard_draft;
alter table public.quote_items enable trigger quote_items_guard_change;
alter table public.quotes enable trigger quotes_guard_change;
do $$ begin
if exists(select 1 from preserved p full join pg_temp.snapshot_preserved() s using(name) where p.digest is distinct from s.digest) then raise exception 'Unrelated data changed';end if;
if exists(select 1 from pg_trigger where tgname in('guest_access_grants_guard_change','financing_requests_guard_draft','quote_items_guard_change','quotes_guard_change') and tgenabled<>'O') then raise exception 'Guard not restored';end if;
end $$;
${apply?'commit':'rollback'};`);
if(apply){const c=createClient(e.DEV_SUPABASE_URL,e.DEV_SUPABASE_SECRET_KEY);const {error}=await c.storage.from('quote-pdfs').remove([own.quote.pdf_storage_path]);assert.ok(!error,'Private orphan object cleanup pending');}
const report={devOnly:true,mode:apply?'committed':'rollback_simulation',fixtureQuote:q,fixtureRequest:f,privateBackup:true,unrelatedDataUnchanged:true,historyGuardsRestored:true,privateStorageRemoved:apply,counts:out.split('\n').filter(l=>l.startsWith('DELETE'))};
fs.writeFileSync('docs/gmail/2026-10-25-financing-cleanup-'+(apply?'applied':'simulation')+'.json',JSON.stringify(report,null,2));console.log(report);

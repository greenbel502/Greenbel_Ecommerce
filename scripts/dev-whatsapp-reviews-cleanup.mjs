// Remove only this run's identified DEV fixtures, after private backup and rollback simulation.
import fs from 'node:fs';import os from 'node:os';import assert from'node:assert/strict';import{spawnSync}from'node:child_process';import{createClient}from'@supabase/supabase-js';
const e=process.env;assert.equal(e.APP_ENV,'DEV');assert.equal(fs.readFileSync('supabase/.temp/project-ref','utf8').trim(),e.SUPABASE_DEV_PROJECT_REF);assert.equal(new URL(e.DEV_SUPABASE_URL).hostname,e.SUPABASE_DEV_PROJECT_REF+'.supabase.co');
const u=new URL(fs.readFileSync('supabase/.temp/pooler-url','utf8').trim());assert.ok(decodeURIComponent(u.username).endsWith('.'+e.SUPABASE_DEV_PROJECT_REF));
const dir=os.homedir()+'/.codex/private/greenbel-reviews32-qa',journal=dir+'/current.json',f=JSON.parse(fs.readFileSync(journal));assert.ok(f.httpChecked&&!f.cleaned);
const db=createClient(e.DEV_SUPABASE_URL,e.DEV_SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const need=r=>{assert.ok(!r.error,r.error?.code);return r.data;};
const ui=need(await db.from('whatsapp_review_invitations').select('*').in('reference',['GB-69EB2194','GB-F925D9AC']));
assert.equal(ui.length,2,'Only the two references observed in this run');
const userIds=f.users.map(u=>u.id),invitations=need(await db.from('whatsapp_review_invitations').select('*').in('customer_id',userIds));const inviteIds=[...new Set([...ui,...invitations].map(r=>r.id))];
const reviews=need(await db.from('whatsapp_reviews').select('*').in('invitation_id',inviteIds));for(const r of reviews)assert.ok(r.comment.startsWith(f.marker)||r.comment.startsWith('QA Reseña interfaz '+f.tag));
const reviewIds=reviews.map(r=>r.id),audit=need(await db.from('audit_events').select('*').eq('entity_type','whatsapp_review').in('entity_id',reviewIds)),profiles=need(await db.from('profiles').select('*').in('id',userIds));for(const p of profiles)assert.ok(p.display_name.startsWith(f.marker));
fs.writeFileSync(dir+'/backup-before-cleanup.json',JSON.stringify({invitations:[...ui,...invitations],reviews,audit,profiles}),{mode:0o600});
const ids=a=>a.map(id=>{assert.match(id,/^[a-f0-9-]{36}$/);return "'"+id+"'";}).join(',');
const script=`begin;
set local lock_timeout='5s';
create temporary table qa_preserved(table_name text,digest text);
do $$ declare t text; d text; clause text; begin foreach t in array array['reviews','orders','order_items','shipments','payments','inventory_balances','inventory_movements','quotes','quote_items','contact_messages','financing_requests','profiles','user_roles','brands','categories','products','audit_events'] loop
clause:=case when t='profiles' then $clause$ where id not in (${ids(userIds)})$clause$ when t='user_roles' then $clause$ where user_id not in (${ids(userIds)})$clause$ when t='audit_events' then $clause$ where not(entity_type='whatsapp_review' and entity_id in (${ids(reviewIds)}))$clause$ else '' end;
execute format($q$select md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by to_jsonb(r)::text),'')) from public.%I r$q$,t)||clause into d;insert into qa_preserved values(t,d);end loop;end $$;
alter table public.audit_events disable trigger audit_events_immutable;
delete from public.audit_events where entity_type='whatsapp_review' and entity_id in (${ids(reviewIds)});
alter table public.audit_events enable trigger audit_events_immutable;
delete from public.whatsapp_reviews where id in (${ids(reviewIds)});
delete from public.whatsapp_review_invitations where id in (${ids(inviteIds)});
delete from public.user_roles where user_id in (${ids(userIds)});
delete from public.profiles where id in (${ids(userIds)});
do $$ declare r record;d text;begin for r in select * from qa_preserved loop execute format($q$select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) from public.%I t$q$,r.table_name) into d;if d is distinct from r.digest then raise exception 'Non-fixture data changed: %',r.table_name;end if;end loop;
if not exists(select 1 from pg_trigger where tgrelid='public.audit_events'::regclass and tgname='audit_events_immutable' and tgenabled='O') then raise exception 'Audit protection missing';end if;raise notice 'PASS: Non-fixture data preserved and audit trigger restored';end $$;
`;
function run(commit){const p=spawnSync('/opt/homebrew/bin/psql',['-X','-v','ON_ERROR_STOP=1','-At'],{env:{...e,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGDATABASE:u.pathname.slice(1),PGPASSWORD:e.SUPABASE_DB_PASSWORD,PGSSLMODE:'require'},input:script+(commit?'commit;':'rollback;'),encoding:'utf8',timeout:30000});assert.equal(p.status,0,p.stderr);fs.writeFileSync('docs/qa/2026-10-26-resenas/cleanup-'+(commit?'commit':'rollback')+'.log',p.stdout+p.stderr);}
run(false);run(true);
for(const user of f.users){const current=need(await db.auth.admin.getUserById(user.id)).user;assert.equal(current.user_metadata.qa_marker,f.marker);need(await db.auth.admin.deleteUser(user.id));}
f.cleaned=true;f.uiInvitationIds=ui.map(i=>i.id);f.uiReviewIds=reviews.filter(r=>ui.some(i=>i.id===r.invitation_id)).map(r=>r.id);fs.writeFileSync(journal,JSON.stringify(f),{mode:0o600});console.log({status:'PASS',removedReviews:reviewIds.length,removedInvitations:inviteIds.length,removedAccounts:userIds.length,backup:'private',businessTablesUnchanged:true});

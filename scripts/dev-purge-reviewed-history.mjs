/** One-time, explicitly approved DEV exception. Never include this data job in PROD migrations. */
import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
import{createHash}from'node:crypto';
import{createClient}from'@supabase/supabase-js';
const args=new Set(process.argv.slice(2));
assert.ok(args.has('--approved-dev-history-exception'),'Explicit 2026-10-22 approval flag required');
assert.notEqual(args.has('--apply'),args.has('--plan'),'Choose --plan or --apply');
assert.ok([...args].every(a=>['--approved-dev-history-exception','--apply','--plan'].includes(a)));
const e=process.env,ref=e.SUPABASE_DEV_PROJECT_REF?.trim();assert.equal(e.APP_ENV,'DEV');assert.equal(new URL(e.DEV_SUPABASE_URL).hostname,ref+'.supabase.co');assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),ref);
const dir='/Users/diederichsolis/.codex/private/greenbel-dev-catalog-20261022';
const original=JSON.parse(readFileSync(dir+'/public-before.json'));const initial=JSON.parse(readFileSync(dir+'/inventory-before.json'));
const privateOriginal=JSON.parse(readFileSync(dir+'/private-before-history-purge.json'));
for(const [table,rows]of Object.entries(privateOriginal))original['greenbel_private.'+table]=rows;
const relation=table=>table.startsWith('greenbel_private.')?table:'public.'+table;
const fixtureUserIds=new Set(initial.auth_users.filter(u=>u.email?.endsWith('@example.invalid')||u.metadata?.test_fixture).map(u=>u.id));
const protectedUsers=initial.auth_users.filter(u=>!fixtureUserIds.has(u.id));assert.equal(protectedUsers.length,3);
const fixtureProductIds=new Set(initial.products.filter(p=>/^(PRUEBA DEV|DEV-QA-|QA-)/i.test(p.sku)&&/^(PRUEBA DEV|DEV-QA-|QA-)/i.test(p.name)).map(p=>p.id));assert.equal(fixtureProductIds.size,36);
const orderIds=new Set(original.orders.filter(o=>fixtureUserIds.has(o.customer_id)||original.order_items.some(i=>i.order_id===o.id&&fixtureProductIds.has(i.product_id))||/PRUEBA|QA-/i.test(JSON.stringify(o))).map(o=>o.id));assert.equal(orderIds.size,35);
const resourceIds={product:fixtureProductIds,user:fixtureUserIds,order:orderIds};
for(const [type,table]of Object.entries({shipment:'shipments',payment:'payments',service_case:'service_cases',carrier_settlement:'carrier_settlements',settlement_receipt:'settlement_receipts',shipping_proposal:'shipping_proposals'}))resourceIds[type]=new Set(original[table].map(r=>r.id));
const auditIds=new Set(original.audit_events.filter(r=>resourceIds[r.entity_type]?.has(r.entity_id)).map(r=>r.id));assert.equal(auditIds.size,64);
async function query(sql,write=false){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query${write?'':'/read-only'}`,{method:'POST',headers:{Authorization:`Bearer ${e.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(45000)});if(!r.ok){writeFileSync(dir+'/history-purge-error.txt',await r.text(),{mode:0o600});throw Error('DEV history query HTTP '+r.status+'; inspect private diagnostics; do not blindly retry')}return r.json()}
const tables=Object.keys(original);assert.ok(tables.every(t=>/^(?:greenbel_private\.)?[a-z_]+$/.test(t)));
const snapshotSQL='select jsonb_build_object('+tables.map(t=>`'${t}',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from ${relation(t)} t)`).join(',')+') as snapshot';
const current=(await query(snapshotSQL))[0].snapshot;
const targets={};const columns={user_roles:'user_id',inventory_balances:'product_id',dev_payment_events:'event_key',checkout_review_requests:'request_key','greenbel_private.staff_order_operations':'idempotency_key'};
const select=(table,ids)=>{const set=new Set(ids);const key=columns[table]||'id';targets[table]=current[table].filter(r=>set.has(r[key])).map(r=>r[key])};
for(const t of ['orders','order_items','stock_reservations','inventory_operations','inventory_movements','dev_payment_events','payments','shipments','shipping_proposals','service_cases','service_case_items','refunds','reviews','carrier_settlements','settlement_receipts','quotes','quote_items','financing_requests','guest_access_grants','checkout_review_requests','delivery_services','delivery_zones','service_zone_rates','service_payment_options','trainings','contact_messages','product_offers','product_specs','product_inclusions','product_images','brands','categories'])select(t,original[t].map(r=>r[columns[t]||'id']));
select('greenbel_private.staff_order_operations',privateOriginal.staff_order_operations.filter(r=>orderIds.has(r.order_id)).map(r=>r.idempotency_key));
assert.equal(targets['greenbel_private.staff_order_operations'].length,37,'Private journal scope mismatch');
select('products',[...fixtureProductIds]);select('inventory_balances',[...fixtureProductIds]);select('profiles',[...fixtureUserIds]);select('user_roles',[...fixtureUserIds]);select('audit_events',[...auditIds]);
for(const id of targets.products){const now=current.products.find(p=>p.id===id),old=initial.products.find(p=>p.id===id);assert.equal(now.sku,old.sku);assert.equal(now.name,old.name);assert.equal(now.publication_status,'archived')}
for(const t of ['delivery_services','delivery_zones'])assert.ok(current[t].filter(r=>targets[t].includes(r.id)).every(r=>/^PRUEBA DEV/i.test(r.name)));
for(const p of current.products.filter(p=>!fixtureProductIds.has(p.id)))assert.ok(!targets.products.includes(p.id));
const fixtureReview=current.checkout_review_requests.filter(r=>targets.checkout_review_requests.includes(r.request_key));assert.ok(fixtureReview.every(r=>fixtureUserIds.has(r.customer_id)||[...fixtureProductIds].some(id=>JSON.stringify(r).includes(id))),'Checkout request not identified as fixture');
const disabled=[['inventory_operations','inventory_operations_immutable'],['inventory_movements','inventory_movements_immutable'],['order_items','order_items_guard_change'],['quotes','quotes_guard_change'],['quote_items','quote_items_guard_change'],['financing_requests','financing_requests_guard_draft'],['guest_access_grants','guest_access_grants_guard_change'],['settlement_receipts','settlement_receipts_immutable'],['audit_events','audit_events_immutable']];
const schemaSQL="select jsonb_build_object('rls',(select jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','greenbel_private') and c.relkind='r'),'triggers',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','greenbel_private') and not t.tgisinternal)) as schema";
const beforeSchema=(await query(schemaSQL))[0].schema;
for(const [table,name]of disabled){const actual=beforeSchema.triggers.find(t=>t.table===table&&t.name===name),prior=initial.guards.find(t=>t.table===table&&t.name===name);assert.ok(actual&&prior&&actual.enabled==='O'&&actual.definition===prior.definition,'Immutable guard drift')}
const fks=JSON.parse(readFileSync(dir+'/all-app-foreign-keys.json'));
const order=[],visited=new Set(),visiting=new Set();function visit(t){if(visited.has(t))return;assert.ok(!visiting.has(t),'Unexpected FK cycle');visiting.add(t);for(const fk of fks){const parent=fk.parent.replace('public.',''),child=fk.child.replace('public.','');if(parent===t&&child!==t&&child in targets)visit(child)}visiting.delete(t);visited.add(t);order.push(t)}for(const t of Object.keys(targets))visit(t);
const lit=ids=>{assert.ok(ids.every(x=>typeof x==='string'&&x.length>0&&x.length<=200));return ids.length?ids.map(x=>"'"+x.replaceAll("'","''")+"'").join(','):'null'};
for(const [t,ids]of Object.entries(targets)){lit(ids);assert.equal(new Set(ids).size,ids.length,'Duplicate target key in '+t)}
const plan=Object.fromEntries(order.map(t=>[t,targets[t].length]));console.log(JSON.stringify({mode:args.has('--apply')?'apply':'plan',targets:plan,temporarily_suspended_delete_guards:disabled.length,protected_accounts:protectedUsers.length}));
writeFileSync(dir+'/reviewed-history-plan.json',JSON.stringify({targets,columns,disabled,order,approved:'User explicitly approved DEV-only exception 2026-10-22'},null,2),{mode:0o600});
if(args.has('--plan'))process.exit(0);
assert.equal(targets.products.length,24,'Expected remaining fixture catalog differs');assert.equal(targets.profiles.length,45,'Expected remaining fixture accounts differs');assert.equal(current.products.length-targets.products.length,116,'Company catalog count mismatch');
writeFileSync(dir+'/public-before-history-purge.json',JSON.stringify(current,null,2),{mode:0o600});writeFileSync(dir+'/schema-before-history-purge.json',JSON.stringify(beforeSchema,null,2),{mode:0o600});
const storage=(await query("select coalesce(jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'name',name,'owner_id',owner_id)),'[]') as objects from storage.objects"))[0].objects;
const originalStorage=JSON.parse(readFileSync(dir+'/storage-before.json')).objects;
const storageTargets=storage.filter(o=>originalStorage.some(a=>a.bucket_id===o.bucket_id&&a.name===o.name)&&o.bucket_id!=='profile-avatars');
assert.ok(storageTargets.every(o=>['product-images','quote-pdfs','training-covers'].includes(o.bucket_id)));
writeFileSync(dir+'/storage-before-history-purge.json',JSON.stringify(storage,null,2),{mode:0o600});
const service=createClient(e.DEV_SUPABASE_URL,e.DEV_SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});mkdirSync(dir+'/removed-history-storage',{recursive:true,mode:0o700});
for(const o of storageTargets){const r=await service.storage.from(o.bucket_id).download(o.name);assert.ok(!r.error&&r.data,'Private file backup failed');writeFileSync(dir+'/removed-history-storage/'+o.bucket_id+'-'+o.name.replaceAll('/','_'),Buffer.from(await r.data.arrayBuffer()),{mode:0o600})}
const protectedPublic=Object.fromEntries(tables.map(t=>{const key=columns[t]||'id';const ids=new Set(targets[t]||[]);return[t,current[t].filter(r=>!ids.has(r[key]))]}));
function canon(v){if(Array.isArray(v))return v.map(canon);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])]));return v}
const fingerprint=data=>createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(data).sort().map(t=>[t,data[t].map(canon).map(r=>JSON.stringify(r)).sort()])))).digest('hex');
const expectedFingerprint=fingerprint(protectedPublic);
const body=order.map(t=>{const key=columns[t]||'id',predicate=`${key} in(${lit(targets[t])})`;if(t==='categories')return`loop delete from public.categories c where ${predicate} and not exists(select 1 from public.categories child where child.parent_id=c.id); exit when not found; end loop;`;if(t==='quotes')return`loop delete from public.quotes q where ${predicate} and not exists(select 1 from public.quotes child where child.supersedes_id=q.id); exit when not found; end loop;`;return`delete from ${relation(t)} where ${predicate};`}).join('\n');
const rowGuards=Object.entries(targets).filter(([,ids])=>ids.length).map(([t,ids])=>{const key=columns[t]||'id';const expected=JSON.stringify(current[t].filter(r=>ids.includes(r[key]))).replaceAll("'","''");return `if exists((select to_jsonb(r) from ${relation(t)} r where ${key} in(${lit(ids)}) except select value from jsonb_array_elements('${expected}'::jsonb)) union all (select value from jsonb_array_elements('${expected}'::jsonb) except select to_jsonb(r) from ${relation(t)} r where ${key} in(${lit(ids)}))) then raise exception 'Reviewed fixture rows changed in ${t}; abort maintenance'; end if;`}).join('\n');
const sql=`begin;set local lock_timeout='5s';set local statement_timeout='25s';
lock table ${Object.keys(targets).sort().map(relation).join(',')} in access exclusive mode;
do $gate$ begin
 ${rowGuards}
 if (select count(*) from public.products where id in(${lit(targets.products)}) and publication_status='archived' and sku ~* '^(PRUEBA DEV|DEV-QA-|QA-)')<>${targets.products.length} then raise exception 'Fixture product drift'; end if;
 if exists(select 1 from public.profiles where id in(${lit(protectedUsers.map(u=>u.id))}) and not active) then raise exception 'Protected user access drift'; end if;
end $gate$;
${disabled.map(([t,n])=>`alter table public.${t} disable trigger ${n};`).join('\n')}
do $cleanup$ begin
${body}
delete from auth.users where id in(${lit(targets.profiles)});
${Object.entries(targets).map(([t,ids])=>`if exists(select 1 from ${relation(t)} where ${columns[t]||'id'} in(${lit(ids)})) then raise exception 'Reviewed fixture IDs remain in ${t}'; end if;`).join('\n')}
end $cleanup$;
${disabled.map(([t,n])=>`alter table public.${t} enable trigger ${n};`).join('\n')}
commit;select 'DEV reviewed fixture history removed' as status;`;
writeFileSync(dir+'/history-purge-reviewed.sql',sql,{mode:0o600});
await query(sql,true);
const after=(await query(snapshotSQL))[0].snapshot;assert.equal(fingerprint(after),expectedFingerprint,'Non-target public data changed; stop and inspect private backup');
const afterSchema=(await query(schemaSQL))[0].schema;assert.deepEqual(afterSchema,beforeSchema,'RLS or trigger state changed');
const authCheck=await query(`select count(*)::int as protected_users from auth.users where id in(${lit(protectedUsers.map(u=>u.id))})`);assert.equal(authCheck[0].protected_users,3);
for(const o of storageTargets){const r=await service.storage.from(o.bucket_id).remove([o.name]);assert.ok(!r.error,'File deletion pending after successful data transaction; backup retained')}
const result={time:new Date().toISOString(),approval:'Explicit user DEV-only exception 2026-10-22',deleted:plan,deleted_storage_objects:storageTargets.length,protected_public_fingerprint:expectedFingerprint,protected_accounts:3,guards_restored:true,rls_unchanged:true};
writeFileSync(dir+'/history-purge-result.json',JSON.stringify(result,null,2),{mode:0o600});writeFileSync('docs/catalog-import/history-purge-verification.json',JSON.stringify(result,null,2)+'\n');console.log('PASS: exact fixture history removed; non-target public data fingerprint preserved; all 9 delete guards restored; RLS unchanged.');

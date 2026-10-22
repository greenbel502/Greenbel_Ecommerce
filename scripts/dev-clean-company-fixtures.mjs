/** One-time DEV cleanup of explicitly identified QA rows. No trigger/RLS bypass, no reset. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const mode=process.argv[2]; assert.ok(['--plan','--apply'].includes(mode) && process.argv.length===3,'Choose --plan or --apply');
const e=process.env,ref=e.SUPABASE_DEV_PROJECT_REF?.trim(); assert.equal(e.APP_ENV,'DEV');
assert.equal(new URL(e.DEV_SUPABASE_URL).hostname,ref+'.supabase.co');assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),ref);
const directory='/Users/diederichsolis/.codex/private/greenbel-dev-catalog-20261022';
const initial=JSON.parse(readFileSync(directory+'/inventory-before.json','utf8'));
const baseline=JSON.parse(readFileSync(directory+'/public-before.json','utf8'));
const fks=JSON.parse(readFileSync(directory+'/foreign-keys.json','utf8'));
const storage=JSON.parse(readFileSync(directory+'/storage-before.json','utf8'));
const protectedId=initial.auth_users.find(u=>u.email?.toLowerCase()==='diederich.josue.emidio@gmail.com')?.id;
assert.ok(protectedId,'Operational admin missing');
const testText=value=>/^(PRUEBA DEV|DEV-QA-|QA-)/i.test(value??'');
const productCandidates=initial.products.filter(p=>testText(p.name)&&testText(p.sku));assert.equal(productCandidates.length,36);
const historyIds=new Set(['inventory_movements','inventory_operations','order_items','quote_items','reviews'].flatMap(t=>baseline[t].map(r=>r.product_id)));
const deletableProducts=productCandidates.filter(p=>!historyIds.has(p.id));
const trainingIds=initial.trainings.filter(t=>testText(t.title)).map(t=>t.id);
const fixtureUsers=initial.auth_users.filter(u=>u.id!==protectedId && (u.email?.endsWith('@example.invalid') || u.metadata?.test_fixture));
const uuid=/^[a-f0-9-]{36}$/;
const list=ids=>{assert.ok(ids.every(id=>uuid.test(id)));return ids.length?ids.map(id=>`'${id}'::uuid`).join(','):'null::uuid'};
const fixtureUserIds=fixtureUsers.map(u=>u.id), productIds=productCandidates.map(p=>p.id), deleteIds=deletableProducts.map(p=>p.id);
const brandIds=initial.brands.filter(b=>testText(b.name)).map(b=>b.id), categoryIds=initial.categories.filter(c=>testText(c.name)).map(c=>c.id);
const contacts=initial.contact_messages.filter(c=>Object.values(c).some(v=>typeof v==='string'&&(/@example\.invalid$/.test(v)||testText(v)))).map(c=>c.id);
async function query(sql,write=false){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query${write?'':'/read-only'}`,{method:'POST',headers:{Authorization:`Bearer ${e.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(45000)});if(!r.ok){writeFileSync(directory+'/last-cleanup-error.txt',await r.text(),{mode:0o600});throw Error('DEV query HTTP '+r.status+'; private diagnostics saved')}return r.json()}
const tables=Object.keys(baseline);assert.ok(tables.every(t=>/^[a-z_]+$/.test(t)));
const fresh=(await query('select jsonb_build_object('+tables.map(t=>`'${t}',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.${t} t)`).join(',')+') as snapshot'))[0].snapshot;
const profileReferences=fks.filter(f=>f.parent.replace('public.','')==='profiles' && f.child.replace('public.','')!=='user_roles').map(f=>{const match=f.definition.match(/^FOREIGN KEY \((\w+)\) REFERENCES (?:public\.)?profiles\(id\)/);assert.ok(match);const table=f.child.replace('public.','');assert.ok(/^[a-z_]+$/.test(table));return{table,column:match[1]}});
const safeUserIds=fixtureUserIds.filter(id=>!profileReferences.some(f=>fresh[f.table]?.some(r=>r[f.column]===id))&&!storage.objects.some(o=>o.owner_id===id));
const imageObjects=initial.product_images.filter(i=>deleteIds.includes(i.product_id)).map(i=>({bucket_id:'product-images',name:i.storage_path}));
const trainingObjects=storage.objects.filter(o=>o.bucket_id==='training-covers'&&trainingIds.some(id=>o.name.startsWith(id+'/')));
const plan={products_to_delete:deleteIds.length,products_to_archive:productIds.length-deleteIds.length,training_to_delete:trainingIds.length,contacts_to_delete:contacts.length,auth_users_to_delete:safeUserIds.length,auth_users_retained_with_dependencies:fixtureUserIds.length-safeUserIds.length,protected_non_fixture_accounts:initial.auth_users.length-fixtureUsers.length,objects_to_remove:imageObjects.length+trainingObjects.length};
console.log(JSON.stringify({mode,...plan}));
writeFileSync(directory+'/cleanup-plan.json',JSON.stringify({plan,deleteIds,productIds,trainingIds,safeUserIds,imageObjects,trainingObjects},null,2),{mode:0o600});
if(mode==='--plan')process.exit(0);
writeFileSync(directory+'/public-immediately-before-cleanup.json',JSON.stringify(fresh,null,2),{mode:0o600});
const service=createClient(e.DEV_SUPABASE_URL,e.DEV_SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
// Backup the exact files scheduled for deletion before touching rows or Storage.
mkdirSync(directory+'/removed-storage',{recursive:true,mode:0o700});
for(const o of [...imageObjects,...trainingObjects]){const r=await service.storage.from(o.bucket_id).download(o.name);assert.ok(!r.error&&r.data,'Storage backup unavailable');const target=o.bucket_id+'-'+o.name.replaceAll('/','_');writeFileSync(directory+'/removed-storage/'+target,Buffer.from(await r.data.arrayBuffer()),{mode:0o600})}
const publicReferenceChecks=profileReferences.map(f=>`not exists(select 1 from public.${f.table} r where r.${f.column}=u.id)`).join(' and ');
const sql=`begin;set local lock_timeout='5s';set local statement_timeout='25s';
do $cleanup$ declare affected integer; begin
 if not exists(select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id where ur.user_id='${protectedId}' and ur.role='admin' and pr.active) then raise exception 'Protected operational admin unavailable'; end if;
 if exists(select 1 from public.products where id in(${list(productIds)}) and (name !~* '^(PRUEBA DEV|DEV-QA-|QA-)' or sku !~* '^(PRUEBA DEV|DEV-QA-|QA-)')) then raise exception 'Fixture identity changed; stop cleanup'; end if;
 update public.products set publication_status='archived' where id in(${list(productIds)}) and publication_status<>'archived';
 delete from public.training_products where training_id in(${list(trainingIds)});
 delete from public.training_categories where training_id in(${list(trainingIds)});
 delete from public.trainings where id in(${list(trainingIds)});
 delete from public.product_offers where product_id in(${list(productIds)});
 delete from public.product_specs where product_id in(${list(deleteIds)});
 delete from public.product_inclusions where product_id in(${list(deleteIds)});
 delete from public.product_images where product_id in(${list(deleteIds)});
 delete from public.products where id in(${list(deleteIds)});
 delete from public.contact_messages where id in(${list(contacts)});
 delete from public.brands b where id in(${list(brandIds)}) and not exists(select 1 from public.products p where p.brand_id=b.id);
 for affected in 1..10 loop
  delete from public.categories c where id in(${list(categoryIds)}) and not exists(select 1 from public.products p where p.category_id=c.id) and not exists(select 1 from public.categories ch where ch.parent_id=c.id) and not exists(select 1 from public.training_categories tc where tc.category_id=c.id);
  exit when not found;
 end loop;
 -- Recheck every public FK inside the same transaction; new dependencies abort rather than bypass integrity.
 if (select count(*) from auth.users u where id in(${list(safeUserIds)}) and ${publicReferenceChecks} and not exists(select 1 from storage.objects o where o.owner_id=u.id::text))<>${safeUserIds.length} then raise exception 'Account dependencies changed'; end if;
 delete from public.user_roles where user_id in(${list(safeUserIds)});
 delete from public.profiles where id in(${list(safeUserIds)});
 delete from auth.users where id in(${list(safeUserIds)});
 if not exists(select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id where ur.user_id='${protectedId}' and ur.role='admin' and pr.active) then raise exception 'Operational access not preserved'; end if;
end $cleanup$;commit;
select (select count(*)::int from public.products where id in(${list(deleteIds)})) as deleted_products_remaining,(select count(*)::int from auth.users where id in(${list(safeUserIds)})) as deleted_users_remaining;`;
const result=await query(sql,true);assert.equal(result[0].deleted_products_remaining,0);assert.equal(result[0].deleted_users_remaining,0);
for(const o of [...imageObjects,...trainingObjects]){const r=await service.storage.from(o.bucket_id).remove([o.name]);assert.ok(!r.error,'Storage removal failed; backup retained')}
writeFileSync(directory+'/cleanup-result.json',JSON.stringify({time:new Date().toISOString(),plan,result},null,2),{mode:0o600});
console.log('PASS: bounded DEV cleanup committed; immutable history and operational accounts retained.');

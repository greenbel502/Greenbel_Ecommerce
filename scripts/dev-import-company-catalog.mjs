/** Explicit, idempotent company price import. Never resets a database or creates stock. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const args = new Set(process.argv.slice(2));
assert.ok([...args].every(a => ['--apply','--verify','--equipment-only','--agricultural-approved','--rounding-approved'].includes(a)), 'Unknown option');
assert.notEqual(args.has('--apply'), args.has('--verify'), 'Choose exactly --apply or --verify');
const e=process.env, ref=e.SUPABASE_DEV_PROJECT_REF?.trim();
assert.equal(e.APP_ENV,'DEV','DEV only');
const url=new URL(e.DEV_SUPABASE_URL); assert.equal(url.protocol,'https:'); assert.equal(url.hostname,`${ref}.supabase.co`);
assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),ref,'Linked DEV mismatch');
assert.ok(e.SUPABASE_ACCESS_TOKEN,'Tool token missing');
const manifest=JSON.parse(readFileSync('docs/catalog-import/company-catalog-20261022.json','utf8'));
assert.equal(manifest.currency,'GTQ'); assert.equal(manifest.tax_included,true);
const products=manifest.products.filter(p=>!args.has('--equipment-only') || p.kind==='equipment');
if(products.some(p=>p.kind==='agricultural')) assert.ok(args.has('--agricultural-approved') && args.has('--rounding-approved'),'Agricultural type and cent rounding approval required');
assert.equal(new Set(products.map(p=>p.sku)).size,products.length,'Duplicate SKU');
const slug=text=>text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
for(const p of products){
 assert.ok(p.sku.length<=100 && p.name.length<=240 && p.name.trim());
 assert.ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug));
 assert.ok(/^\d+\.\d{2}$/.test(p.regular_price) && Number(p.regular_price)>0);
 p.brand_slug=slug(p.brand); p.category_slug=slug(p.category);
}
for(const p of products) p.publication_status=p.sku==='SY1100'?'draft':'published';
const literal=JSON.stringify(products).replaceAll("'","''");
let query;
if(args.has('--apply')) query=`begin;
set local lock_timeout='5s'; set local statement_timeout='25s';
do $import$
declare p jsonb; bid uuid; cid uuid; existing public.products; actual_count integer;
begin
 for p in select value from jsonb_array_elements('${literal}'::jsonb) loop
   insert into public.brands(name,slug,active) values(p->>'brand',p->>'brand_slug',true) on conflict(slug) do nothing;
   select id into strict bid from public.brands where slug=p->>'brand_slug' and name=p->>'brand' and active;
   insert into public.categories(name,slug,active) values(p->>'category',p->>'category_slug',true) on conflict(slug) do nothing;
   select id into strict cid from public.categories where slug=p->>'category_slug' and name=p->>'category' and active;
   insert into public.products(sku,slug,name,model,kind,brand_id,category_id,regular_price,currency,publication_status)
   values(p->>'sku',p->>'slug',p->>'name',p->>'model',p->>'kind',bid,cid,(p->>'regular_price')::numeric,'GTQ',coalesce(p->>'publication_status','published')) on conflict(sku) do nothing;
   select * into strict existing from public.products where sku=p->>'sku';
   if existing.slug is distinct from p->>'slug' or existing.name is distinct from p->>'name'
      or existing.model is distinct from p->>'model' or existing.kind is distinct from p->>'kind'
      or existing.brand_id<>bid or existing.category_id<>cid or existing.regular_price<>(p->>'regular_price')::numeric
      or existing.currency<>'GTQ' or existing.publication_status<>coalesce(p->>'publication_status','published') then
     raise exception 'Existing SKU conflicts with reviewed source; import rolled back';
   end if;
   insert into public.product_specs(product_id,label,value,sort_order)
   select existing.id,s.value->>'label',s.value->>'value',(s.ordinality-1)::integer
   from jsonb_array_elements(p->'specs') with ordinality as s(value,ordinality)
   where not exists(select 1 from public.product_specs ps where ps.product_id=existing.id and ps.label=s.value->>'label' and ps.value=s.value->>'value');
 end loop;
end $import$;
commit;
select count(*)::int as source_products from public.products where sku in(select value->>'sku' from jsonb_array_elements('${literal}'::jsonb));`;
else query=`with source as (select value as p from jsonb_array_elements('${literal}'::jsonb))
select count(stored.id)::int as source_products,
 count(*) filter(where stored.name=s.p->>'name' and stored.regular_price=(s.p->>'regular_price')::numeric and stored.kind=s.p->>'kind' and stored.currency='GTQ' and stored.publication_status=s.p->>'publication_status')::int as correct_stored_products,
 count(*) filter(where c.name=s.p->>'name' and c.regular_price=(s.p->>'regular_price')::numeric and c.kind=s.p->>'kind' and c.currency='GTQ')::int as correct_public_products,
 count(*) filter(where s.p->>'publication_status'='published')::int as expected_public_products,
 count(*) filter(where a.verified=false and a.available=false)::int as inventory_unknown
 from source s left join public.products stored on stored.sku=s.p->>'sku' left join public.catalog_products c on c.sku=s.p->>'sku' left join public.product_availability a on a.product_id=c.id;`;
const endpoint=args.has('--apply')?'database/query':'database/query/read-only';
const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${e.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(45000)});
if(!response.ok){console.error('FAIL: DEV import HTTP',response.status,'; inspect private diagnostics before retry.');process.exit(1)}
const result=await response.json(); console.log(JSON.stringify({operation:args.has('--apply')?'apply':'verify',expected:products.length,source_sha256:manifest.source_sha256,result}));
assert.equal(result[0]?.source_products,products.length,'Source count mismatch');
if(args.has('--verify')) { assert.equal(result[0]?.correct_stored_products,products.length,'Stored source mismatch'); assert.equal(result[0]?.correct_public_products,result[0]?.expected_public_products,'Public source mismatch'); }

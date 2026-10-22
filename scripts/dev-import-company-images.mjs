/** Associate only reviewed image sources with company SKUs, in DEV private Storage. */
import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,existsSync,mkdirSync}from'node:fs';
import{createHash}from'node:crypto';
import sharp from 'sharp';
import{createClient}from'@supabase/supabase-js';
const mode=process.argv[2];assert.ok(['--apply','--verify'].includes(mode)&&process.argv.length===3,'Choose --apply or --verify');
const e=process.env,ref=e.SUPABASE_DEV_PROJECT_REF?.trim();assert.equal(e.APP_ENV,'DEV');assert.equal(new URL(e.DEV_SUPABASE_URL).hostname,ref+'.supabase.co');assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),ref);
const client=createClient(e.DEV_SUPABASE_URL,e.DEV_SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const sources=['equipment','agricultural'].flatMap(group=>JSON.parse(readFileSync(`docs/catalog-import/${group}-image-sources.json`))).filter(r=>r.status==='downloaded');
assert.equal(new Set(sources.map(r=>r.sku)).size,sources.length,'Ambiguous source mapping');
const company=JSON.parse(readFileSync('docs/catalog-import/company-catalog-20261022.json')).products;
const dir='/Users/diederichsolis/.codex/private/greenbel-dev-catalog-20261022/company-images';mkdirSync(dir,{recursive:true,mode:0o700});
const results=[];
for(const source of sources){
 assert.ok(company.some(p=>p.sku===source.sku),'SKU outside reviewed workbook');
 const productResult=await client.from('products').select('id,name,sku').eq('sku',source.sku).single();assert.ok(!productResult.error&&productResult.data,'Product unavailable');const product=productResult.data;
 let bytes;
 if(existsSync(dir+'/'+source.filename))bytes=readFileSync(dir+'/'+source.filename);
 else{assert.ok(source.image_url?.startsWith('https://'),'Original local resource is required');const r=await fetch(source.image_url,{signal:AbortSignal.timeout(25000)});assert.ok(r.ok,'Source download unavailable');bytes=Buffer.from(await r.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,'Source changed since review');writeFileSync(dir+'/'+source.filename,bytes,{mode:0o600})}
 assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,'Image checksum mismatch');assert.ok(bytes.length>0&&bytes.length<=8000000);
 const meta=await sharp(bytes).metadata();const extension={jpeg:'jpg',png:'png',webp:'webp',avif:'avif'}[meta.format];assert.ok(extension&&meta.width>20&&meta.height>20,'Unsupported image');
 const hash=createHash('sha256').update(source.sku+source.sha256).digest('hex');const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;const storagePath=product.id+'/'+id+'.'+extension;
 const existing=await client.from('product_images').select('id,is_primary,storage_path').eq('product_id',product.id).eq('storage_path',storagePath);assert.ok(!existing.error&&existing.data.length<=1,'Image record lookup failed');
 if(mode==='--apply'&&!existing.data.length){
  const upload=await client.storage.from('product-images').upload(storagePath,bytes,{contentType:extension==='jpg'?'image/jpeg':'image/'+extension,upsert:false});
  if(upload.error){const file=await client.storage.from('product-images').download(storagePath);assert.ok(!file.error&&file.data,'Upload failed');assert.equal(createHash('sha256').update(Buffer.from(await file.data.arrayBuffer())).digest('hex'),source.sha256,'Existing object differs')}
  const primary=await client.from('product_images').select('id').eq('product_id',product.id).eq('is_primary',true);assert.ok(!primary.error);
  const insert=await client.from('product_images').insert({id,product_id:product.id,storage_path:storagePath,alt_text:product.name+'. Imagen de referencia.',is_primary:primary.data.length===0,sort_order:0});assert.ok(!insert.error,'Image association failed; object retained for explicit retry');
 }
 const check=await client.from('product_images').select('id,is_primary').eq('id',id).single();assert.ok(!check.error&&check.data,'Image association missing');
 if(mode==='--verify'){const object=await client.storage.from('product-images').download(storagePath);assert.ok(!object.error&&object.data,'Private image missing');assert.equal(createHash('sha256').update(Buffer.from(await object.data.arrayBuffer())).digest('hex'),source.sha256,'Stored bytes mismatch')}
 results.push({sku:source.sku,image_id:id,width:meta.width,height:meta.height,status:'PASS'});
}
writeFileSync('docs/catalog-import/image-verification.json',JSON.stringify({mode,time:new Date().toISOString(),verified:results.length,results},null,2)+'\n');console.log('PASS:',mode,sources.length,'reviewed company product images in DEV; private bucket retained.');

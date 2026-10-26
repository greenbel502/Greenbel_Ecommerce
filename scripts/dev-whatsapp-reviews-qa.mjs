import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {randomUUID,randomBytes}from'node:crypto';import{createClient}from'@supabase/supabase-js';import{createServerClient}from'@supabase/ssr';
const e=process.env;assert.equal(e.APP_ENV,'DEV');assert.equal(fs.readFileSync('supabase/.temp/project-ref','utf8').trim(),e.SUPABASE_DEV_PROJECT_REF);assert.equal(new URL(e.DEV_SUPABASE_URL).hostname,e.SUPABASE_DEV_PROJECT_REF+'.supabase.co');
const db=createClient(e.DEV_SUPABASE_URL,e.DEV_SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),origin='http://localhost:3000';
const dir=os.homedir()+'/.codex/private/greenbel-reviews32-qa';fs.mkdirSync(dir,{recursive:true,mode:0o700});const journal=dir+'/current.json';
const need=r=>{assert.ok(!r.error,r.error?.code);return r.data;};
let f=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal)):null;const save=()=>fs.writeFileSync(journal,JSON.stringify(f),{mode:0o600});
if(!f){f={tag:randomUUID().slice(0,8),users:[],createdAt:new Date().toISOString(),uiReviewIds:[],uiInvitationIds:[]};f.marker='QA Reseñas '+f.tag;save();
for(const role of ['owner','other']){const email='greenbel502+reviews-'+f.tag+'-'+role+'@gmail.com',password=randomBytes(24).toString('base64url')+'Aa1!';const user=need(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:f.marker}})).user;const row={id:user.id,role,email,password};f.users.push(row);save();need(await db.from('profiles').update({display_name:f.marker+' '+role}).eq('id',user.id));const jar=new Map();const client=createServerClient(e.DEV_SUPABASE_URL,e.DEV_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:a=>a.forEach(v=>jar.set(v.name,v.value))}});need(await client.auth.signInWithPassword({email,password}));row.cookie=[...jar].map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('; ');save();}
f.productId=need(await db.from('catalog_products').select('id').eq('sku','FUT1023').single()).id;save();}
assert.ok(!f.cleaned,'QA journal already cleaned');
const owner=f.users.find(u=>u.role==='owner'),other=f.users.find(u=>u.role==='other'),results=[];
const check=(label,ok)=>{assert.ok(ok,label);results.push({label,status:'PASS'});console.log('PASS:',label);};
async function post(path,body,cookie=owner.cookie,source=origin){return fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',origin:source,cookie},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});}
const input={lines:[{productId:f.productId,quantity:2}],preferences:{paymentMethod:'cash',deliveryMethod:'pickup'}};
if(!f.invitationId){const pdf=await post('/api/cart/whatsapp/pdf',input);check('Real authenticated purchase PDF generated',pdf.status===200);f.invitationId=pdf.headers.get('X-Greenbel-Review-Invitation');f.reference=pdf.headers.get('X-Greenbel-Selection-Reference');save();check('Server issued owned review invitation',/^[0-9a-f-]{36}$/.test(f.invitationId??''));}
const body={invitationId:f.invitationId,rating:4,comment:f.marker+' · Prueba técnica privada, pendiente de moderación.'};
async function expect(label,payload,status,cookie=owner.cookie,source=origin){const r=await post('/api/cart/whatsapp/reviews',payload,cookie,source);const text=await r.text();check(label,r.status===status);for(const secret of [e.DEV_SUPABASE_SECRET_KEY,e.SUPABASE_ACCESS_TOKEN,owner.cookie].filter(Boolean))assert.ok(!text.includes(secret),'No secret response');return JSON.parse(text);}
await expect('Anonymous customer denied',body,401,'');
await expect('Foreign customer invitation denied',body,403,other.cookie);
await expect('Cross-origin review denied',body,403,owner.cookie,'https://evil.example');
await expect('Forged moderation rejected',{...body,moderationStatus:'visible'},400);
await expect('Six-star review rejected',{...body,rating:6},400);
await expect('Excessive body rejected',{...body,comment:'a'.repeat(17000)},413);
const saved=await expect('Review persisted successfully',body,200);f.reviewId=saved.id;save();
const repeated=await expect('Safe identical retry',body,200);check('Retry returns same identifier',repeated.id===f.reviewId);
await expect('Second changed review rejected',{...body,rating:1},409);
const review=need(await db.from('whatsapp_reviews').select('id,invitation_id,rating,comment,moderation_status').eq('id',f.reviewId).single());check('Stored original fields and pending status',review.moderation_status==='pending'&&review.rating===4&&review.comment===body.comment);
const inbox=need(await db.from('admin_review_inbox').select('id,source,reference,customer_name').eq('id',f.reviewId).single());check('Unified admin inbox has WhatsApp origin',inbox.source==='whatsapp'&&inbox.reference===f.reference);
const anon=createClient(e.DEV_SUPABASE_URL,e.DEV_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const pub=need(await anon.rpc('published_whatsapp_reviews'));check('Pending review absent from public opinions',!pub.some(r=>r.id===f.reviewId));const raw=await anon.from('whatsapp_reviews').select('*');check('Anonymous cannot read raw reviews',!!raw.error);
fs.writeFileSync('docs/qa/2026-10-26-resenas/http.json',JSON.stringify({environment:'DEV',results},null,2));f.httpChecked=true;save();

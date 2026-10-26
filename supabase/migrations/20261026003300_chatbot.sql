-- Model 033 approved explicitly on 26/10/2026, DEV only.
-- Retrieval assistant, no generative API, no checkout/inventory mutations.
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create function public.chatbot_normalize(p_text text) returns text
language sql immutable parallel safe security definer set search_path=pg_catalog,pg_temp as $$
 select lower(extensions.unaccent(coalesce(p_text,'')));
$$;
revoke all on function public.chatbot_normalize(text) from public,anon,authenticated,service_role;
grant execute on function public.chatbot_normalize(text) to anon,authenticated,service_role;

create table public.chatbot_knowledge (
 id uuid primary key default gen_random_uuid(), question text not null check(char_length(question) between 5 and 240),
 answer text not null check(char_length(answer) between 10 and 4000),
 category text not null check(category in('greenbel','pagos','envios','financiamiento','posventa','contacto','compras','capacitaciones')),
 keywords text not null default '' check(char_length(keywords)<=500), source_path text not null check(source_path ~ '^/(contacto|financiamiento|productos|nosotros|carrito|capacitaciones|legal/(privacidad|terminos|garantias))(#[a-z0-9_-]+)?$'),
 source_note text not null check(char_length(source_note) between 5 and 500), is_active boolean not null default false,
 verified boolean not null default false, verified_at timestamptz, deleted_at timestamptz,
 content_hash text not null, search_vector tsvector not null,
 embedding extensions.vector(384), embedding_model text,
 embedding_status text not null default 'pending' check(embedding_status in('pending','ready','error')),
 embedding_error text check(char_length(embedding_error)<=120),
 created_by uuid references public.profiles(id) on delete restrict, edited_by uuid references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(not is_active or verified), check(not verified or verified_at is not null),
 check((embedding_status='ready' and embedding is not null and embedding_model='intfloat/multilingual-e5-small:mean:l2:384:v1') or (embedding_status<>'ready' and embedding is null))
);
create index chatbot_knowledge_search_idx on public.chatbot_knowledge using gin(search_vector);
create index chatbot_knowledge_trgm_idx on public.chatbot_knowledge using gin(public.chatbot_normalize(question||' '||keywords) extensions.gin_trgm_ops);
create index chatbot_knowledge_vector_idx on public.chatbot_knowledge using hnsw(embedding extensions.vector_cosine_ops) where is_active and verified and deleted_at is null and embedding_status='ready';
create index chatbot_knowledge_category_idx on public.chatbot_knowledge(category,updated_at desc);
create index chatbot_products_text_idx on public.products using gin(to_tsvector('spanish',public.chatbot_normalize(name||' '||sku||' '||coalesce(model,'')||' '||coalesce(short_description,''))));
create index chatbot_products_trgm_idx on public.products using gin(public.chatbot_normalize(name||' '||sku||' '||coalesce(model,'')) extensions.gin_trgm_ops);

create table public.chatbot_embedding_jobs (
 knowledge_id uuid primary key references public.chatbot_knowledge(id) on delete cascade, content_hash text not null,
 status text not null default 'pending' check(status in('pending','processing','error','completed')),
 attempts integer not null default 0 check(attempts between 0 and 20), next_attempt_at timestamptz not null default now(),
 claimed_at timestamptz, claim_id uuid, error_code text check(char_length(error_code)<=120), updated_at timestamptz not null default now()
);
create index chatbot_embedding_jobs_pending_idx on public.chatbot_embedding_jobs(status,next_attempt_at);
create function greenbel_private.chatbot_knowledge_prepare() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare h text;
begin
 h:=encode(sha256(convert_to(new.question||E'\n'||new.answer||E'\n'||new.category||E'\n'||new.keywords,'UTF8')),'hex');
 new.content_hash:=h;
 new.search_vector:=setweight(to_tsvector('spanish',public.chatbot_normalize(new.question)),'A')||setweight(to_tsvector('spanish',public.chatbot_normalize(new.keywords)),'B')||setweight(to_tsvector('spanish',public.chatbot_normalize(new.answer)),'C');
 if tg_op='INSERT' or h is distinct from old.content_hash then new.embedding:=null;new.embedding_model:=null;new.embedding_status:='pending';new.embedding_error:=null;end if;
 new.updated_at:=now();return new;
end;$$;
create trigger chatbot_knowledge_prepare before insert or update on public.chatbot_knowledge for each row execute function greenbel_private.chatbot_knowledge_prepare();
create function greenbel_private.chatbot_knowledge_queue() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 if tg_op='INSERT' or new.content_hash is distinct from old.content_hash then
 insert into public.chatbot_embedding_jobs(knowledge_id,content_hash) values(new.id,new.content_hash)
 on conflict(knowledge_id) do update set content_hash=excluded.content_hash,status='pending',attempts=0,next_attempt_at=now(),claim_id=null,claimed_at=null,error_code=null,updated_at=now();
 end if;return new;end;$$;
create trigger chatbot_knowledge_queue after insert or update on public.chatbot_knowledge for each row execute function greenbel_private.chatbot_knowledge_queue();
revoke all on function greenbel_private.chatbot_knowledge_prepare(),greenbel_private.chatbot_knowledge_queue() from public,anon,authenticated,service_role;

create table public.chatbot_conversations (
 id uuid primary key, user_id uuid references public.profiles(id) on delete restrict,
 secret_hash text not null check(secret_hash ~ '^[a-f0-9]{64}$'), context jsonb not null default '{}'::jsonb check(jsonb_typeof(context)='object' and octet_length(context::text)<=4000),
 status text not null default 'open' check(status in('open','closed')), created_at timestamptz not null default now(),
 last_activity_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 days'
);
create index chatbot_conversations_activity_idx on public.chatbot_conversations(last_activity_at desc);
create index chatbot_conversations_owner_idx on public.chatbot_conversations(user_id,last_activity_at desc);
create table public.chatbot_messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.chatbot_conversations(id) on delete cascade,
 request_id uuid not null, role text not null check(role in('user','assistant')), content text not null check(char_length(content) between 1 and 5000),
 response_type text, payload jsonb check(payload is null or (jsonb_typeof(payload)='object' and octet_length(payload::text)<=32000)),
 reply_to uuid unique references public.chatbot_messages(id) on delete cascade,
 status text not null default 'processing' check(status in('processing','completed')), created_at timestamptz not null default now(), processing_started_at timestamptz not null default now(), attempts integer not null default 1 check(attempts between 1 and 3),
 unique(conversation_id,request_id,role), check((role='user' and reply_to is null) or (role='assistant' and reply_to is not null and status='completed'))
);
create index chatbot_messages_conversation_idx on public.chatbot_messages(conversation_id,created_at,id);
create table public.chatbot_rate_limits (
 key_hash text not null, window_start timestamptz not null, hits integer not null check(hits>0), primary key(key_hash,window_start)
);

alter table public.chatbot_knowledge enable row level security;
alter table public.chatbot_embedding_jobs enable row level security;
alter table public.chatbot_conversations enable row level security;
alter table public.chatbot_messages enable row level security;
alter table public.chatbot_rate_limits enable row level security;
revoke all on public.chatbot_knowledge,public.chatbot_embedding_jobs,public.chatbot_conversations,public.chatbot_messages,public.chatbot_rate_limits from public,anon,authenticated,service_role;
grant select on public.chatbot_knowledge,public.chatbot_embedding_jobs,public.chatbot_conversations,public.chatbot_messages to service_role;
grant select(id,question,answer,category,keywords,source_path,search_vector,content_hash,embedding,embedding_model,embedding_status,updated_at) on public.chatbot_knowledge to anon,authenticated;
create policy chatbot_knowledge_public_read on public.chatbot_knowledge for select to anon,authenticated using(is_active and verified and deleted_at is null);

-- Public retrieval is SECURITY INVOKER: the existing public catalogue RLS still applies.
create function public.chatbot_search_knowledge(p_query text,p_category text default null,p_embedding extensions.vector(384) default null)
returns table(id uuid,question text,answer text,category text,source_path text,score double precision,retrieval text)
language sql stable security invoker set search_path=pg_catalog,extensions,pg_temp as $$
 with params as(select websearch_to_tsquery('spanish',public.chatbot_normalize(left(coalesce(p_query,''),1000))) q,public.chatbot_normalize(left(coalesce(p_query,''),1000)) normalized),
 text_hits as(select k.id,row_number() over(order by ts_rank_cd(k.search_vector,p.q) desc,k.id) rank from public.chatbot_knowledge k cross join params p where k.search_vector@@p.q and (p_category is null or k.category=p_category) order by ts_rank_cd(k.search_vector,p.q) desc,k.id limit 20),
 fuzzy_hits as(select k.id,row_number() over(order by extensions.word_similarity(p.normalized,public.chatbot_normalize(k.question||' '||k.keywords)) desc,k.id) rank from public.chatbot_knowledge k cross join params p where (p_category is null or k.category=p_category) and extensions.word_similarity(p.normalized,public.chatbot_normalize(k.question||' '||k.keywords))>=0.25 order by extensions.word_similarity(p.normalized,public.chatbot_normalize(k.question||' '||k.keywords)) desc,k.id limit 20),
 vector_hits as(select k.id,row_number() over(order by k.embedding <=> p_embedding,k.id) rank from public.chatbot_knowledge k where p_embedding is not null and k.embedding_status='ready' and 1-(k.embedding <=> p_embedding)>=0.75 and k.embedding_model='intfloat/multilingual-e5-small:mean:l2:384:v1' and (p_category is null or k.category=p_category) order by k.embedding <=> p_embedding,k.id limit 20),
 ranks as(select id,1.0/(60+rank) score from text_hits union all select id,1.0/(60+rank) from fuzzy_hits union all select id,1.0/(60+rank) from vector_hits),
 fused as(select ranks.id,sum(ranks.score)::double precision score from ranks group by ranks.id)
 select k.id,k.question,k.answer,k.category,k.source_path,f.score,case when exists(select 1 from vector_hits v where v.id=k.id) then 'hybrid' else 'text' end from fused f join public.chatbot_knowledge k on k.id=f.id order by f.score desc,k.id limit 3;
$$;
revoke all on function public.chatbot_search_knowledge(text,text,extensions.vector) from public,anon,authenticated,service_role;
grant execute on function public.chatbot_search_knowledge(text,text,extensions.vector) to anon,authenticated;

create function public.chatbot_search_products(p_query text default '',p_related text[] default '{}',p_mode text default 'relevance',p_ids uuid[] default null,p_exclude uuid[] default null)
returns table(id uuid,slug text,sku text,name text,description text,category text,brand text,price numeric,regular_price numeric,verified boolean,available boolean,image_id uuid)
language sql stable security invoker set search_path=pg_catalog,extensions,pg_temp as $$
 with params as(select public.chatbot_normalize(left(coalesce(p_query,''),120)) q,websearch_to_tsquery('spanish',concat_ws(' OR ',nullif(left(p_query,120),''),nullif(array_to_string(p_related[1:8],' OR '),''))) terms),
 ranked as(select p.*,v.verified,v.available,
 case when public.chatbot_normalize(p.sku)=(select q from params) then 10 else 0 end+
 ts_rank_cd(to_tsvector('spanish',public.chatbot_normalize(p.name||' '||p.sku||' '||coalesce(p.model,'')||' '||coalesce(p.short_description,''))),(select terms from params))+
 extensions.word_similarity((select q from params),public.chatbot_normalize(p.name||' '||p.sku)) rank
 from public.catalog_products p join public.product_availability v on v.product_id=p.id cross join params q
 where (p_ids is null or p.id=any(p_ids[1:6])) and p.id<>all(coalesce(p_exclude[1:30],array[]::uuid[])) and
 (not exists(select 1 from public.catalog_products exact where public.chatbot_normalize(exact.sku)=q.q) or public.chatbot_normalize(p.sku)=q.q) and
 (q.q='' or public.chatbot_normalize(p.sku)=q.q or
 to_tsvector('spanish',public.chatbot_normalize(p.name||' '||p.sku||' '||coalesce(p.model,'')||' '||coalesce(p.short_description,'')))@@q.terms or
 to_tsvector('spanish',public.chatbot_normalize(p.category_name||' '||coalesce(p.brand_name,'')))@@q.terms or
 extensions.word_similarity(q.q,public.chatbot_normalize(p.name||' '||p.sku))>=0.35)
 and (p_mode<>'promotions' or p.effective_price<p.regular_price))
 select r.id,r.slug,r.sku,r.name,left(coalesce(nullif(r.short_description,''),r.description,''),800),r.category_name,coalesce(r.brand_name,''),r.effective_price,r.regular_price,r.verified,r.available,
 (select i.id from public.product_images i where i.product_id=r.id order by i.is_primary desc,i.sort_order,i.id limit 1)
 from ranked r order by case when p_mode='cheapest' then r.effective_price end asc nulls last,case when p_mode='relevance' then r.rank end desc,r.name,r.id limit 3;
$$;
revoke all on function public.chatbot_search_products(text,text[],text,uuid[],uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.chatbot_search_products(text,text[],text,uuid[],uuid[]) to anon,authenticated;

create function public.chatbot_catalog_categories() returns table(name text) language sql stable security invoker set search_path=pg_catalog,pg_temp as $$ select distinct category_name from public.catalog_products order by category_name limit 100; $$;
revoke all on function public.chatbot_catalog_categories() from public,anon,authenticated,service_role;
grant execute on function public.chatbot_catalog_categories() to anon,authenticated;

create function greenbel_private.chatbot_owner(p_id uuid,p_hash text,p_user uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.chatbot_conversations c where c.id=p_id and c.secret_hash=p_hash and c.user_id is not distinct from p_user and c.expires_at>now())
 and (p_user is null or exists(select 1 from public.profiles p where p.id=p_user and p.active));
$$;
create function greenbel_private.chatbot_rate(p_source text,p_identity text) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare k text;n integer;begin
 if p_source is null or p_source !~ '^[a-f0-9]{64}$' or p_identity is null or p_identity !~ '^[a-f0-9]{64}$' then raise exception 'Trusted rate identity required' using errcode='42501';end if;
 foreach k in array array['source:'||p_source,'identity:'||p_identity] loop
 insert into public.chatbot_rate_limits(key_hash,window_start,hits) values(k,date_trunc('minute',now()),1) on conflict(key_hash,window_start) do update set hits=chatbot_rate_limits.hits+1 returning hits into n;
 if n>(case when k like 'source:%' then 60 else 20 end) then raise exception 'Rate exceeded' using errcode='P4290';end if;end loop;
end;$$;
revoke all on function greenbel_private.chatbot_owner(uuid,text,uuid),greenbel_private.chatbot_rate(text,text) from public,anon,authenticated,service_role;

create function public.chatbot_begin(p_id uuid,p_new boolean,p_hash text,p_user uuid,p_request uuid,p_message text,p_source text,p_identity text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare c public.chatbot_conversations%rowtype;m public.chatbot_messages%rowtype;a jsonb;begin
 if p_id is null or p_request is null or p_new is null or char_length(btrim(coalesce(p_message,''))) not between 1 and 1000 or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid message' using errcode='22023';end if;
 if p_user is not null and not exists(select 1 from public.profiles where id=p_user and active) then raise exception 'Active profile required' using errcode='42501';end if;
 select * into c from public.chatbot_conversations where id=p_id for update;
 if not found then
   if not p_new then raise exception 'Conversation access denied' using errcode='42501';end if;
   perform greenbel_private.chatbot_rate(p_source,p_identity);
   insert into public.chatbot_conversations(id,user_id,secret_hash) values(p_id,p_user,p_hash) on conflict(id) do nothing returning * into c;
   if not found then return public.chatbot_begin(p_id,false,p_hash,p_user,p_request,p_message,p_source,p_identity);end if;
 else
   if not greenbel_private.chatbot_owner(p_id,p_hash,p_user) then raise exception 'Conversation access denied' using errcode='42501';end if;
   select * into m from public.chatbot_messages where conversation_id=p_id and request_id=p_request and role='user';
   if found then
     if m.content<>btrim(p_message) then raise exception 'Request key reused' using errcode='P4090';end if;
     select payload into a from public.chatbot_messages where reply_to=m.id;
     if a is not null then return jsonb_build_object('status','ready','answer',a,'messageId',m.id);end if;
     if m.processing_started_at>now()-interval '30 seconds' then return jsonb_build_object('status','busy');end if;
     if m.attempts>=3 then raise exception 'Retry limit exceeded' using errcode='P4290';end if;
     perform greenbel_private.chatbot_rate(p_source,p_identity);
     update public.chatbot_messages set attempts=attempts+1,processing_started_at=now() where id=m.id;
     return jsonb_build_object('status','started','messageId',m.id,'context',c.context);
   end if;
   perform greenbel_private.chatbot_rate(p_source,p_identity);
 end if;
 if c.status<>'open' or (select count(*) from public.chatbot_messages where conversation_id=p_id)>=100 then raise exception 'Start a new conversation' using errcode='P4290';end if;
 if exists(select 1 from public.chatbot_messages where conversation_id=p_id and role='user' and status='processing' and processing_started_at>now()-interval '30 seconds') then return jsonb_build_object('status','busy');end if;
 insert into public.chatbot_messages(conversation_id,request_id,role,content) values(p_id,p_request,'user',btrim(p_message)) returning * into m;
 update public.chatbot_conversations set last_activity_at=now() where id=p_id;
 return jsonb_build_object('status','started','messageId',m.id,'context',c.context);
end;$$;

create function public.chatbot_finish(p_id uuid,p_hash text,p_user uuid,p_message_id uuid,p_answer jsonb,p_context jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare m public.chatbot_messages%rowtype;existing jsonb;begin
 perform 1 from public.chatbot_conversations where id=p_id for update;
 if not greenbel_private.chatbot_owner(p_id,p_hash,p_user) then raise exception 'Conversation access denied' using errcode='42501';end if;
 select * into m from public.chatbot_messages where id=p_message_id and conversation_id=p_id and role='user' for update;
 if not found then raise exception 'Message missing' using errcode='42501';end if;
 select payload into existing from public.chatbot_messages where reply_to=m.id;if found then return existing;end if;
 if jsonb_typeof(p_answer)<>'object' or char_length(coalesce(p_answer->>'text','')) not between 1 and 5000 or octet_length(p_answer::text)>32000 then raise exception 'Invalid response' using errcode='22023';end if;
 insert into public.chatbot_messages(conversation_id,request_id,role,content,response_type,payload,reply_to,status) values(p_id,m.request_id,'assistant',p_answer->>'text',p_answer->>'type',p_answer,m.id,'completed');
 update public.chatbot_messages set status='completed' where id=m.id;
 update public.chatbot_conversations set context=p_context,last_activity_at=now() where id=p_id;
 return p_answer;
end;$$;
create function public.chatbot_history(p_id uuid,p_hash text,p_user uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ begin
 if not greenbel_private.chatbot_owner(p_id,p_hash,p_user) then raise exception 'Conversation access denied' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'requestId',request_id,'role',role,'content',content,'createdAt',created_at,'answer',payload) order by created_at,case role when 'user' then 0 else 1 end,id) from (select * from public.chatbot_messages where conversation_id=p_id order by created_at desc,id desc limit 40) m),'[]'::jsonb);
end;$$;
revoke all on function public.chatbot_begin(uuid,boolean,text,uuid,uuid,text,text,text),public.chatbot_finish(uuid,text,uuid,uuid,jsonb,jsonb),public.chatbot_history(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.chatbot_begin(uuid,boolean,text,uuid,uuid,text,text,text),public.chatbot_finish(uuid,text,uuid,uuid,jsonb,jsonb),public.chatbot_history(uuid,text,uuid) to service_role;

create function greenbel_private.chatbot_require_admin() returns uuid
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare a uuid:=auth.uid();begin
 if a is null or not exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=a and r.role='admin' and p.active) then raise exception 'Active admin required' using errcode='42501';end if;return a;end;$$;
revoke all on function greenbel_private.chatbot_require_admin() from public,anon,authenticated,service_role;
create function public.chatbot_admin_save(p_id uuid,p_expected timestamptz,p_data jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare a uuid:=greenbel_private.chatbot_require_admin();v_id uuid;begin
 if p_id is null then
 insert into public.chatbot_knowledge(question,answer,category,keywords,source_path,source_note,is_active,verified,verified_at,created_by,edited_by)
 values(p_data->>'question',p_data->>'answer',p_data->>'category',p_data->>'keywords',p_data->>'sourcePath',p_data->>'sourceNote',(p_data->>'active')::boolean,(p_data->>'verified')::boolean,case when (p_data->>'verified')::boolean then now() end,a,a) returning id into v_id;
 else
 update public.chatbot_knowledge set question=p_data->>'question',answer=p_data->>'answer',category=p_data->>'category',keywords=p_data->>'keywords',source_path=p_data->>'sourcePath',source_note=p_data->>'sourceNote',is_active=(p_data->>'active')::boolean,verified=(p_data->>'verified')::boolean,verified_at=case when (p_data->>'verified')::boolean then now() end,edited_by=a
 where id=p_id and updated_at=p_expected and deleted_at is null returning id into v_id;
 if v_id is null then raise exception 'Knowledge changed' using errcode='P4090';end if;end if;return v_id;
end;$$;
create function public.chatbot_admin_archive(p_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare a uuid:=greenbel_private.chatbot_require_admin();begin
 update public.chatbot_knowledge set is_active=false,deleted_at=now(),edited_by=a where id=p_id and deleted_at is null;return found;end;$$;
create function public.chatbot_admin_reindex(p_id uuid default null) returns integer
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare a uuid:=greenbel_private.chatbot_require_admin();n integer;begin
 update public.chatbot_knowledge set embedding=null,embedding_model=null,embedding_status='pending',embedding_error=null,edited_by=a where deleted_at is null and (p_id is null or id=p_id);
 insert into public.chatbot_embedding_jobs(knowledge_id,content_hash) select id,content_hash from public.chatbot_knowledge where deleted_at is null and (p_id is null or id=p_id)
 on conflict(knowledge_id) do update set content_hash=excluded.content_hash,status='pending',attempts=0,next_attempt_at=now(),claimed_at=null,claim_id=null,error_code=null,updated_at=now();get diagnostics n=row_count;return n;
end;$$;
create function public.chatbot_admin_metrics() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform greenbel_private.chatbot_require_admin();
 return jsonb_build_object('conversations',(select count(*) from public.chatbot_conversations),'messages',(select count(*) from public.chatbot_messages),'answered',(select count(*) from public.chatbot_messages where role='assistant' and response_type<>'unknown'),'unknown',(select count(*) from public.chatbot_messages where role='assistant' and response_type='unknown'),
 'errors',(select count(*) from public.chatbot_messages where payload->>'errorCode' is not null),'questions',coalesce((select jsonb_agg(x) from(select left(public.chatbot_normalize(content),150) question,count(*) total from public.chatbot_messages where role='user' group by 1 order by 2 desc limit 5)x),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(x) from(select i.intent,count(*) total from public.chatbot_messages m cross join lateral jsonb_array_elements_text(coalesce(m.payload->'intents','[]'::jsonb)) i(intent) where m.role='assistant' and i.intent not in ('greeting','farewell') group by 1 order by 2 desc limit 5)x),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(x) from(select p->>'name' name,count(*) total from public.chatbot_messages m cross join lateral jsonb_array_elements(coalesce(m.payload->'products','[]'::jsonb)) p where m.role='assistant' group by 1 order by 2 desc limit 5)x),'[]'::jsonb));
end;$$;
create function public.chatbot_admin_prune() returns integer
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare n integer;begin
 perform greenbel_private.chatbot_require_admin();delete from public.chatbot_conversations where id in(select id from public.chatbot_conversations where expires_at<now() order by expires_at limit 1000);get diagnostics n=row_count;
 delete from public.chatbot_rate_limits where window_start<now()-interval '2 days';return n;end;$$;
revoke all on function public.chatbot_admin_save(uuid,timestamptz,jsonb),public.chatbot_admin_archive(uuid),public.chatbot_admin_reindex(uuid),public.chatbot_admin_metrics(),public.chatbot_admin_prune() from public,anon,authenticated,service_role;
grant execute on function public.chatbot_admin_save(uuid,timestamptz,jsonb),public.chatbot_admin_archive(uuid),public.chatbot_admin_reindex(uuid),public.chatbot_admin_metrics(),public.chatbot_admin_prune() to authenticated;

create view public.chatbot_admin_knowledge with(security_invoker=true) as select * from public.chatbot_knowledge where deleted_at is null;
create view public.chatbot_admin_conversations with(security_invoker=true) as
 select c.id,coalesce(nullif(p.display_name,''),'Visitante') customer_name,c.user_id,c.status,c.created_at,c.last_activity_at,c.expires_at,
 coalesce((select left(m.content,150) from public.chatbot_messages m where m.conversation_id=c.id and m.role='user' order by m.created_at,m.id limit 1),'Conversación sin mensajes') title,
 (select count(*) from public.chatbot_messages m where m.conversation_id=c.id) message_count,
 exists(select 1 from public.chatbot_messages m where m.conversation_id=c.id and m.response_type='unknown') has_unknown
 from public.chatbot_conversations c left join public.profiles p on p.id=c.user_id;
revoke all on public.chatbot_admin_knowledge,public.chatbot_admin_conversations from public,anon,authenticated,service_role;
grant select on public.chatbot_admin_knowledge,public.chatbot_admin_conversations to service_role;

-- A controlled worker may claim/finish real embeddings. The application leaves
-- this queue untouched while no real embedding engine is configured.
create function public.chatbot_embedding_claim() returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare j public.chatbot_embedding_jobs%rowtype;c uuid:=gen_random_uuid();q text;a text;begin
 select b.* into j from public.chatbot_embedding_jobs b join public.chatbot_knowledge k on k.id=b.knowledge_id
 where k.deleted_at is null and k.verified and k.is_active and b.attempts<5 and ((b.status in('pending','error') and b.next_attempt_at<=now()) or (b.status='processing' and b.claimed_at<now()-interval '5 minutes'))
 order by b.next_attempt_at,b.knowledge_id limit 1 for update of b skip locked;
 if not found then return null;end if;
 update public.chatbot_embedding_jobs set status='processing',attempts=attempts+1,claimed_at=now(),claim_id=c,updated_at=now() where knowledge_id=j.knowledge_id;
 select question,answer into q,a from public.chatbot_knowledge where id=j.knowledge_id;
 return jsonb_build_object('id',j.knowledge_id,'claimId',c,'hash',j.content_hash,'text',q||E'\n'||a);
end;$$;
create function public.chatbot_embedding_finish(p_id uuid,p_claim uuid,p_hash text,p_vector extensions.vector(384),p_error text default null) returns boolean
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare j public.chatbot_embedding_jobs%rowtype;k public.chatbot_knowledge%rowtype;begin
 select * into k from public.chatbot_knowledge where id=p_id for update;
 select * into j from public.chatbot_embedding_jobs where knowledge_id=p_id for update;
 if not found or j.claim_id is distinct from p_claim or j.status<>'processing' or k.content_hash is distinct from p_hash or j.content_hash is distinct from p_hash then return false;end if;
 if p_vector is null then
   update public.chatbot_embedding_jobs set status='error',error_code='engine_failed',next_attempt_at=now()+interval '1 minute'*power(2,j.attempts),updated_at=now() where knowledge_id=p_id;
   update public.chatbot_knowledge set embedding=null,embedding_status='error',embedding_error='engine_failed' where id=p_id;return false;
 end if;
 if extensions.vector_dims(p_vector)<>384 or abs(extensions.vector_norm(p_vector)-1)>0.005 then raise exception 'Invalid embedding' using errcode='22023';end if;
 update public.chatbot_knowledge set embedding=p_vector,embedding_model='intfloat/multilingual-e5-small:mean:l2:384:v1',embedding_status='ready',embedding_error=null where id=p_id;
 update public.chatbot_embedding_jobs set status='completed',error_code=null,updated_at=now() where knowledge_id=p_id;return true;
end;$$;
revoke all on function public.chatbot_embedding_claim(),public.chatbot_embedding_finish(uuid,uuid,text,extensions.vector,text) from public,anon,authenticated,service_role;
grant execute on function public.chatbot_embedding_claim(),public.chatbot_embedding_finish(uuid,uuid,text,extensions.vector,text) to service_role;

-- Verified against the currently authorized Next routes and business decisions. No invented coverage, prices, stock or credit terms.
insert into public.chatbot_knowledge(question,answer,category,keywords,source_path,source_note,is_active,verified,verified_at) values
 ('¿Qué es GreenBel?','GreenBel ofrece un catálogo de equipos y productos agrícolas. Puedes explorar sus fichas, preparar tu carrito y solicitar atención del equipo de GreenBel.','greenbel','empresa quienes son nosotros productos equipos agricolas','/nosotros','Catálogo publicado y páginas actuales de GreenBel, verificados 26/10/2026.',true,true,now()),
 ('¿Cómo puedo pagar mi compra?','La solicitud de compra se coordina por WhatsApp. En el carrito puedes indicar efectivo o transferencia como preferencia. GreenBel confirmará contigo el pago y la entrega; la plataforma no procesa cobros en línea en esta etapa.','pagos','pagar pago efectivo transferencia tarjeta depositar','/carrito','Decisión vigente del usuario; WhatsAppPurchase y whatsapp-preferences.ts.',true,true,now()),
 ('¿Pueden enviar mi compra a otro departamento?','Puedes elegir retiro o envío a domicilio al preparar tu solicitud por WhatsApp. La cobertura, el costo y el plazo de entrega se coordinan con GreenBel. No tengo cobertura confirmada para una localidad específica; consulta al equipo antes de darla por disponible.','envios','enviar envio entrega mandar xela quetzaltenango departamentos domicilio transporte recoger retiro','/contacto','Preferencias actuales del carrito. No existen tarifas o cobertura comercial corroboradas.',true,true,now()),
 ('¿Cómo solicito información de financiamiento?','Prepara los productos de tu carrito e inicia sesión para solicitar información de financiamiento. En Financiamiento revisas la selección, autorizas compartir tus datos y confirmas el envío del PDF a la cooperativa. La cooperativa evalúa cada caso; la solicitud no es una aprobación de crédito.','financiamiento','credito prestamo cooperativa financiar cuotas financiamiento','/financiamiento','Modelo 031 aprobado y flujo actual de financiamiento con cuenta, consentimiento y PDF.',true,true,now()),
 ('¿Qué hago si mi producto llegó dañado o tengo un problema?','Comunícate con GreenBel desde Contacto y describe lo ocurrido. Su equipo podrá indicarte cómo revisar el caso. No tengo plazos o condiciones de devolución confirmados para prometer una reposición o reembolso. Puedes consultar también la garantía indicada en la ficha de tu producto.','posventa','danado roto problema compra garantia devolucion reembolso defectuoso','/contacto','Reglas RES/CAN vigentes: atención manual, sin prometer políticas comerciales no confirmadas.',true,true,now()),
 ('¿Cómo hablo con una persona de GreenBel?','Puedes escribir al equipo desde el formulario de Contacto o consultar allí los canales de atención publicados. El formulario de consulta no requiere iniciar sesión.','contacto','persona asesor humano telefono correo whatsapp ubicacion horario comunicar contactar','/contacto','Formulario público de contacto y configuración administrativa de canales.',true,true,now()),
 ('¿Cómo preparo una solicitud de compra?','Agrega productos al carrito e inicia sesión. Elige tu preferencia de pago y entrega, continúa por WhatsApp y adjunta el PDF que se descarga. El asesor de GreenBel confirmará la atención; abrir WhatsApp no confirma por sí solo una compra ni reserva productos.','compras','comprar carrito pdf solicitud whatsapp compra registro iniciar sesion','/carrito','Flujo autorizado actual de compra por WhatsApp, sin checkout de pagos activo.',true,true,now()),
 ('¿Dónde encuentro capacitaciones?','En Capacitaciones puedes ver los videos publicados por GreenBel sobre uso y cuidado de equipos. Abre una capacitación para consultar el video y su descripción.','capacitaciones','videos tutoriales aprender capacitacion usar equipos','/capacitaciones','Biblioteca pública y detalle de capacitaciones existentes.',true,true,now());
notify pgrst,'reload schema';

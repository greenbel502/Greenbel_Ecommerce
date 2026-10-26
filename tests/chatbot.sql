-- Integration/authorization checks, rollback only. Numeric vectors below are
-- schema fixtures, never a claim of semantic inference or model quality.
set local statement_timeout='25s';
create function pg_temp.verify(ok boolean,label text) returns void language plpgsql as $$begin if ok is not true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
do $$
declare owner_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();conv uuid:=gen_random_uuid();req uuid:=gen_random_uuid();h text:=repeat('a',64);src text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');ident text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');b jsonb;r jsonb;knowledge uuid;k public.chatbot_knowledge%rowtype;claim jsonb;vec extensions.vector;pid uuid;v_price numeric;draft_id uuid;count_before integer;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(owner_id,owner_id||'@example.invalid','{}'),(other_id,other_id||'@example.invalid','{}'),(admin_id,admin_id||'@example.invalid','{}');
 update public.user_roles set role='admin' where user_id=admin_id;
 perform pg_temp.verify(not has_function_privilege('anon','public.chatbot_begin(uuid,boolean,text,uuid,uuid,text,text,text)','execute'),'Anonymous cannot invoke private conversation command');
 perform pg_temp.verify(not has_table_privilege('authenticated','public.chatbot_messages','select') and not has_table_privilege('anon','public.chatbot_conversations','select'),'Raw histories are private');
 perform pg_temp.verify(not has_column_privilege('anon','public.chatbot_knowledge','source_note','select'),'Private source notes not exposed');
 perform pg_temp.verify(public.chatbot_normalize('FERTILIZACIÓN')='fertilizacion','Spanish accents normalized');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin perform public.chatbot_admin_metrics();raise exception 'Customer reached admin';exception when insufficient_privilege then raise notice 'PASS: Customer cannot read metrics';end;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 knowledge:=public.chatbot_admin_save(null,null,jsonb_build_object('question','QA pregunta técnica','answer','QA respuesta técnica válida para comprobar la base.','category','greenbel','keywords','comprobacion','sourcePath','/nosotros','sourceNote','Fixture técnico rollback','active',false,'verified',false));
 select * into k from public.chatbot_knowledge where id=knowledge;
 perform pg_temp.verify(k.embedding is null and k.embedding_status='pending' and exists(select 1 from public.chatbot_embedding_jobs where knowledge_id=knowledge),'New knowledge queues real processing and remains text-readable when verified');
 perform public.chatbot_admin_save(knowledge,k.updated_at,jsonb_build_object('question',k.question,'answer',k.answer,'category',k.category,'keywords',k.keywords,'sourcePath',k.source_path,'sourceNote',k.source_note,'active',true,'verified',true));
 update public.chatbot_embedding_jobs set next_attempt_at=now()-interval '1 day' where knowledge_id=knowledge;
 claim:=public.chatbot_embedding_claim();perform pg_temp.verify((claim->>'id')::uuid=knowledge,'Controlled worker claims only active verified knowledge');
 perform pg_temp.verify(not public.chatbot_embedding_finish(knowledge,(claim->>'claimId')::uuid,repeat('b',64),null),'Stale content hash cannot attach an embedding');
 vec:=('['||'1,'||array_to_string(array_fill(0,array[383]),',')||']')::extensions.vector;
 perform public.chatbot_embedding_finish(knowledge,(claim->>'claimId')::uuid,claim->>'hash',vec);
 select * into k from public.chatbot_knowledge where id=knowledge;
 perform pg_temp.verify(k.embedding_status='ready' and extensions.vector_dims(k.embedding)=384,'384-dimensional normalized vector contract accepted (synthetic fixture only)');
 perform public.chatbot_admin_save(knowledge,k.updated_at,jsonb_build_object('question',k.question,'answer',k.answer||' Cambió el contenido.','category',k.category,'keywords',k.keywords,'sourcePath',k.source_path,'sourceNote',k.source_note,'active',true,'verified',true));
 perform pg_temp.verify((select embedding is null and embedding_status='pending' from public.chatbot_knowledge where id=knowledge),'Content edit invalidates old vector automatically');
 perform pg_temp.verify((select status='pending' and attempts=0 from public.chatbot_embedding_jobs where knowledge_id=knowledge),'Changed content is requeued without manual full rebuild');
 b:=public.chatbot_begin(conv,true,h,null,req,'QA Hola',src,ident);
 perform pg_temp.verify(b->>'status'='started','Visitor can start with server-issued session proof');
 r:=public.chatbot_begin(conv,false,h,null,gen_random_uuid(),'QA concurrente',src,ident);
 perform pg_temp.verify(r->>'status'='busy','Concurrent turns are serialized');
 perform public.chatbot_finish(conv,h,null,(b->>'messageId')::uuid,jsonb_build_object('text','QA respuesta','type','knowledge','products','[]'::jsonb,'intents','["general"]'::jsonb),'{}');
 r:=public.chatbot_begin(conv,false,h,null,req,'QA Hola',src,ident);
 perform pg_temp.verify(r->>'status'='ready' and r->'answer'->>'text'='QA respuesta','Retry returns stored answer without duplicate messages');
 perform pg_temp.verify((select count(*)=2 from public.chatbot_messages where conversation_id=conv),'One user message and one assistant message per request');
 begin perform public.chatbot_history(conv,repeat('b',64),null);raise exception 'Foreign visitor read';exception when insufficient_privilege then raise notice 'PASS: Foreign visitor token denied';end;
 begin perform public.chatbot_history(conv,h,other_id);raise exception 'Account mismatch read';exception when insufficient_privilege then raise notice 'PASS: Account/session mismatch denied';end;
 perform pg_temp.verify(jsonb_array_length(public.chatbot_history(conv,h,null))=2,'Owner can read bounded history');
 begin perform public.chatbot_begin(conv,false,h,null,req,'Changed request content',src,ident);raise exception 'Nonce reused';exception when sqlstate 'P4090' then raise notice 'PASS: Reused request key with changed content rejected';end;
 conv:=gen_random_uuid();b:=public.chatbot_begin(conv,true,h,owner_id,gen_random_uuid(),'QA cuenta',src,ident);
 update public.profiles set active=false where id=owner_id;
 begin perform public.chatbot_history(conv,h,owner_id);raise exception 'Inactive history read';exception when insufficient_privilege then raise notice 'PASS: Inactive profile cannot read its private conversation';end;
 update public.profiles set active=true where id=owner_id;
 select id,effective_price into pid,v_price from public.catalog_products where sku='FUT1023';
 perform pg_temp.verify(exists(select 1 from public.chatbot_search_products('FUT1023','{}','relevance',null) where id=pid and price=v_price),'Exact SKU search uses public catalog');
 update public.products set regular_price=regular_price+1 where id=pid;
 perform pg_temp.verify((select p.price=v_price+1 from public.chatbot_search_products('FUT1023','{}','relevance',null) p where p.id=pid),'Price query reflects transaction-current catalog price');
 perform pg_temp.verify(exists(select 1 from public.chatbot_search_knowledge('envíos','envios',null)),'Text search works without any embeddings');
 perform pg_temp.verify(not exists(select 1 from public.chatbot_search_products('zzzz-no-existe-qa','{}','relevance',null)),'Unknown products are not invented');
 perform pg_temp.verify((public.chatbot_admin_metrics()->>'conversations')::integer>=2,'Metrics use actual stored conversations');
 update public.chatbot_embedding_jobs set next_attempt_at=now()-interval '1 day' where knowledge_id=knowledge;
 claim:=public.chatbot_embedding_claim();
 perform public.chatbot_embedding_finish(knowledge,(claim->>'claimId')::uuid,claim->>'hash',null);
 perform pg_temp.verify((select status='error' and next_attempt_at>now() from public.chatbot_embedding_jobs where knowledge_id=knowledge),'Embedding failure records error and schedules bounded retry');
 perform pg_temp.verify((select embedding_status='error' and embedding is null from public.chatbot_knowledge where id=knowledge),'Failed embedding never becomes ready or blocks text content');
 perform public.chatbot_admin_archive(knowledge);
 perform pg_temp.verify((select deleted_at is not null and not is_active from public.chatbot_knowledge where id=knowledge),'Knowledge removal preserves historical identifier');
end $$;
set local role anon;
do $$begin
 begin perform source_note from public.chatbot_knowledge;raise exception 'Source note visible';exception when insufficient_privilege then raise notice 'PASS: Actual anonymous private-column read denied';end;
 begin perform 1 from public.chatbot_messages;raise exception 'Messages visible';exception when insufficient_privilege then raise notice 'PASS: Actual anonymous history read denied';end;
 if not exists(select 1 from public.chatbot_search_products('FUT1023','{}','relevance',null)) then raise exception 'Public search denied';end if;raise notice 'PASS: Anonymous catalog retrieval under existing RLS';
 if not exists(select 1 from public.chatbot_search_knowledge('envios','envios',null)) then raise exception 'Public FAQ denied';end if;raise notice 'PASS: Anonymous knowledge retrieval under RLS';
end $$;
reset role;

do $$declare src text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'); ident text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'); i integer; c uuid:=gen_random_uuid(); b jsonb; begin
 for i in 1..20 loop perform greenbel_private.chatbot_rate(src,ident);end loop;
 begin perform greenbel_private.chatbot_rate(src,ident);raise exception 'Rate bypass';exception when sqlstate 'P4290' then raise notice 'PASS: Atomic per-session quota enforced';end;
 b:=public.chatbot_begin(c,true,repeat('e',64),null,gen_random_uuid(),'QA caducidad',src,encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'));
 update public.chatbot_conversations set expires_at=now()-interval '1 second' where id=c;
 begin perform public.chatbot_history(c,repeat('e',64),null);raise exception 'Expired read';exception when insufficient_privilege then raise notice 'PASS: Expired conversation inaccessible';end;
end $$;
set local role anon;
do $$begin
 if exists(select 1 from public.chatbot_knowledge where question='QA pregunta técnica') then raise exception 'Deleted knowledge leaked';end if;raise notice 'PASS: Inactive or archived knowledge excluded under anonymous RLS';
 if (select count(*) from public.chatbot_search_products('FUT1023','{}','relevance',null))<>1 then raise exception 'Exact code includes unrelated products';end if;raise notice 'PASS: Exact SKU excludes unrelated fuzzy matches';
end $$;
reset role;
set local role anon;
do $$ declare first_ids uuid[]; begin
 select array_agg(id) into first_ids from public.chatbot_search_products('','{}','relevance',null,null);
 if exists(select 1 from public.chatbot_search_products('','{}','relevance',null,first_ids) where id=any(first_ids)) then raise exception 'Repeated more options';end if;raise notice 'PASS: More options excludes previously shown catalog products';
 if not exists(select 1 from public.chatbot_search_products('Futureco','{}','relevance',null,null) where brand='Futureco') then raise exception 'Brand lookup failed';end if;raise notice 'PASS: Product search matches real brand names';
end $$;
reset role;

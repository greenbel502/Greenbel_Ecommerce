begin;
set local statement_timeout='20s';
create temporary table qa_finance_vars(id uuid,owner uuid,other uuid);
insert into qa_finance_vars values(:'qa_id',:'qa_owner',:'qa_other');
create function pg_temp.verify(ok boolean,label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end $$;
do $$
#variable_conflict use_variable
declare id uuid; owner_id uuid; other_id uuid; f public.financing_requests%rowtype; c jsonb; v jsonb; n integer; admin_id uuid;
begin
 select q.id,q.owner,q.other into id,owner_id,other_id from qa_finance_vars q;
 select * into f from public.financing_requests where financing_requests.id=id;
 if f.applicant_name not like 'QA Finance account %' or f.account_user_id<>owner_id or f.consent_version<>'finance-account-v3' then raise exception 'Own account fixture required';end if;
 -- Exercise a separate rollback-only request using this task's own issued quote.
 id:=gen_random_uuid();
 insert into public.financing_requests(id,quote_id,idempotency_key,request_fingerprint,applicant_name,email,phone,message,consent_to_share,consent_version,consent_at,account_user_id,account_authenticated_at)
 values(id,f.quote_id,gen_random_uuid(),repeat('b',64),f.applicant_name,f.email,f.phone,f.message,true,'finance-account-v3',clock_timestamp(),owner_id,clock_timestamp());
 update public.financing_requests set stage='verified' where financing_requests.id=id;
 select * into f from public.financing_requests where financing_requests.id=id;
 perform pg_temp.verify(not has_function_privilege('anon','public.financing_account_state(uuid,uuid)','execute') and not has_function_privilege('authenticated','public.financing_account_claim(uuid,uuid,uuid)','execute'),'Browser roles cannot call service account RPCs');
 perform pg_temp.verify(not has_function_privilege('service_role','public.financing_challenge_begin(uuid,text,uuid,text,text)','execute') and not has_function_privilege('service_role','public.financing_notification_claim(uuid,text,uuid)','execute'),'Legacy OTP and anonymous send RPCs retired');
 perform pg_temp.verify(not has_table_privilege('authenticated','public.financing_requests','select') and not has_table_privilege('service_role','greenbel_private.gmail_financing_notifications','select'),'Private ownership and delivery data remain restricted');
 perform pg_temp.verify(f.account_authenticated_at is not null and f.stage='verified' and f.email=(select lower(email) from auth.users where auth.users.id=owner_id),'Account binding uses authenticated email and date without OTP');
 perform pg_temp.verify(not exists(select 1 from greenbel_private.financing_email_challenges where financing_id=id),'Account requests create no OTP challenge');
 perform pg_temp.verify(not exists(select 1 from greenbel_private.gmail_financing_notifications where financing_id=id),'Preparing a request never sends to the cooperative');
 begin perform public.financing_account_state(id,other_id);raise exception 'Foreign state bypass';exception when sqlstate 'P4030' then raise notice 'PASS: Other account cannot read an owned UUID';end;
 begin perform public.financing_account_claim(id,other_id);raise exception 'Foreign send bypass';exception when sqlstate 'P4030' then raise notice 'PASS: Other account cannot send an owned UUID';end;
 begin update public.financing_requests set account_user_id=other_id where financing_requests.id=id;raise exception 'Ownership mutation';exception when raise_exception then if sqlerrm='Ownership mutation' then raise;end if;raise notice 'PASS: Ownership cannot be reassigned';end;
 begin update public.financing_requests set email='other@example.invalid' where financing_requests.id=id;raise exception 'Identity mutation';exception when raise_exception then if sqlerrm='Identity mutation' then raise;end if;raise notice 'PASS: Customer email cannot be substituted';end;
 update public.profiles set active=false where profiles.id=owner_id;
 begin perform public.financing_account_state(id,owner_id);raise exception 'Inactive read bypass';exception when sqlstate 'P4030' then raise notice 'PASS: Inactive account loses owner access';end;
 begin perform public.financing_account_claim(id,owner_id);raise exception 'Inactive send bypass';exception when sqlstate 'P4030' then raise notice 'PASS: Inactive account cannot send';end;
 update public.profiles set active=true where profiles.id=owner_id;
 c:=public.financing_account_claim(id,owner_id);perform pg_temp.verify(c->>'status'='claimed' and c->'application'->>'email'=f.email and c->'application'->>'authenticatedAt' is not null,'Explicit confirmation claims the active owner with account proof');
 v:=public.financing_account_claim(id,owner_id);perform pg_temp.verify(v->>'status'='sending','Concurrent confirmation cannot claim a second email');
 perform pg_temp.verify(not public.financing_notification_finish(id,gen_random_uuid(),'sent','qa_provider',null),'Foreign attempt cannot acknowledge delivery');
 perform public.financing_notification_finish(id,(c->>'attemptId')::uuid,'failed',null,'gmail_rejected');
 perform pg_temp.verify((select stage='verified' from public.financing_requests where financing_requests.id=id),'Gmail rejection preserves account request and PDF');
 update greenbel_private.gmail_financing_notifications set recipient_email='changed@example.invalid' where financing_id=id;
 begin perform public.financing_account_claim(id,owner_id);raise exception 'Recipient change bypass';exception when sqlstate 'P4120' then raise notice 'PASS: Changed cooperative destination requires fresh confirmation';end;
 update greenbel_private.gmail_financing_notifications set recipient_email=c->>'recipient' where financing_id=id;
 begin perform public.financing_account_claim(id,owner_id);raise exception 'Retry wait bypass';exception when sqlstate 'P4290' then raise notice 'PASS: Retry delay enforced';end;
 update greenbel_private.gmail_financing_notifications set next_retry_at=clock_timestamp()-interval '1 second' where financing_id=id;
 select user_id into admin_id from public.user_roles r join public.profiles p on p.id=r.user_id where role='admin' and active limit 1;
 c:=public.financing_account_claim(id,null,admin_id);perform pg_temp.verify(c->>'status'='claimed','Active administrator may retry only a client-confirmed failed job');
 perform public.financing_notification_finish(id,(c->>'attemptId')::uuid,'unknown',null,'delivery_unconfirmed');
 v:=public.financing_account_claim(id,owner_id);perform pg_temp.verify(v->>'status'='unknown','Ambiguous delivery cannot be sent again');
 update greenbel_private.gmail_financing_notifications set status='sending' where financing_id=id;
 perform public.financing_notification_finish(id,(c->>'attemptId')::uuid,'sent','qa_provider',null);
 perform pg_temp.verify(public.financing_notification_finish(id,(c->>'attemptId')::uuid,'sent','qa_provider',null),'Delivery acknowledgement is idempotent');
 v:=public.financing_account_claim(id,owner_id);perform pg_temp.verify(v->>'status'='sent','Sent request remains sent without another Gmail call');
 begin perform public.financing_account_claim(id,null,other_id);raise exception 'Admin bypass';exception when insufficient_privilege then raise notice 'PASS: Customer cannot impersonate an administrator';end;
 select count(*) into n from public.financing_requests where account_user_id is null and consent_version<>'finance-account-v3';
 perform pg_temp.verify(not exists(select 1 from greenbel_private.gmail_financing_notifications j join public.financing_requests h on h.id=j.financing_id where h.account_user_id is null and j.created_at>transaction_timestamp()),'No historical anonymous request was queued');
end $$;
rollback;

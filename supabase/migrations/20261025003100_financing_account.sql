-- Explicitly approved model 031, DEV: Supabase account replaces financing OTP.
-- Preserve historical records, do not enqueue or send any old request.
alter table public.financing_requests add column account_user_id uuid references public.profiles(id) on delete restrict;
alter table public.financing_requests add column account_authenticated_at timestamptz;
alter table public.financing_requests add constraint financing_account_proof_check check ((account_user_id is null)=(account_authenticated_at is null));
create index financing_account_owner_idx on public.financing_requests(account_user_id) where account_user_id is not null;

create function greenbel_private.financing_active_account(p_user_id uuid,p_email text default null) returns boolean
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_user_id and p.active and u.deleted_at is null and (u.banned_until is null or u.banned_until<clock_timestamp()) and u.email is not null and u.email_confirmed_at is not null and (p_email is null or lower(u.email)=p_email));
$$;
create function greenbel_private.financing_owner_access(p_id uuid,p_user_id uuid) returns boolean
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.financing_requests f where f.id=p_id and f.account_user_id=p_user_id and f.consent_version='finance-account-v3' and greenbel_private.financing_active_account(p_user_id,f.email));
$$;
create or replace function greenbel_private.guard_financing_draft() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Financing history cannot be deleted'; end if;
 if not exists(select 1 from public.quotes where id=new.quote_id and stage='issued') then raise exception 'Issued private PDF required'; end if;
 if tg_op='INSERT' then
  if new.stage<>'draft' then raise exception 'Draft required'; end if;
  if new.consent_version='finance-account-v3' and (new.account_user_id is null or not greenbel_private.financing_active_account(new.account_user_id,new.email)) then raise exception 'Active account required' using errcode='P4030'; end if;
  if new.account_user_id is not null and new.consent_version<>'finance-account-v3' then raise exception 'Account consent required'; end if;
 else
  if (to_jsonb(new)-'updated_at'-'stage') is distinct from (to_jsonb(old)-'updated_at'-'stage') then raise exception 'Financing identity and consent are immutable'; end if;
  if new.stage is distinct from old.stage then
   if new.stage='verified' and old.stage='draft' and new.consent_version='finance-account-v3' and new.account_authenticated_at is not null and greenbel_private.financing_active_account(new.account_user_id,new.email) then return new; end if;
   if new.stage='sent' and old.stage='verified' and exists(select 1 from greenbel_private.gmail_financing_notifications where financing_id=new.id and status='sent') then return new; end if;
   raise exception 'Invalid financing transition';
  end if;
 end if;
 return new;
end $$;
create function public.financing_account_create(p_user_id uuid,p_idempotency_key uuid,p_request_fingerprint text,p_quote_id uuid,p_token_sha256 text,p_applicant_name text,p_phone text,p_message text)
returns table(financing_id uuid,repeated boolean)
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare existing public.financing_requests%rowtype; account_email text; grant_id uuid;
begin
 if not greenbel_private.financing_active_account(p_user_id) then raise exception 'Active account required' using errcode='P4030'; end if;
 select lower(email) into account_email from auth.users where id=p_user_id;
 perform pg_advisory_xact_lock(hashtextextended('finance:'||p_idempotency_key::text,0));
 select * into existing from public.financing_requests where idempotency_key=p_idempotency_key for update;
 if found then
  if existing.account_user_id is distinct from p_user_id or existing.email<>account_email or existing.request_fingerprint is distinct from p_request_fingerprint or existing.quote_id is distinct from p_quote_id or existing.consent_version<>'finance-account-v3' then raise exception 'Idempotency conflict' using errcode='P4090'; end if;
  if not exists(select 1 from public.guest_access_grants where quote_id=p_quote_id and token_sha256=p_token_sha256 and revoked_at is null and expires_at>clock_timestamp()) then raise exception 'Quote access invalid' using errcode='P4030'; end if;
  financing_id:=existing.id;repeated:=true;return next;return;
 end if;
 update public.guest_access_grants set use_count=use_count+1,last_used_at=clock_timestamp() where quote_id=p_quote_id and token_sha256=p_token_sha256 and financing_request_id is null and revoked_at is null and expires_at>clock_timestamp() and use_count<max_uses returning id into grant_id;
 if grant_id is null then raise exception 'Quote access invalid' using errcode='P4030'; end if;
 insert into public.financing_requests(quote_id,idempotency_key,request_fingerprint,applicant_name,email,phone,message,consent_to_share,consent_version,consent_at,account_user_id,account_authenticated_at)
 values(p_quote_id,p_idempotency_key,p_request_fingerprint,p_applicant_name,account_email,p_phone,p_message,true,'finance-account-v3',clock_timestamp(),p_user_id,clock_timestamp()) returning id into financing_id;
 update public.financing_requests set stage='verified' where id=financing_id;
 repeated:=false;return next;
end $$;
create function public.financing_account_state(p_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare f public.financing_requests%rowtype; j greenbel_private.gmail_financing_notifications%rowtype; q public.quotes%rowtype; lines jsonb;
begin
 if not greenbel_private.financing_owner_access(p_id,p_user_id) then raise exception 'Owner account required' using errcode='P4030'; end if;
 select * into f from public.financing_requests where id=p_id;
 select * into j from greenbel_private.gmail_financing_notifications where financing_id=p_id;
 select * into q from public.quotes where id=f.quote_id;
 select jsonb_agg(jsonb_build_object('name',name_snapshot,'quantity',quantity,'unitPrice',final_unit_price,'total',line_total) order by line_no) into lines from public.quote_items where quote_id=f.quote_id;
 return jsonb_build_object('stage',f.stage,'email',f.email,'name',f.applicant_name,'phone',f.phone,'message',f.message,'delivery',j.status,'retryAt',j.next_retry_at,'reference',q.reference,'lines',lines,'authenticatedAt',f.account_authenticated_at);
end $$;
create function public.financing_account_claim(p_id uuid,p_user_id uuid,p_actor_id uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare f public.financing_requests%rowtype; j greenbel_private.gmail_financing_notifications%rowtype; recipient text; items jsonb; attempt uuid:=gen_random_uuid(); v_authenticated timestamptz; ref text;
begin
 if p_actor_id is not null then
  if not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id where p.id=p_actor_id and p.active and r.role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 elsif not greenbel_private.financing_owner_access(p_id,p_user_id) then raise exception 'Invalid access' using errcode='P4030'; end if;
 select * into f from public.financing_requests where id=p_id for update;
 select * into j from greenbel_private.gmail_financing_notifications where financing_id=p_id for update;
 if j.status='sent' then return jsonb_build_object('status','sent'); end if;
 if j.status='sending' and j.last_attempt_at<clock_timestamp()-interval '2 minutes' then
  update greenbel_private.gmail_financing_notifications set status='unknown',last_error_code='delivery_unconfirmed' where financing_id=p_id;
  return jsonb_build_object('status','unknown');
 end if;
 if j.status in('sending','unknown') then return jsonb_build_object('status',j.status); end if;
 if f.stage<>'verified' or not f.consent_to_share or f.consent_version<>'finance-account-v3' then raise exception 'Verification and consent required' using errcode='P4090'; end if;
 if not greenbel_private.financing_active_account(f.account_user_id,f.email) then raise exception 'Active owner account required' using errcode='P4030'; end if;
 v_authenticated:=f.account_authenticated_at;
 if v_authenticated is null then raise exception 'Authenticated account required' using errcode='P4090'; end if;
 select reference into ref from public.quotes where id=f.quote_id and stage='issued' and pdf_storage_bucket='quote-pdfs' and pdf_sha256 is not null and pdf_bytes>0;
 if ref is null then raise exception 'Private PDF required' using errcode='P4090'; end if;
 select payload->'entries' into items from public.site_content where key='contact' and publication_status='draft';
 select lower(e->>'value') into recipient from jsonb_array_elements(coalesce(items,'[]'::jsonb)) e where e->>'company'='cooperative' and e->>'kind'='email' and e->>'primary'='true';
 if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Recipient unavailable' using errcode='P5030'; end if;
 if j.recipient_email is not null and j.recipient_email<>recipient then raise exception 'Recipient changed; renew confirmation' using errcode='P4120'; end if;
 if not exists(select 1 from greenbel_private.gmail_connection where id and status='connected') then raise exception 'Mail unavailable' using errcode='P5030'; end if;
 -- Administrative retries can only retry a prior explicitly confirmed request.
 if p_actor_id is not null and j.status is distinct from 'failed' then return null; end if;
 if j.attempts>=5 or j.next_retry_at>clock_timestamp() then raise exception 'Retry later' using errcode='P4290'; end if;
 insert into greenbel_private.gmail_financing_notifications(financing_id,recipient_email,status,attempts,attempt_id,last_attempt_at) values(p_id,recipient,'sending',1,attempt,clock_timestamp())
 on conflict(financing_id) do update set status='sending',attempts=greenbel_private.gmail_financing_notifications.attempts+1,attempt_id=excluded.attempt_id,last_attempt_at=excluded.last_attempt_at,last_error_code=null,next_retry_at=null;
 return jsonb_build_object('status','claimed','attemptId',attempt,'recipient',recipient,'quoteId',f.quote_id,'application',jsonb_build_object('id',f.id,'applicantName',f.applicant_name,'email',f.email,'phone',f.phone,'message',f.message,'quoteReference',ref,'createdAt',f.created_at,'authenticatedAt',v_authenticated));
end $$;

revoke all on function greenbel_private.financing_active_account(uuid,text),greenbel_private.financing_owner_access(uuid,uuid) from public,anon,authenticated,service_role;
-- Retire old anonymous/token/OTP entry points. Definitions remain solely as historical implementation.
revoke execute on function public.create_financing_draft(uuid,text,uuid,text,text,text,text,text,text),public.financing_access_create(uuid,text),public.financing_workflow_state(uuid,text),public.financing_challenge_begin(uuid,text,uuid,text,text),public.financing_challenge_verify(uuid,text,uuid,text),public.financing_notification_claim(uuid,text,uuid) from public,anon,authenticated,service_role;
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('financing_account_create','financing_account_state','financing_account_claim') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

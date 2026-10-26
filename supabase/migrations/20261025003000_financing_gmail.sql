-- Model 030 explicitly approved for DEV: consent -> OTP -> explicit send, never historical dispatch.
create table greenbel_private.financing_email_challenges (
 id uuid primary key, financing_id uuid not null references public.financing_requests(id) on delete restrict,
 email text not null, code_hmac text not null check(code_hmac ~ '^[a-f0-9]{64}$'),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 failed_attempts integer not null default 0 check(failed_attempts between 0 and 5),
 verified_at timestamptz, revoked_at timestamptz,
 check(expires_at > created_at)
);
create index financing_challenges_request_idx on greenbel_private.financing_email_challenges(financing_id,created_at desc);
create index financing_challenges_email_idx on greenbel_private.financing_email_challenges(email,created_at desc);
create index financing_challenges_source_idx on greenbel_private.financing_email_challenges(source_hash,created_at desc);
create table greenbel_private.gmail_financing_notifications (
 financing_id uuid primary key references public.financing_requests(id) on delete restrict,
 recipient_email text not null check(recipient_email !~ '[[:space:][:cntrl:]]' and char_length(recipient_email) between 3 and 254),
 status text not null default 'pending' check(status in('pending','sending','sent','failed','unknown')),
 attempts integer not null default 0 check(attempts between 0 and 5), attempt_id uuid,
 last_attempt_at timestamptz, next_retry_at timestamptz, sent_at timestamptz,
 provider_message_id text check(char_length(provider_message_id) between 1 and 200),
 last_error_code text check(last_error_code ~ '^[a-z_]{1,64}$'),
 created_at timestamptz not null default clock_timestamp()
);
alter table greenbel_private.financing_email_challenges enable row level security;
alter table greenbel_private.gmail_financing_notifications enable row level security;
revoke all on greenbel_private.financing_email_challenges,greenbel_private.gmail_financing_notifications from public,anon,authenticated,service_role;
alter table public.financing_requests drop constraint financing_requests_draft_only_check;
alter table public.financing_requests add constraint financing_requests_stage_check check(stage in('draft','verified','sent'));

create or replace function greenbel_private.guard_financing_draft() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Financing history cannot be deleted'; end if;
 if not exists(select 1 from public.quotes where id=new.quote_id and stage='issued') then raise exception 'Issued private PDF required'; end if;
 if tg_op='INSERT' and new.stage<>'draft' then raise exception 'Draft required'; end if;
 if tg_op='UPDATE' then
  if (to_jsonb(new)-'updated_at'-'stage') is distinct from (to_jsonb(old)-'updated_at'-'stage') then raise exception 'Financing data is immutable; renew consent in a new request'; end if;
  if new.stage is distinct from old.stage then
   if new.stage='verified' and old.stage='draft' and exists(select 1 from greenbel_private.financing_email_challenges where financing_id=new.id and email=new.email and verified_at is not null and revoked_at is null) then return new; end if;
   if new.stage='sent' and old.stage='verified' and exists(select 1 from greenbel_private.gmail_financing_notifications where financing_id=new.id and status='sent') then return new; end if;
   raise exception 'Invalid financing transition';
  end if;
 end if;
 return new;
end $$;

create function greenbel_private.financing_access(p_id uuid,p_hash text) returns boolean
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select p_hash ~ '^[a-f0-9]{64}$' and exists(select 1 from public.guest_access_grants where financing_request_id=p_id and token_sha256=p_hash and revoked_at is null and expires_at>clock_timestamp() and use_count<max_uses);
$$;
create function public.financing_access_create(p_id uuid,p_hash text) returns boolean
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or not exists(select 1 from public.financing_requests where id=p_id and consent_version='finance-share-v2') then return false; end if;
 insert into public.guest_access_grants(financing_request_id,token_sha256,expires_at,max_uses) values(p_id,p_hash,clock_timestamp()+interval '24 hours',100) on conflict(token_sha256) do nothing;
 return greenbel_private.financing_access(p_id,p_hash);
end $$;
create function public.financing_workflow_state(p_id uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare f public.financing_requests%rowtype; c greenbel_private.financing_email_challenges%rowtype; j greenbel_private.gmail_financing_notifications%rowtype;
begin
 if not greenbel_private.financing_access(p_id,p_hash) then raise exception 'Invalid access' using errcode='P4030'; end if;
 select * into f from public.financing_requests where id=p_id;
 select * into c from greenbel_private.financing_email_challenges where financing_id=p_id order by created_at desc limit 1;
 select * into j from greenbel_private.gmail_financing_notifications where financing_id=p_id;
 return jsonb_build_object('stage',f.stage,'email',f.email,'challengeId',c.id,'expiresAt',c.expires_at,'resendAt',c.created_at+interval '60 seconds','attemptsLeft',5-coalesce(c.failed_attempts,0),'delivery',j.status,'retryAt',j.next_retry_at);
end $$;
create function public.financing_challenge_begin(p_id uuid,p_hash text,p_challenge_id uuid,p_code_hmac text,p_source_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare f public.financing_requests%rowtype; t timestamptz:=clock_timestamp(); last_at timestamptz;
begin
 if not greenbel_private.financing_access(p_id,p_hash) then raise exception 'Invalid access' using errcode='P4030'; end if;
 -- Global lock serializes the two durable quotas as well as concurrent resends.
 perform pg_advisory_xact_lock(hashtextextended('greenbel-financing-otp-quota',0));
 select * into f from public.financing_requests where id=p_id for update;
 if f.stage<>'draft' or not f.consent_to_share or f.consent_version<>'finance-share-v2' then raise exception 'Fresh consent required' using errcode='P4090'; end if;
 if not exists(select 1 from greenbel_private.gmail_connection where id and status='connected') then raise exception 'Mail unavailable' using errcode='P5030'; end if;
 select max(created_at) into last_at from greenbel_private.financing_email_challenges where financing_id=p_id;
 if last_at>t-interval '60 seconds' or (select count(*) from greenbel_private.financing_email_challenges where email=f.email and created_at>t-interval '1 hour')>=5 or (select count(*) from greenbel_private.financing_email_challenges where source_hash=p_source_hash and created_at>t-interval '1 hour')>=20 then raise exception 'Verification quota' using errcode='P4290'; end if;
 update greenbel_private.financing_email_challenges set revoked_at=t where financing_id=p_id and revoked_at is null;
 insert into greenbel_private.financing_email_challenges(id,financing_id,email,code_hmac,source_hash,created_at,expires_at) values(p_challenge_id,p_id,f.email,p_code_hmac,p_source_hash,t,t+interval '10 minutes');
 return jsonb_build_object('email',f.email,'createdAt',t,'expiresAt',t+interval '10 minutes');
end $$;
create function public.financing_challenge_verify(p_id uuid,p_hash text,p_challenge_id uuid,p_code_hmac text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare c greenbel_private.financing_email_challenges%rowtype; f public.financing_requests%rowtype; t timestamptz:=clock_timestamp();
begin
 if not greenbel_private.financing_access(p_id,p_hash) then raise exception 'Invalid access' using errcode='P4030'; end if;
 select * into f from public.financing_requests where id=p_id for update;
 select * into c from greenbel_private.financing_email_challenges where id=p_challenge_id and financing_id=p_id for update;
 if not found or c.revoked_at is not null or c.email<>f.email or c.expires_at<=t or c.failed_attempts>=5 then return jsonb_build_object('verified',false,'reason','expired'); end if;
 if c.verified_at is not null then return jsonb_build_object('verified',f.stage in('verified','sent')); end if;
 if p_code_hmac is null or c.code_hmac<>p_code_hmac then
  update greenbel_private.financing_email_challenges set failed_attempts=failed_attempts+1 where id=c.id;
  return jsonb_build_object('verified',false,'reason','incorrect','attemptsLeft',4-c.failed_attempts);
 end if;
 update greenbel_private.financing_email_challenges set verified_at=t where id=c.id;
 update public.financing_requests set stage='verified' where id=p_id;
 return jsonb_build_object('verified',true);
end $$;

create function public.financing_notification_claim(p_id uuid,p_hash text,p_actor_id uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare f public.financing_requests%rowtype; j greenbel_private.gmail_financing_notifications%rowtype; recipient text; items jsonb; attempt uuid:=gen_random_uuid(); v_verified timestamptz; ref text;
begin
 if p_actor_id is not null then
  if not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id where p.id=p_actor_id and p.active and r.role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 elsif not greenbel_private.financing_access(p_id,p_hash) then raise exception 'Invalid access' using errcode='P4030'; end if;
 select * into f from public.financing_requests where id=p_id for update;
 select * into j from greenbel_private.gmail_financing_notifications where financing_id=p_id for update;
 if j.status='sent' then return jsonb_build_object('status','sent'); end if;
 if j.status='sending' and j.last_attempt_at<clock_timestamp()-interval '2 minutes' then
  update greenbel_private.gmail_financing_notifications set status='unknown',last_error_code='delivery_unconfirmed' where financing_id=p_id;
  return jsonb_build_object('status','unknown');
 end if;
 if j.status in('sending','unknown') then return jsonb_build_object('status',j.status); end if;
 if f.stage<>'verified' or not f.consent_to_share or f.consent_version<>'finance-share-v2' then raise exception 'Verification and consent required' using errcode='P4090'; end if;
 select max(verified_at) into v_verified from greenbel_private.financing_email_challenges where financing_id=p_id and email=f.email and verified_at is not null and revoked_at is null;
 if v_verified is null then raise exception 'Verification required' using errcode='P4090'; end if;
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
 return jsonb_build_object('status','claimed','attemptId',attempt,'recipient',recipient,'quoteId',f.quote_id,'application',jsonb_build_object('id',f.id,'applicantName',f.applicant_name,'email',f.email,'phone',f.phone,'message',f.message,'quoteReference',ref,'createdAt',f.created_at,'verifiedAt',v_verified));
end $$;
create function public.financing_notification_finish(p_id uuid,p_attempt_id uuid,p_status text,p_message_id text,p_error_code text) returns boolean
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare j greenbel_private.gmail_financing_notifications%rowtype;
begin
 perform 1 from public.financing_requests where id=p_id for update;
 select * into j from greenbel_private.gmail_financing_notifications where financing_id=p_id for update;
 if not found or j.attempt_id<>p_attempt_id then return false; end if;
 if j.status='sent' then return p_status='sent' and j.provider_message_id=p_message_id; end if;
 if j.status<>'sending' or p_status not in('sent','failed','unknown') or (p_status='sent' and p_message_id is null) then return false; end if;
 update greenbel_private.gmail_financing_notifications set status=p_status,provider_message_id=p_message_id,last_error_code=p_error_code,sent_at=case when p_status='sent' then clock_timestamp() end,next_retry_at=case when p_status='failed' then clock_timestamp()+interval '60 seconds' end where financing_id=p_id;
 if p_status='sent' then update public.financing_requests set stage='sent' where id=p_id; end if;
 return true;
end $$;
create function public.financing_notification_status(p_ids uuid[]) returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',financing_id,'status',status,'attempts',attempts,'retryAt',next_retry_at,'recipient',recipient_email)), '[]'::jsonb) from greenbel_private.gmail_financing_notifications where financing_id=any(p_ids);
$$;
-- Private schema and all RPCs inaccessible to browser roles. Only backend service calls.
revoke all on function greenbel_private.financing_access(uuid,text) from public,anon,authenticated,service_role;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('financing_access_create','financing_workflow_state','financing_challenge_begin','financing_challenge_verify','financing_notification_claim','financing_notification_finish','financing_notification_status') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

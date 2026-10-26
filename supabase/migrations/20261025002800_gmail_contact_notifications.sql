-- Approved model 028, DEV only: Gmail connection and one delivery record per NEW contact.
-- No historical messages are queued. No credentials are exposed through browser roles.
do $$ begin
  if to_regclass('public.contact_messages') is null
     or to_regclass('greenbel_private.gmail_connection') is not null then
    raise exception 'Gmail migration precondition failed';
  end if;
end $$;

create table greenbel_private.gmail_connection (
  id boolean primary key default true check (id),
  refresh_token_ciphertext text not null check (char_length(refresh_token_ciphertext) between 40 and 18000 and refresh_token_ciphertext like 'v1.%'),
  sender_email text not null check (char_length(sender_email) between 3 and 254 and sender_email !~ '[[:cntrl:][:space:]]'),
  client_fingerprint text not null check (client_fingerprint ~ '^[a-f0-9]{64}$'),
  scopes text[] not null check (scopes = array['https://www.googleapis.com/auth/gmail.send']::text[]),
  revision uuid not null default gen_random_uuid(),
  connected_at timestamptz not null default now(),
  connected_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'connected' check (status in ('connected','reconnect_required')),
  last_error_code text check (last_error_code ~ '^[a-z_]{1,64}$')
);
create table greenbel_private.gmail_contact_notifications (
  contact_id uuid primary key references public.contact_messages(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','unknown')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  attempt_id uuid,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  sent_at timestamptz,
  provider_message_id text check (char_length(provider_message_id) between 1 and 200),
  last_error_code text check (last_error_code ~ '^[a-z_]{1,64}$'),
  created_at timestamptz not null default now()
);
alter table greenbel_private.gmail_connection enable row level security;
alter table greenbel_private.gmail_contact_notifications enable row level security;
revoke all on table greenbel_private.gmail_connection, greenbel_private.gmail_contact_notifications
  from public, anon, authenticated, service_role;

alter table public.contact_messages drop constraint contact_messages_email_pause_check;
alter table public.contact_messages add constraint contact_messages_notification_status_check
  check (notification_status in ('not_sent','pending','sending','sent','failed','unknown'));

create function public.gmail_connection_read() returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp as $$
  select to_jsonb(c) - 'id' from greenbel_private.gmail_connection c where id;
$$;

create function public.gmail_connection_save(
  p_refresh_token_ciphertext text, p_sender_email text, p_client_fingerprint text,
  p_actor_id uuid, p_expected_revision uuid
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare current_revision uuid; new_revision uuid := gen_random_uuid();
begin
  perform 1 from public.profiles where id=p_actor_id and active for share;
  if not found then raise exception 'Active admin required' using errcode='42501'; end if;
  perform 1 from public.user_roles where user_id=p_actor_id and role='admin' for share;
  if not found then raise exception 'Active admin required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('greenbel-gmail-connection',0));
  select revision into current_revision from greenbel_private.gmail_connection where id for update;
  if current_revision is distinct from p_expected_revision then
    raise exception 'Connection changed' using errcode='PT409';
  end if;
  insert into greenbel_private.gmail_connection
    (refresh_token_ciphertext,sender_email,client_fingerprint,scopes,revision,connected_by)
  values (p_refresh_token_ciphertext,p_sender_email,p_client_fingerprint,
    array['https://www.googleapis.com/auth/gmail.send'],new_revision,p_actor_id)
  on conflict(id) do update set refresh_token_ciphertext=excluded.refresh_token_ciphertext,
    sender_email=excluded.sender_email,client_fingerprint=excluded.client_fingerprint,
    scopes=excluded.scopes,revision=excluded.revision,connected_by=excluded.connected_by,
    connected_at=now(),status='connected',last_error_code=null;
  return new_revision;
end $$;

create function public.gmail_connection_require_reconnect(p_revision uuid,p_error_code text) returns void
language sql security definer set search_path = pg_catalog, pg_temp as $$
  update greenbel_private.gmail_connection set status='reconnect_required',last_error_code=p_error_code
    where id and revision=p_revision;
$$;

create function greenbel_private.gmail_queue_new_contact() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if exists(select 1 from greenbel_private.gmail_connection where id and status='connected') then
    insert into greenbel_private.gmail_contact_notifications(contact_id) values(new.id);
    update public.contact_messages set notification_status='pending' where id=new.id;
  end if;
  return new;
end $$;
revoke all on function greenbel_private.gmail_queue_new_contact() from public,anon,authenticated,service_role;
create trigger contact_gmail_queue_after_insert after insert on public.contact_messages
  for each row execute function greenbel_private.gmail_queue_new_contact();

create function public.gmail_notification_claim(p_contact_id uuid,p_retry boolean default false) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare job greenbel_private.gmail_contact_notifications%rowtype; claim uuid := gen_random_uuid(); contact jsonb;
begin
  select * into job from greenbel_private.gmail_contact_notifications where contact_id=p_contact_id for update;
  if not found or job.attempts>=5 then return null; end if;
  if not ((job.status='pending' and not p_retry) or
    (job.status='failed' and p_retry and coalesce(job.next_retry_at,now())<=now())) then return null; end if;
  if not exists(select 1 from greenbel_private.gmail_connection where id and status='connected') then return null; end if;
  update greenbel_private.gmail_contact_notifications set status='sending',attempts=attempts+1,
    attempt_id=claim,last_attempt_at=now(),next_retry_at=null,last_error_code=null
    where contact_id=p_contact_id;
  update public.contact_messages set notification_status='sending' where id=p_contact_id;
  select jsonb_build_object('id',id,'name',name,'email',email,'phone',phone,
    'inquiry_type',inquiry_type,'product',product,'message',message,'created_at',created_at)
    into contact from public.contact_messages where id=p_contact_id;
  return jsonb_build_object('attempt_id',claim,'contact',contact);
end $$;

create function public.gmail_notification_finish(
  p_contact_id uuid,p_attempt_id uuid,p_status text,p_message_id text default null,p_error_code text default null
) returns boolean
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare job greenbel_private.gmail_contact_notifications%rowtype;
begin
  if p_status not in ('sent','failed','unknown') or
    (p_status='sent' and coalesce(p_message_id,'') !~ '^[A-Za-z0-9_-]{1,200}$') or
    (p_status<>'sent' and coalesce(p_error_code,'') !~ '^[a-z_]{1,64}$') then
    raise exception 'Invalid notification outcome' using errcode='22023';
  end if;
  select * into job from greenbel_private.gmail_contact_notifications where contact_id=p_contact_id for update;
  if not found or job.attempt_id is distinct from p_attempt_id then return false; end if;
  if job.status=p_status then return p_status<>'sent' or job.provider_message_id=p_message_id; end if;
  if job.status<>'sending' then return false; end if;
  update greenbel_private.gmail_contact_notifications set status=p_status,
    provider_message_id=case when p_status='sent' then p_message_id end,
    sent_at=case when p_status='sent' then now() end,
    last_error_code=case when p_status<>'sent' then p_error_code end,
    next_retry_at=case when p_status='failed' then now()+make_interval(secs=>least(3600,60*power(2,attempts-1)::integer)) end
    where contact_id=p_contact_id;
  update public.contact_messages set notification_status=p_status where id=p_contact_id;
  return true;
end $$;

create function public.gmail_notification_status(p_contact_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if coalesce(array_length(p_contact_ids,1),0)>100 then raise exception 'Too many contacts' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(to_jsonb(n)-'attempt_id')
    from greenbel_private.gmail_contact_notifications n where contact_id=any(p_contact_ids)),'[]'::jsonb);
end $$;

revoke all on function public.gmail_connection_read(),
  public.gmail_connection_save(text,text,text,uuid,uuid),
  public.gmail_connection_require_reconnect(uuid,text),public.gmail_notification_claim(uuid,boolean),
  public.gmail_notification_finish(uuid,uuid,text,text,text),public.gmail_notification_status(uuid[])
  from public,anon,authenticated,service_role;
grant execute on function public.gmail_connection_read(),
  public.gmail_connection_save(text,text,text,uuid,uuid),
  public.gmail_connection_require_reconnect(uuid,text),public.gmail_notification_claim(uuid,boolean),
  public.gmail_notification_finish(uuid,uuid,text,text,text),public.gmail_notification_status(uuid[])
  to service_role;

comment on table greenbel_private.gmail_connection is 'Server-only encrypted Gmail send authorization. No browser role grants.';
comment on table greenbel_private.gmail_contact_notifications is 'Unique delivery per new contact; no automatic retry of sent/sending/unknown outcomes.';
comment on column public.contact_messages.notification_status is 'not_sent historical/unconnected; new Gmail delivery states mirrored from private queue.';
notify pgrst, 'reload schema';

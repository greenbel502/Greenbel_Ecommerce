-- Same approved Gmail model: recover an unattempted pending notification explicitly,
-- and retain NEW contacts during a known authorization outage. No historical backfill.
create or replace function greenbel_private.gmail_queue_new_contact() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if exists(select 1 from greenbel_private.gmail_connection where id) then
    insert into greenbel_private.gmail_contact_notifications(contact_id) values(new.id);
    update public.contact_messages set notification_status='pending' where id=new.id;
  end if;
  return new;
end $$;

create or replace function public.gmail_notification_claim(p_contact_id uuid,p_retry boolean default false) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare job greenbel_private.gmail_contact_notifications%rowtype; claim uuid := gen_random_uuid(); contact jsonb;
begin
  select * into job from greenbel_private.gmail_contact_notifications where contact_id=p_contact_id for update;
  if not found or job.attempts>=5 then return null; end if;
  if not (job.status='pending' or
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
-- CREATE OR REPLACE preserves the service-only function grants from 028.
notify pgrst, 'reload schema';

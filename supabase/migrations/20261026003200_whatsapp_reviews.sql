-- Model 032 explicitly approved 26/10/2026, DEV only.
-- A WhatsApp selection is not evidence of a sent message, sale, payment or delivery.
-- Existing product-review eligibility and business records remain unchanged.

create table public.whatsapp_review_invitations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  reference text not null check (reference ~ '^GB-[A-F0-9]{8}$'),
  created_at timestamptz not null default now(),
  unique (customer_id, reference)
);
create index whatsapp_review_invitations_customer_created_idx on public.whatsapp_review_invitations(customer_id, created_at desc);

create table public.whatsapp_reviews (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique references public.whatsapp_review_invitations(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(btrim(comment)) between 1 and 3000),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','visible','hidden')),
  moderation_reason text,
  moderated_by uuid references public.profiles(id) on delete restrict,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_reviews_moderation_check check (
    (moderation_status='pending' and moderation_reason is null and moderated_by is null and moderated_at is null)
    or (moderation_status='visible' and moderation_reason is null and moderated_by is not null and moderated_at is not null)
    or (moderation_status='hidden' and moderation_reason in ('spam','personal_data','offensive_content') and moderated_by is not null and moderated_at is not null)
  )
);
create index whatsapp_reviews_status_created_idx on public.whatsapp_reviews(moderation_status, created_at desc);

alter table public.whatsapp_review_invitations enable row level security;
alter table public.whatsapp_reviews enable row level security;
-- Commands are the only write path; public reads use a deliberately minimal projection.
revoke all on public.whatsapp_review_invitations,public.whatsapp_reviews from public,anon,authenticated,service_role;
grant select on public.whatsapp_review_invitations,public.whatsapp_reviews to service_role;

create function greenbel_private.review_active_customer(p_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select exists(select 1 from public.profiles p where p.id=p_id and p.active)
    and not exists(select 1 from public.user_roles r where r.user_id=p_id and r.role='operator');
$$;
revoke all on function greenbel_private.review_active_customer(uuid) from public,anon,authenticated,service_role;

create function public.issue_whatsapp_review_invitation(p_customer_id uuid,p_reference text) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_id uuid;
begin
  perform 1 from public.profiles where id=p_customer_id for update;
  if not greenbel_private.review_active_customer(p_customer_id) then raise exception 'Active customer required' using errcode='42501'; end if;
  if p_reference is null or p_reference !~ '^GB-[A-F0-9]{8}$' then raise exception 'Invalid selection reference' using errcode='22023'; end if;
  select id into v_id from public.whatsapp_review_invitations where customer_id=p_customer_id and reference=p_reference;
  if found then return v_id; end if;
  if (select count(*) from public.whatsapp_review_invitations where customer_id=p_customer_id and created_at>now()-interval '1 hour')>=30 then raise exception 'Invitation rate exceeded' using errcode='P4290'; end if;
  insert into public.whatsapp_review_invitations(customer_id,reference) values(p_customer_id,p_reference) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.issue_whatsapp_review_invitation(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.issue_whatsapp_review_invitation(uuid,text) to service_role;

create function public.submit_whatsapp_review(p_invitation_id uuid,p_rating integer,p_comment text) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_user uuid:=auth.uid(); v_inv public.whatsapp_review_invitations%rowtype; v_review public.whatsapp_reviews%rowtype; v_comment text:=btrim(p_comment); v_id uuid;
begin
  perform 1 from public.profiles where id=v_user for update;
  if v_user is null or not greenbel_private.review_active_customer(v_user) then raise exception 'Active customer required' using errcode='42501'; end if;
  select * into v_inv from public.whatsapp_review_invitations where id=p_invitation_id and customer_id=v_user for update;
  if not found then raise exception 'Own invitation required' using errcode='42501'; end if;
  if p_rating is null or p_rating not between 1 and 5 or v_comment is null or char_length(v_comment) not between 1 and 3000
     or v_comment ~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]' then raise exception 'Invalid review' using errcode='22023'; end if;
  select * into v_review from public.whatsapp_reviews where invitation_id=p_invitation_id;
  if found then
    if v_review.rating=p_rating and v_review.comment=v_comment then return v_review.id; end if;
    raise exception 'Invitation already reviewed' using errcode='P4090';
  end if;
  if (select count(*) from public.whatsapp_reviews r join public.whatsapp_review_invitations i on i.id=r.invitation_id where i.customer_id=v_user and r.created_at>now()-interval '1 hour')>=5 then raise exception 'Review rate exceeded' using errcode='P4290'; end if;
  insert into public.whatsapp_reviews(invitation_id,rating,comment) values(p_invitation_id,p_rating,v_comment) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.submit_whatsapp_review(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_whatsapp_review(uuid,integer,text) to authenticated;

create function public.moderate_whatsapp_review(p_review_id uuid,p_expected_status text,p_decision text,p_reason text) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_review public.whatsapp_reviews%rowtype;
begin
  if v_actor is null or not exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=v_actor and r.role='admin' and p.active) then raise exception 'Active admin required' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('visible','hidden') or
     (p_decision='visible' and p_reason is not null) or
     (p_decision='hidden' and (p_reason is null or p_reason not in ('spam','personal_data','offensive_content'))) then raise exception 'Invalid moderation' using errcode='22023'; end if;
  select * into v_review from public.whatsapp_reviews where id=p_review_id for update;
  if not found or v_review.moderation_status is distinct from p_expected_status then raise exception 'Review changed' using errcode='P4090'; end if;
  if v_review.moderation_status=p_decision and v_review.moderation_reason is not distinct from p_reason then return v_review.id; end if;
  update public.whatsapp_reviews set moderation_status=p_decision,moderation_reason=p_reason,moderated_by=v_actor,moderated_at=now(),updated_at=now() where id=p_review_id;
  insert into public.audit_events(actor_id,entity_type,entity_id,action,changes)
    values(v_actor,'whatsapp_review',p_review_id,'review_moderated',jsonb_build_object('from',v_review.moderation_status,'to',p_decision,'reason',p_reason));
  return p_review_id;
end; $$;
revoke all on function public.moderate_whatsapp_review(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.moderate_whatsapp_review(uuid,text,text,text) to authenticated;

create view public.admin_review_inbox with (security_invoker=true) as
  select r.id,'product'::text as source,coalesce(nullif(p.display_name,''),'Cliente') as customer_name,
    pr.name as subject,pr.sku as reference,r.rating,r.comment,r.moderation_status,r.moderation_reason,r.created_at
  from public.reviews r join public.profiles p on p.id=r.customer_id join public.products pr on pr.id=r.product_id
  union all
  select r.id,'whatsapp'::text,coalesce(nullif(p.display_name,''),'Cliente'),'Experiencia al solicitar por WhatsApp',i.reference,r.rating,r.comment,r.moderation_status,r.moderation_reason,r.created_at
  from public.whatsapp_reviews r join public.whatsapp_review_invitations i on i.id=r.invitation_id join public.profiles p on p.id=i.customer_id;
revoke all on public.admin_review_inbox from public,anon,authenticated,service_role;
grant select on public.admin_review_inbox to service_role;

create function public.published_whatsapp_reviews()
returns table(id uuid,author_name text,rating smallint,comment text,created_at timestamptz)
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select r.id,case when p.display_name is null or p.display_name like '%@%' then 'Cliente' else left(coalesce(nullif(substring(btrim(p.display_name) from '^[^[:space:]]+'),''),'Cliente'),40) end,
    r.rating,r.comment,r.created_at
  from public.whatsapp_reviews r join public.whatsapp_review_invitations i on i.id=r.invitation_id join public.profiles p on p.id=i.customer_id
  where r.moderation_status='visible'
  order by r.created_at desc,r.id limit 6;
$$;
revoke all on function public.published_whatsapp_reviews() from public,anon,authenticated,service_role;
grant execute on function public.published_whatsapp_reviews() to anon,authenticated;

comment on table public.whatsapp_reviews is 'Experience preparing a WhatsApp request, never a verified product purchase. Original rating and comment are not edited by moderators.';
notify pgrst,'reload schema';

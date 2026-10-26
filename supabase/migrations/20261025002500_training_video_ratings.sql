-- Model approved explicitly by the user on 2026-10-25. DEV only.
do $preflight$
begin
  if to_regclass('public.trainings') is null or to_regclass('public.profiles') is null
     or to_regclass('storage.objects') is null
     or to_regclass('public.training_ratings') is not null
     or exists (select 1 from storage.buckets where id='training-videos') then
    raise exception 'Training prerequisites or migration state require review';
  end if;
end
$preflight$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('training-videos','training-videos',false,50000000,array['video/mp4','video/webm']);

alter table public.trainings drop constraint trainings_publishable_video_check;
alter table public.trainings add constraint trainings_publishable_video_check check (
  publication_status <> 'published' or num_nonnulls(video_url,video_storage_path)=1
);
alter table public.trainings add constraint trainings_video_storage_path_check check (
  video_storage_path is null or video_storage_path ~ (
    '^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](mp4|webm)$'
  )
);
create unique index trainings_video_storage_path_uq on public.trainings(video_storage_path)
  where video_storage_path is not null;
grant select(video_storage_path) on public.trainings to anon,authenticated;
create or replace view public.catalog_trainings
with (security_invoker=true,security_barrier=true) as
select id,slug,title,description,cover_path,video_url,created_at,video_storage_path
from public.trainings where publication_status='published';

create table public.training_ratings (
  training_id uuid not null references public.trainings(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  rating smallint not null check(rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(training_id,user_id)
);
create index training_ratings_user_idx on public.training_ratings(user_id);
alter table public.training_ratings enable row level security;
revoke all on public.training_ratings from public,anon,authenticated;
grant select on public.training_ratings to authenticated;
grant insert(training_id,user_id,rating),update(rating) on public.training_ratings to authenticated;
grant all on public.training_ratings to service_role;
create policy training_ratings_own_read on public.training_ratings for select to authenticated
  using(user_id=(select auth.uid()));
create policy training_ratings_own_insert on public.training_ratings for insert to authenticated
  with check(user_id=(select auth.uid())
    and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active)
    and exists(select 1 from public.trainings t where t.id=training_id and t.publication_status='published'));
create policy training_ratings_own_update on public.training_ratings for update to authenticated
  using(user_id=(select auth.uid()))
  with check(user_id=(select auth.uid())
    and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active)
    and exists(select 1 from public.trainings t where t.id=training_id and t.publication_status='published'));

create function greenbel_private.guard_training_rating() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if tg_op='UPDATE' and (new.user_id is distinct from old.user_id or new.training_id is distinct from old.training_id) then
    raise exception 'Rating ownership cannot change' using errcode='42501';
  end if;
  perform 1 from public.profiles where id=new.user_id and active for share;
  if not found then raise exception 'Active profile required' using errcode='42501'; end if;
  perform 1 from public.trainings where id=new.training_id and publication_status='published' for share;
  if not found then raise exception 'Published training required' using errcode='42501'; end if;
  if tg_op='UPDATE' then new.created_at=old.created_at; end if;
  new.updated_at=now();
  return new;
end;
$$;
create trigger training_ratings_guard before insert or update on public.training_ratings
for each row execute function greenbel_private.guard_training_rating();
revoke all on function greenbel_private.guard_training_rating() from public,anon,authenticated,service_role;

-- Anonymous consumers receive aggregates only, never individual users or votes.
create function public.training_rating_summaries(p_training_ids uuid[])
returns table(training_id uuid,average_rating numeric,rating_count bigint)
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
  if p_training_ids is null or cardinality(p_training_ids)>100 then
    raise exception 'Between zero and 100 training IDs required';
  end if;
  return query select t.id,round(avg(r.rating),2),count(r.user_id)
  from public.trainings t left join public.training_ratings r on r.training_id=t.id
  where t.id=any(p_training_ids) and t.publication_status='published'
  group by t.id;
end;
$$;
revoke all on function public.training_rating_summaries(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.training_rating_summaries(uuid[]) to anon,authenticated,service_role;

-- Admin routes must authorize an active admin before using these service-only views.
create view public.admin_training_rating_stats with(security_barrier=true) as
select t.id as training_id,round(avg(r.rating),2) as average_rating,count(r.user_id) as rating_count
from public.trainings t left join public.training_ratings r on r.training_id=t.id group by t.id;
create view public.admin_training_rating_overview with(security_barrier=true) as
select round(avg(rating),2) as average_rating,count(*) as rating_count,
count(distinct training_id) as rated_trainings from public.training_ratings;
revoke all on public.admin_training_rating_stats,public.admin_training_rating_overview from public,anon,authenticated;
grant select on public.admin_training_rating_stats,public.admin_training_rating_overview to service_role;

comment on table public.training_ratings is 'One editable 1-5 star rating per active authenticated profile and published training. Separate from purchase reviews.';
comment on view public.admin_training_rating_overview is 'Service-only weighted global average across individual training votes, not an average of per-training averages.';

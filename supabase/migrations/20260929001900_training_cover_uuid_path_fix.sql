-- Additive correction to 018. Its filename pattern omitted one UUID group.
-- Keeps the private bucket, unique index, training rows and Storage objects.

do $preflight$
declare
  v_definition text;
begin
  if to_regclass('public.trainings') is null
     or to_regclass('public.trainings_cover_path_uq') is null
     or to_regclass('storage.buckets') is null then
    raise exception 'Training cover migration 018 is not present';
  end if;
  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid = 'public.trainings'::regclass
    and conname = 'trainings_cover_path_format_check';
  if v_definition is null then
    raise exception 'Training cover path constraint is missing';
  end if;
  if position('/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' in v_definition) = 0
     or position('/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' in v_definition) > 0 then
    raise exception 'Training cover path constraint differs from 018; review before changing it';
  end if;
  if not exists (
    select 1 from storage.buckets
    where id = 'training-covers' and public = false
  ) then
    raise exception 'Private training cover bucket is absent';
  end if;
  if exists (select 1 from public.trainings where cover_path is not null) then
    raise exception 'Existing cover paths require manual audit before correcting constraint';
  end if;
end
$preflight$;

alter table public.trainings
  drop constraint trainings_cover_path_format_check;
alter table public.trainings
  add constraint trainings_cover_path_format_check check (
    cover_path is null or cover_path ~ (
      '^' || id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp|avif)$'
    )
  );

do $verify$
begin
  if not (
    'a1000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000002.png'
    ~ ('^' || 'a1000000-0000-4000-8000-000000000001' ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp|avif)$')
  ) then
    raise exception 'A standard UUID training cover path must match';
  end if;
end
$verify$;

comment on constraint trainings_cover_path_format_check on public.trainings is
  'Private training UUID/standard image UUID path. Server validates image bytes and admin role.';

-- Technical addition for TAL-03: private training cover images. DEV only.
-- Requires 001 and Supabase Storage; does not change existing training rows.

do $preflight$
begin
  if to_regclass('public.trainings') is null
     or to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Training or Supabase Storage schema is missing';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'storage.objects'::regclass and relrowsecurity
  ) then
    raise exception 'Storage objects RLS must be enabled';
  end if;
  if exists (select 1 from storage.buckets where id = 'training-covers')
     or exists (select 1 from storage.objects where bucket_id = 'training-covers') then
    raise exception 'Training cover bucket or objects already exist; audit before migration';
  end if;
  if exists (select 1 from public.trainings where cover_path is not null) then
    raise exception 'Existing training covers require path/file audit before migration';
  end if;
  if exists (
    select 1 from pg_policies pol
    where pol.schemaname = 'storage' and pol.tablename = 'objects'
      and pol.cmd in ('SELECT','ALL')
      and exists (
        select 1 from unnest(pol.roles) as policy_role(role_name)
        where policy_role.role_name::text in ('public','anon','authenticated')
      )
  ) then
    raise exception 'Audit client SELECT policies on storage.objects before training covers';
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.trainings'::regclass
      and conname = 'trainings_cover_path_format_check'
  ) or to_regclass('public.trainings_cover_path_uq') is not null then
    raise exception 'Training cover constraints already exist; audit migration history';
  end if;
end
$preflight$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'training-covers','training-covers',false,8000000,
  array['image/jpeg','image/png','image/webp','image/avif']::text[]
);

alter table public.trainings
  add constraint trainings_cover_path_format_check check (
    cover_path is null or cover_path ~ (
      '^' || id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp|avif)$'
    )
  );
create unique index trainings_cover_path_uq on public.trainings (cover_path)
  where cover_path is not null;

comment on constraint trainings_cover_path_format_check on public.trainings is
  'Private training cover path scoped to the training UUID. Server validates image bytes and admin role.';

-- No client policy on storage.objects: only the authorized server uploads, and
-- public reads pass through a route that checks published training visibility.

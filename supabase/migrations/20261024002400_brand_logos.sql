-- Approved 24/10/2026 for DEV: private logos for the existing brands table.
-- No table, relation, RLS policy or role/grant changes.
begin;

do $preflight$
begin
  if to_regclass('public.brands') is null
     or to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='brands' and column_name='logo_path'
     ) then
    raise exception 'Brand logo prerequisites are missing';
  end if;
  if (select count(*) from pg_class
      where oid in ('public.brands'::regclass,'storage.objects'::regclass)
        and relrowsecurity) <> 2 then
    raise exception 'Brands and Storage objects must retain RLS';
  end if;
  if exists (select 1 from storage.buckets where id='brand-logos')
     or exists (select 1 from storage.objects where bucket_id='brand-logos')
     or exists (select 1 from public.brands where logo_path is not null) then
    raise exception 'Existing brand logo data requires an audit before this migration';
  end if;

  -- The only audited client Storage policies are owner-only profile avatars.
  -- Stop on policy drift; never weaken or rewrite another feature's policies.
  if exists (
    select 1 from pg_policies p
    where p.schemaname='storage' and p.tablename='objects'
      and exists (select 1 from unnest(p.roles) r where r::text in ('public','anon','authenticated'))
      and (
        p.policyname not in (
          'profile_avatars_owner_insert','profile_avatars_owner_select',
          'profile_avatars_owner_update','profile_avatars_owner_delete'
        )
        or p.roles <> array['authenticated']::name[]
        or (p.qual is not null and p.qual not like '((bucket_id = ''profile-avatars''::text) AND %')
        or (p.with_check is not null and p.with_check not like '((bucket_id = ''profile-avatars''::text) AND %')
        or (p.qual is null and p.with_check is null)
      )
  ) then
    raise exception 'Audit client Storage policies before adding brand logos';
  end if;
end
$preflight$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('brand-logos','brand-logos',false,2000000,array['image/webp']::text[]);

-- No direct client policies: the server authorizes active administrators for
-- writes, and checks active brand visibility through RLS before public reads.
-- Incoming images are validated and normalized before this bucket is used.
commit;

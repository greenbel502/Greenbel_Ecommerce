-- Approved by the user 2026-10-13: private customer avatar and preferred address.
-- Additive; no backfill of personal data, no order snapshot changes, no email.
-- Apply only to DEV in this iteration. See docs/modelo-perfil-cliente-dev.md.
begin;

do $preflight$
begin
  if to_regclass('public.profiles') is null or to_regclass('storage.objects') is null
     or not (select relrowsecurity from pg_class where oid='public.profiles'::regclass)
     or not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then
    raise exception 'Profiles and Storage must exist with RLS enabled';
  end if;
end
$preflight$;

alter table public.profiles add column if not exists address_line text;
alter table public.profiles add column if not exists avatar_path text;
do $constraints$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_address_line_check') then
    alter table public.profiles add constraint profiles_address_line_check
      check (address_line is null or char_length(btrim(address_line)) between 5 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_avatar_path_check') then
    alter table public.profiles add constraint profiles_avatar_path_check check (
      avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$')
    );
  end if;
end
$constraints$;
comment on column public.profiles.address_line is 'Optional preferred delivery address. Checkout requires explicit review; historical order snapshots remain unchanged.';
comment on column public.profiles.avatar_path is 'Owner UUID/image UUID.webp in private profile-avatars. Uploaded images are decoded and processed by the authenticated server.';
grant select (address_line,avatar_path), update (address_line,avatar_path) on public.profiles to authenticated;
-- Existing own-row policies continue to control profile SELECT/UPDATE. No role/active grants.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-avatars','profile-avatars',false,2000000,array['image/webp']::text[])
on conflict(id) do nothing;
do $bucket$
begin
  if not exists (select 1 from storage.buckets where id='profile-avatars' and not public
    and file_size_limit=2000000 and allowed_mime_types=array['image/webp']::text[]) then
    raise exception 'Existing avatar bucket differs from the approved private configuration';
  end if;
end
$bucket$;

-- All policies are bucket-specific and require the active owner. UPDATE checks
-- both old and new paths so moving an object into another user's folder is denied.
do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='profile_avatars_owner_select') then
    create policy profile_avatars_owner_select on storage.objects for select to authenticated using (
      bucket_id='profile-avatars' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$')
      and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active)
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='profile_avatars_owner_insert') then
    create policy profile_avatars_owner_insert on storage.objects for insert to authenticated with check (
      bucket_id='profile-avatars' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$')
      and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active)
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='profile_avatars_owner_update') then
    create policy profile_avatars_owner_update on storage.objects for update to authenticated using (
      bucket_id='profile-avatars' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$')
      and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active)
    ) with check (
      bucket_id='profile-avatars' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$')
      and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active)
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='profile_avatars_owner_delete') then
    create policy profile_avatars_owner_delete on storage.objects for delete to authenticated using (
      bucket_id='profile-avatars' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$')
      and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active)
    );
  end if;
end
$policies$;
commit;

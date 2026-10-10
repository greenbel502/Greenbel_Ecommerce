-- GreenBel block 6: private Storage bucket for product images.
-- Requires catalog foundation (001). The Next.js server must check an active
-- admin role before using service_role to upload; Storage service keys bypass RLS.
-- Public reads go through product_images RLS and /api/product-images/[id].

do $preflight$
begin
  if to_regclass('public.product_images') is null
     or to_regclass('public.products') is null then
    raise exception 'Apply and verify GreenBel catalog foundation first';
  end if;
  if to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage schema is missing';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'storage.objects'::regclass and relrowsecurity
  ) then
    raise exception 'Storage objects RLS must be enabled before product media';
  end if;
  if exists (select 1 from storage.buckets where id = 'product-images')
     or exists (select 1 from storage.objects where bucket_id = 'product-images') then
    raise exception 'Product-images bucket or objects already exist; audit them before migration';
  end if;
  if exists (select 1 from public.product_images) then
    raise exception 'Existing product image records require path/file audit before migration';
  end if;
  -- A permissive policy for a different bucket may have an overly broad
  -- expression. Stop rather than claim private access without auditing it.
  if exists (
    select 1 from pg_policies pol
    where pol.schemaname = 'storage' and pol.tablename = 'objects'
      and pol.cmd in ('SELECT','ALL')
      and exists (
        select 1 from unnest(pol.roles) as policy_role(role_name)
        where policy_role.role_name::text in ('public','anon','authenticated')
      )
  ) then
    raise exception 'Audit existing client SELECT policies on storage.objects before product media';
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.product_images'::regclass
      and conname = 'product_images_storage_path_format_check'
  ) or to_regclass('public.product_images_storage_path_uq') is not null then
    raise exception 'Product media path rules already exist; audit migration history';
  end if;
end
$preflight$;

-- Supabase Storage enforces the bucket's exact MIME and byte limits on upload.
-- Private is explicit: a public bucket bypasses read restrictions for assets.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'product-images','product-images',false,8000000,
  array['image/jpeg','image/png','image/webp','image/avif']::text[]
);

-- The path supplied by the admin server must point inside its product folder.
-- A published product cannot accidentally expose a draft product's file by
-- registering the same path as its own image. No SVG is accepted.
alter table public.product_images
  add constraint product_images_storage_path_format_check check (
    storage_path ~ (
      '^' || product_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp|avif)$'
    )
  );
create unique index product_images_storage_path_uq
  on public.product_images (storage_path);

comment on constraint product_images_storage_path_format_check on public.product_images is
  'Relative product UUID/image UUID path. Server checks file signature and admin role; Storage bucket restricts MIME/bytes.';

-- Intentionally no SELECT/INSERT/UPDATE/DELETE policy on storage.objects for
-- anon or authenticated. service_role is used only by the authorized server.

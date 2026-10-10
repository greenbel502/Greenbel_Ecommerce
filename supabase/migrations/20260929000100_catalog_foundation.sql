-- GreenBel foundation, block 1. Approved model; DEV only after separate review.
-- Apply with the Supabase migration runner in one transaction, not SQL Editor.
-- This file is deliberately empty of product, price, stock, or role seed data.

do $preflight$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'GreenBel foundation requires PostgreSQL 15+ for security_invoker views';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'Supabase Auth users table is missing';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'Expected Supabase API roles are missing';
  end if;
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  ) then
    raise exception 'GreenBel foundation expected an empty public schema; audit existing objects before migration';
  end if;
  if to_regnamespace('greenbel_private') is not null then
    raise exception 'GreenBel private schema already exists; audit it before migration';
  end if;
end
$preflight$;

create schema greenbel_private;
revoke all on schema greenbel_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default '',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 160),
  constraint profiles_phone_length check (phone is null or char_length(phone) <= 40)
);

create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  role text not null default 'customer',
  created_at timestamptz not null default now(),
  constraint user_roles_role_check check (role in ('customer', 'operator', 'admin'))
);

create table public.site_content (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null default '',
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  publication_status text not null default 'draft',
  edited_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_content_key_check check (key in ('home', 'about', 'contact')),
  constraint site_content_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint site_content_schema_version_check check (schema_version > 0),
  constraint site_content_status_check check (publication_status in ('draft', 'published', 'archived'))
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_path text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brands_name_check check (char_length(btrim(name)) between 1 and 160),
  constraint brands_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create unique index brands_name_normalized_uq on public.brands (lower(btrim(name)));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_check check (char_length(btrim(name)) between 1 and 160),
  constraint categories_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint categories_sort_order_check check (sort_order >= 0),
  constraint categories_not_own_parent_check check (parent_id is null or parent_id <> id)
);
create index categories_parent_order_idx on public.categories (parent_id, sort_order);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  slug text not null unique,
  name text not null,
  model text,
  kind text not null,
  brand_id uuid references public.brands(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  short_description text,
  description text,
  regular_price numeric(14,2),
  currency char(3),
  allows_fractional boolean not null default false,
  warranty_months integer,
  warranty_terms text,
  shipping_weight_kg numeric(10,3),
  shipping_dimensions jsonb,
  featured boolean not null default false,
  publication_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_sku_check check (char_length(btrim(sku)) between 1 and 100),
  constraint products_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint products_name_check check (char_length(btrim(name)) between 1 and 240),
  constraint products_kind_check check (kind in ('equipment', 'part', 'accessory')),
  constraint products_regular_price_check check (regular_price is null or regular_price > 0),
  constraint products_currency_check check (
    (currency is null or btrim(currency) = 'GTQ')
    and (regular_price is null or currency is not null)
  ),
  constraint products_warranty_months_check check (warranty_months is null or warranty_months >= 0),
  constraint products_weight_check check (shipping_weight_kg is null or shipping_weight_kg > 0),
  constraint products_dimensions_check check (
    shipping_dimensions is null or jsonb_typeof(shipping_dimensions) = 'object'
  ),
  constraint products_status_check check (publication_status in ('draft', 'published', 'archived'))
);
create index products_category_status_idx on public.products (category_id, publication_status);
create index products_brand_status_idx on public.products (brand_id, publication_status);
create index products_public_listing_idx on public.products (featured desc, created_at desc)
  where publication_status = 'published';

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  storage_path text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint product_images_path_check check (
    char_length(storage_path) between 1 and 500
    and storage_path !~ '(^/|(^|/)\.\.(/|$))'
  ),
  constraint product_images_sort_order_check check (sort_order >= 0),
  constraint product_images_alt_length_check check (char_length(alt_text) <= 300)
);
create index product_images_product_order_idx on public.product_images (product_id, sort_order);
create unique index product_images_one_primary_uq on public.product_images (product_id)
  where is_primary;

create table public.product_specs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  label text not null,
  value text not null,
  unit text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint product_specs_label_check check (char_length(btrim(label)) between 1 and 160),
  constraint product_specs_value_check check (char_length(btrim(value)) between 1 and 600),
  constraint product_specs_unit_check check (unit is null or char_length(btrim(unit)) between 1 and 60),
  constraint product_specs_order_check check (sort_order >= 0)
);
create index product_specs_product_order_idx on public.product_specs (product_id, sort_order);

create table public.product_inclusions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  description text not null,
  quantity numeric(14,3) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint product_inclusions_description_check check (char_length(btrim(description)) between 1 and 300),
  constraint product_inclusions_quantity_check check (quantity > 0),
  constraint product_inclusions_order_check check (sort_order >= 0)
);
create index product_inclusions_product_order_idx on public.product_inclusions (product_id, sort_order);

create table public.product_compatibilities (
  equipment_id uuid not null references public.products(id) on delete restrict,
  part_id uuid not null references public.products(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  primary key (equipment_id, part_id),
  constraint product_compatibilities_not_self_check check (equipment_id <> part_id)
);
create index product_compatibilities_part_idx on public.product_compatibilities (part_id, equipment_id);

create table public.product_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  kind text not null,
  value numeric(14,2) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  enabled boolean not null default false,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_offers_kind_check check (kind in ('fixed_price', 'percentage')),
  constraint product_offers_value_check check (
    (kind = 'fixed_price' and value > 0)
    or (kind = 'percentage' and value > 0 and value < 100)
  ),
  constraint product_offers_time_check check (starts_at < ends_at)
);
create index product_offers_product_time_idx on public.product_offers (product_id, starts_at, ends_at)
  where enabled;

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  cover_path text,
  video_url text,
  video_storage_path text,
  publication_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainings_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint trainings_title_check check (char_length(btrim(title)) between 1 and 240),
  constraint trainings_status_check check (publication_status in ('draft', 'published', 'archived')),
  constraint trainings_one_video_source_check check (num_nonnulls(video_url, video_storage_path) <= 1),
  constraint trainings_video_url_check check (
    video_url is null or video_url ~ '^https://[^[:space:]]+$'
  ),
  -- Storage video delivery is deferred: a published training needs a usable URL now.
  constraint trainings_publishable_video_check check (
    publication_status <> 'published' or video_url is not null
  )
);
create index trainings_public_idx on public.trainings (created_at desc)
  where publication_status = 'published';

create table public.training_products (
  training_id uuid not null references public.trainings(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  primary key (training_id, product_id)
);
create index training_products_product_idx on public.training_products (product_id, training_id);

create table public.training_categories (
  training_id uuid not null references public.trainings(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  primary key (training_id, category_id)
);
create index training_categories_category_idx on public.training_categories (category_id, training_id);

create function greenbel_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function greenbel_private.touch_updated_at();
create trigger site_content_touch_updated_at before update on public.site_content
for each row execute function greenbel_private.touch_updated_at();
create trigger brands_touch_updated_at before update on public.brands
for each row execute function greenbel_private.touch_updated_at();
create trigger categories_touch_updated_at before update on public.categories
for each row execute function greenbel_private.touch_updated_at();
create trigger products_touch_updated_at before update on public.products
for each row execute function greenbel_private.touch_updated_at();
create trigger product_offers_touch_updated_at before update on public.product_offers
for each row execute function greenbel_private.touch_updated_at();
create trigger trainings_touch_updated_at before update on public.trainings
for each row execute function greenbel_private.touch_updated_at();

-- Auth creates only the least privileged business role. Staff promotion is separate.
create function greenbel_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger greenbel_auth_user_created
after insert on auth.users
for each row execute function greenbel_private.handle_new_auth_user();

-- Existing Auth accounts, if any, receive customer only. No admin role is inferred.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
insert into public.user_roles (user_id, role)
select id, 'customer' from public.profiles
on conflict (user_id) do nothing;

create function greenbel_private.prevent_category_cycle()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  has_cycle boolean;
begin
  if new.parent_id is null then
    return new;
  end if;
  -- Serialize hierarchy edits, including two concurrent reparenting operations.
  perform pg_catalog.pg_advisory_xact_lock(69241, 1);
  with recursive ancestors(id, parent_id) as (
    select c.id, c.parent_id from public.categories c where c.id = new.parent_id
    union all
    select c.id, c.parent_id
    from public.categories c
    join ancestors a on c.id = a.parent_id
  )
  select exists (select 1 from ancestors where id = new.id) into has_cycle;
  if has_cycle then
    raise exception 'Category hierarchy cannot contain a cycle';
  end if;
  return new;
end;
$$;
create trigger categories_prevent_cycle
before insert or update of parent_id on public.categories
for each row execute function greenbel_private.prevent_category_cycle();

create function greenbel_private.validate_product_compatibility()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  equipment_kind text;
  part_kind text;
begin
  select kind into equipment_kind
  from public.products where id = new.equipment_id for share;
  select kind into part_kind
  from public.products where id = new.part_id for share;
  if equipment_kind is distinct from 'equipment' or part_kind is distinct from 'part' then
    raise exception 'Compatibility requires an equipment product and a part product';
  end if;
  return new;
end;
$$;
create trigger product_compatibilities_validate
before insert or update on public.product_compatibilities
for each row execute function greenbel_private.validate_product_compatibility();

create function greenbel_private.guard_product_kind_change()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.kind is distinct from old.kind
     and exists (
       select 1 from public.product_compatibilities pc
       where pc.equipment_id = old.id or pc.part_id = old.id
     ) then
    raise exception 'Remove and review compatibility links before changing product kind';
  end if;
  return new;
end;
$$;
create trigger products_guard_kind
before update of kind on public.products
for each row execute function greenbel_private.guard_product_kind_change();

create function greenbel_private.validate_product_offer()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  base_price numeric(14,2);
  has_overlap boolean;
begin
  -- Lock the parent SKU so two enabled offers cannot race past the overlap check.
  select regular_price into base_price
  from public.products where id = new.product_id for update;
  if not found then
    raise exception 'Offer product does not exist';
  end if;
  if new.enabled then
    if base_price is null then
      raise exception 'Cannot enable an offer for a product without a regular price';
    end if;
    if new.kind = 'fixed_price' and new.value >= base_price then
      raise exception 'Offer final price must be below the regular price';
    end if;
    if new.kind = 'percentage'
       and (
         round(base_price * (100 - new.value) / 100, 2) <= 0
         or round(base_price * (100 - new.value) / 100, 2) >= base_price
       ) then
      raise exception 'Offer percentage must leave a positive final price below the regular price';
    end if;
    select exists (
      select 1
      from public.product_offers o
      where o.product_id = new.product_id
        and o.id <> new.id
        and o.enabled
        and tstzrange(o.starts_at, o.ends_at, '[)')
            && tstzrange(new.starts_at, new.ends_at, '[)')
    ) into has_overlap;
    if has_overlap then
      raise exception 'Enabled offers for one product may not overlap';
    end if;
  end if;
  return new;
end;
$$;
create trigger product_offers_validate
before insert or update on public.product_offers
for each row execute function greenbel_private.validate_product_offer();

create function greenbel_private.guard_regular_price_change()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.regular_price is distinct from old.regular_price
     and exists (
       select 1 from public.product_offers o
       where o.product_id = old.id and o.enabled and o.ends_at > now()
     ) then
    raise exception 'Disable and review current or future offers before changing the regular price';
  end if;
  return new;
end;
$$;
create trigger products_guard_regular_price
before update of regular_price on public.products
for each row execute function greenbel_private.guard_regular_price_change();

revoke all on all functions in schema greenbel_private from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.site_content enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_specs enable row level security;
alter table public.product_inclusions enable row level security;
alter table public.product_compatibilities enable row level security;
alter table public.product_offers enable row level security;
alter table public.trainings enable row level security;
alter table public.training_products enable row level security;
alter table public.training_categories enable row level security;

-- Grants and policies are intentionally read-only for the public catalog.
-- Staff commands must later authorize the business role on the server.
revoke all on table
  public.profiles, public.user_roles, public.site_content,
  public.brands, public.categories, public.products,
  public.product_images, public.product_specs, public.product_inclusions,
  public.product_compatibilities, public.product_offers, public.trainings,
  public.training_products, public.training_categories
from public, anon, authenticated;
grant all on table
  public.profiles, public.user_roles, public.site_content,
  public.brands, public.categories, public.products,
  public.product_images, public.product_specs, public.product_inclusions,
  public.product_compatibilities, public.product_offers, public.trainings,
  public.training_products, public.training_categories
to service_role;
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

grant select (id, display_name, phone, active, created_at, updated_at)
  on public.profiles to authenticated;
grant update (display_name, phone)
  on public.profiles to authenticated;
create policy profiles_own_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_own_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select (user_id, role) on public.user_roles to authenticated;
create policy user_roles_own_select on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select (id, key, title, payload, schema_version, publication_status)
  on public.site_content to anon, authenticated;
create policy site_content_published_select on public.site_content
  for select to anon, authenticated
  using (publication_status = 'published');

grant select on public.brands to anon, authenticated;
create policy brands_active_select on public.brands
  for select to anon, authenticated
  using (active);

grant select on public.categories to anon, authenticated;
create policy categories_active_select on public.categories
  for select to anon, authenticated
  using (active);

grant select (
  id, sku, slug, name, model, kind, brand_id, category_id,
  short_description, description, regular_price, currency,
  warranty_months, warranty_terms, featured, publication_status, created_at
) on public.products to anon, authenticated;
create policy products_published_select on public.products
  for select to anon, authenticated
  using (
    publication_status = 'published'
    and exists (
      select 1 from public.categories c
      where c.id = category_id and c.active
    )
    and (
      brand_id is null or exists (
        select 1 from public.brands b
        where b.id = brand_id and b.active
      )
    )
  );

grant select on public.product_images to anon, authenticated;
create policy product_images_public_select on public.product_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

grant select on public.product_specs to anon, authenticated;
create policy product_specs_public_select on public.product_specs
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

grant select on public.product_inclusions to anon, authenticated;
create policy product_inclusions_public_select on public.product_inclusions
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

grant select on public.product_compatibilities to anon, authenticated;
create policy product_compatibilities_public_select on public.product_compatibilities
  for select to anon, authenticated
  using (
    exists (select 1 from public.products p where p.id = equipment_id)
    and exists (select 1 from public.products p where p.id = part_id)
  );

grant select (id, product_id, kind, value, starts_at, ends_at, enabled)
  on public.product_offers to anon, authenticated;
create policy product_offers_current_public_select on public.product_offers
  for select to anon, authenticated
  using (
    enabled and starts_at <= now() and ends_at > now()
    and exists (select 1 from public.products p where p.id = product_id)
  );

grant select (
  id, slug, title, description, cover_path, video_url,
  publication_status, created_at
) on public.trainings to anon, authenticated;
create policy trainings_published_select on public.trainings
  for select to anon, authenticated
  using (publication_status = 'published');

grant select on public.training_products to anon, authenticated;
create policy training_products_public_select on public.training_products
  for select to anon, authenticated
  using (
    exists (select 1 from public.trainings t where t.id = training_id)
    and exists (select 1 from public.products p where p.id = product_id)
  );

grant select on public.training_categories to anon, authenticated;
create policy training_categories_public_select on public.training_categories
  for select to anon, authenticated
  using (
    exists (select 1 from public.trainings t where t.id = training_id)
    and exists (select 1 from public.categories c where c.id = category_id)
  );

create view public.catalog_products
with (security_invoker = true, security_barrier = true)
as
select
  p.id, p.sku, p.slug, p.name, p.model, p.kind,
  p.brand_id, b.name as brand_name,
  p.category_id, c.name as category_name,
  p.short_description, p.description,
  p.regular_price, p.currency,
  case
    when p.regular_price is null then null::numeric
    when o.kind = 'fixed_price' then o.value
    when o.kind = 'percentage' then round(p.regular_price * (100 - o.value) / 100, 2)
    else p.regular_price
  end as effective_price,
  o.kind as offer_kind,
  o.value as offer_value,
  p.warranty_months, p.warranty_terms, p.featured, p.created_at
from public.products p
join public.categories c on c.id = p.category_id and c.active
left join public.brands b on b.id = p.brand_id and b.active
left join lateral (
  select offer.kind, offer.value
  from public.product_offers offer
  where offer.product_id = p.id
    and offer.enabled
    and offer.starts_at <= now()
    and offer.ends_at > now()
  order by offer.starts_at desc, offer.id
  limit 1
) o on true
where p.publication_status = 'published'
  and (p.brand_id is null or b.id is not null);
revoke all on public.catalog_products from public, anon, authenticated;
grant select on public.catalog_products to anon, authenticated;
grant all on public.catalog_products to service_role;

create view public.catalog_trainings
with (security_invoker = true, security_barrier = true)
as
select id, slug, title, description, cover_path, video_url, created_at
from public.trainings
where publication_status = 'published';
revoke all on public.catalog_trainings from public, anon, authenticated;
grant select on public.catalog_trainings to anon, authenticated;
grant all on public.catalog_trainings to service_role;

comment on view public.catalog_products is
  'Public price projection; no inventory availability or unverified legacy prices.';
comment on column public.products.regular_price is
  'NULL is an intentionally missing price; never coalesce to zero for monetary actions. Published prices are GTQ and include IVA.';
comment on table public.product_inclusions is
  'Descriptive package contents, not separate inventory deductions.';
comment on table public.user_roles is
  'Staff roles are assigned only by an audited server/admin process, never by signup metadata.';

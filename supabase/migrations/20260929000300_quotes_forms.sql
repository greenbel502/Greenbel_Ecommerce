-- GreenBel block 3: private quotes, guest grants, contact, and financing drafts.
-- Requires the catalog foundation (001) and Supabase Storage metadata tables.
-- No messages, OTP, delivery queue, or commercial seed data.
-- DEV only, after checking the project target and reviewing this file.

do $preflight$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'GreenBel quotes/forms block requires PostgreSQL 15+';
  end if;
  if to_regclass('public.profiles') is null
     or to_regclass('public.products') is null
     or to_regclass('public.catalog_products') is null
     or to_regnamespace('greenbel_private') is null then
    raise exception 'Apply and verify GreenBel catalog foundation before quotes/forms block';
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage metadata is required for private quote PDFs';
  end if;
  if not exists (
    select 1 from pg_class where oid = 'storage.objects'::regclass and relrowsecurity
  ) then
    raise exception 'Storage objects RLS must be enabled before private quote PDFs';
  end if;
  -- Even a policy intended for another bucket could have an overly broad
  -- expression. Audit it explicitly before claiming private PDF access.
  if exists (
    select 1 from pg_policies pol
    where pol.schemaname = 'storage' and pol.tablename = 'objects'
      and pol.cmd in ('SELECT', 'ALL')
      and exists (
        select 1 from unnest(pol.roles) as policy_role(role_name)
        where policy_role.role_name::text in ('public', 'anon', 'authenticated')
      )
  ) then
    raise exception 'Audit existing client SELECT policies on storage.objects before quote PDFs';
  end if;
  if exists (select 1 from storage.buckets where id = 'quote-pdfs')
     or exists (select 1 from storage.objects where bucket_id = 'quote-pdfs') then
    raise exception 'Quote PDF bucket or objects already exist; audit before migration';
  end if;
  if to_regclass('public.quotes') is not null
     or to_regclass('public.quote_items') is not null
     or to_regclass('public.contact_messages') is not null
     or to_regclass('public.contact_rate_limits') is not null
     or to_regclass('public.quote_rate_limits') is not null
     or to_regclass('public.financing_requests') is not null
     or to_regclass('public.guest_access_grants') is not null then
    raise exception 'Quotes/forms objects already exist; audit history and data before migration';
  end if;
  if to_regprocedure('public.record_contact_message(uuid,text,text,text,text,text,text,text,text)') is not null then
    raise exception 'Contact command already exists; audit history before migration';
  end if;
  if to_regprocedure('public.consume_guest_access_grant(text,uuid,uuid)') is not null then
    raise exception 'Guest grant command already exists; audit history before migration';
  end if;
  if to_regprocedure('public.begin_guest_quote(uuid,text,text,text,text)') is not null then
    raise exception 'Guest quote command already exists; audit history before migration';
  end if;
  if to_regprocedure('public.create_financing_draft(uuid,text,uuid,text,text,text,text,text,text)') is not null then
    raise exception 'Financing draft command already exists; audit history before migration';
  end if;
  if not exists (
    select 1 from pg_class c
    where c.oid = 'public.products'::regclass and c.relrowsecurity
  ) or not exists (
    select 1 from pg_class c
    where c.oid = 'public.catalog_products'::regclass
      and c.relkind = 'v'
      and 'security_invoker=true' = any(coalesce(c.reloptions, array[]::text[]))
  ) then
    raise exception 'Catalog security foundation differs from reviewed migration';
  end if;
end
$preflight$;

-- No public Storage policy is added. The preflight stops on client SELECT
-- policies because their expressions must be audited before private PDFs.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('quote-pdfs', 'quote-pdfs', false, array['application/pdf']::text[]);
do $private_bucket$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'quote-pdfs' and name = 'quote-pdfs' and public = false
      and allowed_mime_types = array['application/pdf']::text[]
  ) then
    raise exception 'quote-pdfs bucket must be private and restricted to application/pdf';
  end if;
end
$private_bucket$;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  user_id uuid references public.profiles(id) on delete restrict,
  supersedes_id uuid references public.quotes(id) on delete restrict,
  customer_name text not null,
  customer_email text,
  stage text not null default 'generating',
  snapshot_version integer not null default 1,
  currency char(3) not null default 'GTQ',
  product_prices_include_iva boolean not null default true,
  subtotal numeric(14,2),
  discount_total numeric(14,2),
  merchandise_total numeric(14,2),
  included_iva_amount numeric(14,2),
  shipping_status text not null default 'pending',
  shipping_fee numeric(14,2),
  shipping_description text,
  customer_total numeric(14,2),
  terms_snapshot text not null default '',
  pdf_storage_bucket text,
  pdf_storage_path text,
  pdf_sha256 text,
  pdf_bytes bigint,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_reference_check check (char_length(btrim(reference)) between 1 and 100),
  constraint quotes_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint quotes_not_self_revision_check check (supersedes_id is null or supersedes_id <> id),
  constraint quotes_customer_name_check check (char_length(btrim(customer_name)) between 1 and 160),
  constraint quotes_customer_email_check check (
    customer_email is null or (
      char_length(customer_email) between 3 and 254
      and customer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  constraint quotes_stage_check check (stage in ('generating', 'issued', 'failed')),
  constraint quotes_snapshot_version_check check (snapshot_version = 1),
  constraint quotes_currency_check check (btrim(currency) = 'GTQ' and product_prices_include_iva),
  constraint quotes_amounts_check check (
    (subtotal is null or subtotal > 0)
    and (discount_total is null or discount_total >= 0)
    and (merchandise_total is null or merchandise_total > 0)
    and (included_iva_amount is null or included_iva_amount >= 0)
    and (merchandise_total is null or included_iva_amount is null or included_iva_amount <= merchandise_total)
    and (shipping_fee is null or shipping_fee >= 0)
    and (customer_total is null or customer_total > 0)
  ),
  constraint quotes_merchandise_reconcile_check check (
    subtotal is null or discount_total is null or merchandise_total is null
    or subtotal - discount_total = merchandise_total
  ),
  constraint quotes_shipping_check check (
    (shipping_status = 'included' and shipping_fee is not null
      and (customer_total is null or merchandise_total is null
        or customer_total = merchandise_total + shipping_fee))
    or (shipping_status in ('excluded', 'pending')
      and shipping_fee is null and customer_total is null)
  ),
  constraint quotes_shipping_description_check check (
    shipping_description is null or char_length(btrim(shipping_description)) between 1 and 240
  ),
  constraint quotes_terms_length_check check (char_length(terms_snapshot) <= 5000),
  constraint quotes_pdf_bucket_check check (
    pdf_storage_bucket is null or pdf_storage_bucket = 'quote-pdfs'
  ),
  constraint quotes_pdf_path_check check (
    pdf_storage_path is null or (
      char_length(pdf_storage_path) between 1 and 500
      and pdf_storage_path !~ '(^/|(^|/)\.\.(/|$))'
    )
  ),
  constraint quotes_pdf_hash_check check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  constraint quotes_pdf_bytes_check check (pdf_bytes is null or pdf_bytes > 0),
  constraint quotes_issued_complete_check check (
    stage <> 'issued' or (
      issued_at is not null
      and subtotal is not null and discount_total is not null and merchandise_total is not null
      and ((shipping_status = 'included' and customer_total is not null)
        or (shipping_status in ('pending', 'excluded') and customer_total is null))
      and pdf_storage_bucket is not null and pdf_storage_path is not null
      and pdf_sha256 is not null and pdf_bytes is not null
    )
  )
);
create index quotes_user_created_idx on public.quotes (user_id, created_at desc) where user_id is not null;
create index quotes_supersedes_idx on public.quotes (supersedes_id) where supersedes_id is not null;
create index quotes_stage_created_idx on public.quotes (stage, created_at desc);
create unique index quotes_pdf_storage_path_uq on public.quotes (pdf_storage_path)
  where pdf_storage_path is not null;

create table public.quote_rate_limits (
  source_hash text not null,
  window_start timestamptz not null,
  accepted_count integer not null,
  created_at timestamptz not null default now(),
  primary key (source_hash, window_start),
  constraint quote_rate_limits_hash_check check (source_hash ~ '^[0-9a-f]{64}$'),
  constraint quote_rate_limits_count_check check (accepted_count between 1 and 6)
);
create index quote_rate_limits_window_idx on public.quote_rate_limits (window_start);

-- Establish one private generation record and quota atomically before catalog
-- reads or PDF work. Repeating the same key returns its existing stage.
create function public.begin_guest_quote(
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_source_hash text,
  p_customer_name text,
  p_customer_email text
)
returns table(quote_id uuid, quote_reference text, quote_stage text, repeated boolean)
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_existing public.quotes%rowtype;
  v_accepted_count integer;
  v_quote_id uuid;
  v_reference text;
begin
  if p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid quote source' using errcode = 'P4000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('quote:' || p_idempotency_key::text, 0));
  select * into v_existing from public.quotes
    where idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint then
      raise exception 'Quote key reused with different data' using errcode = 'P4090';
    end if;
    quote_id := v_existing.id;
    quote_reference := v_existing.reference;
    quote_stage := v_existing.stage;
    repeated := true;
    return next;
    return;
  end if;

  insert into public.quote_rate_limits (source_hash, window_start, accepted_count)
  values (p_source_hash, date_trunc('hour', now()), 1)
  on conflict (source_hash, window_start)
    do update set accepted_count = public.quote_rate_limits.accepted_count + 1
      where public.quote_rate_limits.accepted_count < 6
  returning accepted_count into v_accepted_count;
  if v_accepted_count is null then
    raise exception 'Quote rate limit reached' using errcode = 'P4290';
  end if;

  v_quote_id := gen_random_uuid();
  v_reference := 'GB-COT-' || replace(v_quote_id::text, '-', '');
  insert into public.quotes
    (id, reference, idempotency_key, request_fingerprint, customer_name, customer_email)
  values (v_quote_id, v_reference, p_idempotency_key, p_request_fingerprint,
    p_customer_name, p_customer_email);
  delete from public.quote_rate_limits where (source_hash, window_start) in (
    select source_hash, window_start from public.quote_rate_limits
    where window_start < date_trunc('hour', now()) - interval '48 hours'
    order by window_start limit 50
  );
  quote_id := v_quote_id;
  quote_reference := v_reference;
  quote_stage := 'generating';
  repeated := false;
  return next;
end;
$$;

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  line_no integer not null,
  sku_snapshot text not null,
  name_snapshot text not null,
  quantity numeric(14,3) not null,
  regular_unit_price numeric(14,2) not null,
  discount_unit numeric(14,2) not null,
  final_unit_price numeric(14,2) not null,
  line_total numeric(14,2) not null,
  offer_kind_snapshot text,
  offer_value_snapshot numeric(14,2),
  warranty_months_snapshot integer,
  warranty_terms_snapshot text,
  created_at timestamptz not null default now(),
  constraint quote_items_quote_line_uq unique (quote_id, line_no),
  constraint quote_items_line_no_check check (line_no > 0),
  constraint quote_items_sku_check check (char_length(btrim(sku_snapshot)) between 1 and 100),
  constraint quote_items_name_check check (char_length(btrim(name_snapshot)) between 1 and 240),
  constraint quote_items_quantity_check check (quantity > 0 and quantity = trunc(quantity)),
  constraint quote_items_money_check check (
    regular_unit_price > 0 and discount_unit >= 0 and final_unit_price > 0 and line_total > 0
    and regular_unit_price - discount_unit = final_unit_price
    and round(final_unit_price * quantity, 2) = line_total
  ),
  constraint quote_items_offer_check check (
    (offer_kind_snapshot is null and offer_value_snapshot is null)
    or (offer_kind_snapshot = 'fixed_price' and offer_value_snapshot > 0)
    or (offer_kind_snapshot = 'percentage' and offer_value_snapshot > 0 and offer_value_snapshot < 100)
  ),
  constraint quote_items_warranty_check check (
    (warranty_months_snapshot is null or warranty_months_snapshot >= 0)
    and (warranty_terms_snapshot is null or char_length(warranty_terms_snapshot) <= 2000)
  )
);
create index quote_items_product_idx on public.quote_items (product_id);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  name text not null,
  email text not null,
  phone text,
  inquiry_type text,
  product text,
  message text not null,
  notification_status text not null default 'not_sent',
  created_at timestamptz not null default now(),
  constraint contact_messages_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint contact_messages_name_check check (char_length(btrim(name)) between 2 and 160),
  constraint contact_messages_email_check check (
    char_length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint contact_messages_phone_check check (
    phone is null or char_length(btrim(phone)) between 8 and 40
  ),
  constraint contact_messages_type_check check (
    inquiry_type is null or char_length(btrim(inquiry_type)) between 1 and 120
  ),
  constraint contact_messages_product_check check (
    product is null or char_length(btrim(product)) between 1 and 160
  ),
  constraint contact_messages_message_check check (char_length(btrim(message)) between 10 and 5000),
  constraint contact_messages_email_pause_check check (notification_status = 'not_sent')
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);

-- The request source is a server-generated HMAC of the verified ingress IP.
-- Neither the plaintext address nor the HMAC key is stored in PostgreSQL.
create table public.contact_rate_limits (
  source_hash text not null,
  window_start timestamptz not null,
  accepted_count integer not null,
  created_at timestamptz not null default now(),
  primary key (source_hash, window_start),
  constraint contact_rate_limits_hash_check check (source_hash ~ '^[0-9a-f]{64}$'),
  constraint contact_rate_limits_count_check check (accepted_count between 1 and 20)
);
create index contact_rate_limits_window_idx on public.contact_rate_limits (window_start);

-- One transaction owns key reuse, quota and persistence. A byte-for-byte
-- retry returns the original receipt without spending another quota slot.
create function public.record_contact_message(
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_source_hash text,
  p_name text,
  p_email text,
  p_phone text,
  p_inquiry_type text,
  p_product text,
  p_message text
)
returns table(contact_id uuid, repeated boolean)
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_existing public.contact_messages%rowtype;
  v_accepted_count integer;
  v_contact_id uuid;
begin
  if p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid contact source' using errcode = 'P4000';
  end if;
  -- Serialize equal idempotency keys before checking quota or inserting.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.contact_messages
    where idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint then
      raise exception 'Contact key reused with different data' using errcode = 'P4090';
    end if;
    contact_id := v_existing.id;
    repeated := true;
    return next;
    return;
  end if;

  insert into public.contact_rate_limits (source_hash, window_start, accepted_count)
  values (p_source_hash, date_trunc('hour', now()), 1)
  on conflict (source_hash, window_start)
    do update set accepted_count = public.contact_rate_limits.accepted_count + 1
      where public.contact_rate_limits.accepted_count < 20
  returning accepted_count into v_accepted_count;
  if v_accepted_count is null then
    raise exception 'Contact rate limit reached' using errcode = 'P4290';
  end if;

  insert into public.contact_messages
    (idempotency_key, request_fingerprint, name, email, phone, inquiry_type, product, message)
  values (p_idempotency_key, p_request_fingerprint, p_name, p_email, p_phone,
    p_inquiry_type, p_product, p_message)
  returning id into v_contact_id;

  -- Bounded opportunistic cleanup avoids a queue or a background delivery job.
  delete from public.contact_rate_limits where (source_hash, window_start) in (
    select source_hash, window_start from public.contact_rate_limits
    where window_start < date_trunc('hour', now()) - interval '48 hours'
    order by window_start limit 50
  );
  contact_id := v_contact_id;
  repeated := false;
  return next;
end;
$$;

create table public.financing_requests (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  applicant_name text not null,
  email text not null,
  phone text,
  message text,
  consent_to_share boolean not null default false,
  consent_version text,
  consent_at timestamptz,
  stage text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financing_requests_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint financing_requests_name_check check (char_length(btrim(applicant_name)) between 2 and 160),
  constraint financing_requests_email_check check (
    char_length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint financing_requests_phone_check check (
    phone is null or char_length(btrim(phone)) between 8 and 40
  ),
  constraint financing_requests_message_check check (
    message is null or char_length(btrim(message)) between 1 and 500
  ),
  constraint financing_requests_consent_check check (
    (not consent_to_share and consent_version is null and consent_at is null)
    or (consent_to_share and consent_version is not null and consent_at is not null
      and char_length(btrim(consent_version)) between 1 and 100)
  ),
  constraint financing_requests_draft_only_check check (stage = 'draft')
);
create index financing_requests_quote_idx on public.financing_requests (quote_id);
create index financing_requests_created_idx on public.financing_requests (created_at desc);

create table public.guest_access_grants (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) on delete restrict,
  financing_request_id uuid references public.financing_requests(id) on delete restrict,
  token_sha256 text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_uses integer not null,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint guest_access_grants_one_resource_check check (
    num_nonnulls(quote_id, financing_request_id) = 1
  ),
  constraint guest_access_grants_token_hash_check check (token_sha256 ~ '^[0-9a-f]{64}$'),
  constraint guest_access_grants_expiry_check check (expires_at > created_at),
  constraint guest_access_grants_revoke_check check (revoked_at is null or revoked_at >= created_at),
  constraint guest_access_grants_use_check check (
    max_uses > 0 and use_count >= 0 and use_count <= max_uses
  )
);
create index guest_access_grants_quote_idx on public.guest_access_grants (quote_id) where quote_id is not null;
create index guest_access_grants_financing_idx on public.guest_access_grants (financing_request_id)
  where financing_request_id is not null;
create index guest_access_grants_expiry_idx on public.guest_access_grants (expires_at)
  where revoked_at is null;

create trigger quotes_touch_updated_at before update on public.quotes
for each row execute function greenbel_private.touch_updated_at();
create trigger financing_requests_touch_updated_at before update on public.financing_requests
for each row execute function greenbel_private.touch_updated_at();

-- A quote starts in generation; only an issued quote with reconciled current
-- prices, lines and PDF metadata may be exposed. The actual private object must
-- still be uploaded and checked by the server before the issuing update.
create function greenbel_private.guard_quote_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_line_count integer;
  v_subtotal numeric(14,2);
  v_merchandise numeric(14,2);
begin
  if tg_op = 'DELETE' then
    raise exception 'Quote history cannot be deleted';
  end if;
  if tg_op = 'INSERT' then
    if new.stage <> 'generating' or new.issued_at is not null then
      raise exception 'Quote must start in generation';
    end if;
    return new;
  end if;
  if old.stage = 'issued' then
    raise exception 'Issued quote is immutable; create a revision';
  end if;
  if new.id is distinct from old.id
     or new.reference is distinct from old.reference
     or new.idempotency_key is distinct from old.idempotency_key
     or new.request_fingerprint is distinct from old.request_fingerprint
     or new.user_id is distinct from old.user_id
     or new.supersedes_id is distinct from old.supersedes_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Quote identity and request are immutable';
  end if;
  if (old.stage = 'generating' and new.stage not in ('generating', 'issued', 'failed'))
     or (old.stage = 'failed' and new.stage not in ('failed', 'generating')) then
    raise exception 'Invalid quote transition';
  end if;
  if new.stage = 'issued' then
    if new.pdf_storage_path not like new.id::text || '/%' then
      raise exception 'Private PDF path must be scoped to quote ID';
    end if;
    if not exists (
      select 1 from storage.objects o
      join storage.buckets b on b.id = o.bucket_id
      where o.bucket_id = 'quote-pdfs' and o.name = new.pdf_storage_path
        and b.public = false
    ) then
      raise exception 'Private PDF object must exist before issuing quote';
    end if;
    select count(*), sum(round(regular_unit_price * quantity, 2)), sum(line_total)
      into v_line_count, v_subtotal, v_merchandise
    from public.quote_items where quote_id = new.id;
    if v_line_count = 0
       or new.subtotal is distinct from v_subtotal
       or new.merchandise_total is distinct from v_merchandise
       or new.discount_total is distinct from (v_subtotal - v_merchandise) then
      raise exception 'Quote line totals do not reconcile';
    end if;
    if exists (
      select 1 from public.quote_items qi
      left join public.catalog_products cp on cp.id = qi.product_id
      where qi.quote_id = new.id
        and (cp.id is null or cp.regular_price is null or cp.effective_price is null
          or cp.currency is distinct from 'GTQ'
          or qi.sku_snapshot is distinct from cp.sku
          or qi.name_snapshot is distinct from cp.name
          or qi.regular_unit_price is distinct from cp.regular_price
          or qi.final_unit_price is distinct from cp.effective_price
          or qi.discount_unit is distinct from (cp.regular_price - cp.effective_price)
          or qi.offer_kind_snapshot is distinct from cp.offer_kind
          or qi.offer_value_snapshot is distinct from cp.offer_value
          or qi.warranty_months_snapshot is distinct from cp.warranty_months
          or qi.warranty_terms_snapshot is distinct from cp.warranty_terms)
    ) then
      raise exception 'Quote contains unpublished, unpriced or stale product pricing';
    end if;
  end if;
  return new;
end;
$$;
create trigger quotes_guard_change before insert or update or delete on public.quotes
for each row execute function greenbel_private.guard_quote_change();

create function greenbel_private.guard_quote_item_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_stage text;
begin
  if tg_op = 'UPDATE' and new.quote_id is distinct from old.quote_id then
    raise exception 'Quote item cannot move to another quote';
  end if;
  select stage into v_stage from public.quotes
  where id = case when tg_op = 'DELETE' then old.quote_id else new.quote_id end
  for update;
  if v_stage is distinct from 'generating' then
    raise exception 'Quote items can change only during generation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger quote_items_guard_change before insert or update or delete on public.quote_items
for each row execute function greenbel_private.guard_quote_item_change();

create function greenbel_private.guard_financing_draft()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_quote_stage text;
begin
  if tg_op = 'DELETE' then raise exception 'Financing draft history cannot be deleted'; end if;
  select stage into v_quote_stage from public.quotes where id = new.quote_id;
  if v_quote_stage is distinct from 'issued' then
    raise exception 'Financing draft requires an issued private quote PDF';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.idempotency_key is distinct from old.idempotency_key
       or new.request_fingerprint is distinct from old.request_fingerprint
       or new.created_at is distinct from old.created_at then
      raise exception 'Financing request identity is immutable';
    end if;
    if new.quote_id is distinct from old.quote_id and new.consent_to_share then
      raise exception 'Changing the quote requires renewing consent';
    end if;
  end if;
  return new;
end;
$$;
create trigger financing_requests_guard_draft before insert or update or delete on public.financing_requests
for each row execute function greenbel_private.guard_financing_draft();

create function greenbel_private.guard_guest_access_grant()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_resource_issued boolean;
begin
  if tg_op = 'DELETE' then raise exception 'Guest grant history cannot be deleted'; end if;
  if tg_op = 'INSERT' then
    if new.use_count <> 0 or new.last_used_at is not null or new.revoked_at is not null then
      raise exception 'Guest grant must start unused and active';
    end if;
    if new.quote_id is not null then
      select stage = 'issued' into v_resource_issued
      from public.quotes where id = new.quote_id;
    else
      select q.stage = 'issued' into v_resource_issued
      from public.financing_requests f
      join public.quotes q on q.id = f.quote_id
      where f.id = new.financing_request_id;
    end if;
    if v_resource_issued is distinct from true then
      raise exception 'Guest grant requires an issued private quote PDF';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.quote_id is distinct from old.quote_id
       or new.financing_request_id is distinct from old.financing_request_id
       or new.token_sha256 is distinct from old.token_sha256
       or new.expires_at is distinct from old.expires_at
       or new.max_uses is distinct from old.max_uses
       or new.created_at is distinct from old.created_at
       or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
       or new.use_count < old.use_count or new.use_count > old.use_count + 1 then
      raise exception 'Guest grant resource, token and usage history are immutable';
    end if;
  end if;
  return new;
end;
$$;
create trigger guest_access_grants_guard_change before insert or update or delete on public.guest_access_grants
for each row execute function greenbel_private.guard_guest_access_grant();

-- The private document endpoint supplies the requested resource and a SHA-256
-- token digest. An atomic UPDATE consumes the grant exactly once per permitted
-- use, including when several Vercel workers race for the same token.
create function public.consume_guest_access_grant(
  p_token_sha256 text,
  p_quote_id uuid default null,
  p_financing_request_id uuid default null
)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_grant_id uuid;
begin
  if p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$'
     or num_nonnulls(p_quote_id, p_financing_request_id) <> 1 then
    return false;
  end if;
  update public.guest_access_grants
  set use_count = use_count + 1, last_used_at = clock_timestamp()
  where token_sha256 = p_token_sha256
    and quote_id is not distinct from p_quote_id
    and financing_request_id is not distinct from p_financing_request_id
    and revoked_at is null
    and expires_at > clock_timestamp()
    and use_count < max_uses
  returning id into v_grant_id;
  return v_grant_id is not null;
end;
$$;

-- A private quote token authorizes one financing draft. The token use and
-- draft insert commit together; same-key retries check the token without
-- consuming another use. No OTP, sent state or email side effect exists.
create function public.create_financing_draft(
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_quote_id uuid,
  p_token_sha256 text,
  p_applicant_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_consent_version text
)
returns table(financing_id uuid, repeated boolean)
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_existing public.financing_requests%rowtype;
  v_grant_id uuid;
  v_financing_id uuid;
begin
  if p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_quote_id is null then
    raise exception 'Quote access is invalid' using errcode = 'P4030';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('finance:' || p_idempotency_key::text, 0));
  select * into v_existing from public.financing_requests
    where idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint
       or v_existing.quote_id is distinct from p_quote_id then
      raise exception 'Financing key reused with different data' using errcode = 'P4090';
    end if;
    if not exists (
      select 1 from public.guest_access_grants
      where token_sha256 = p_token_sha256 and quote_id = p_quote_id
        and financing_request_id is null and revoked_at is null
        and expires_at > clock_timestamp()
    ) then
      raise exception 'Quote access is invalid' using errcode = 'P4030';
    end if;
    financing_id := v_existing.id;
    repeated := true;
    return next;
    return;
  end if;

  update public.guest_access_grants
  set use_count = use_count + 1, last_used_at = clock_timestamp()
  where token_sha256 = p_token_sha256 and quote_id = p_quote_id
    and financing_request_id is null and revoked_at is null
    and expires_at > clock_timestamp() and use_count < max_uses
  returning id into v_grant_id;
  if v_grant_id is null then
    raise exception 'Quote access is invalid or exhausted' using errcode = 'P4030';
  end if;

  insert into public.financing_requests
    (quote_id, idempotency_key, request_fingerprint, applicant_name,
      email, phone, message, consent_to_share, consent_version, consent_at)
  values (p_quote_id, p_idempotency_key, p_request_fingerprint, p_applicant_name,
    p_email, p_phone, p_message, true, p_consent_version, clock_timestamp())
  returning id into v_financing_id;
  financing_id := v_financing_id;
  repeated := false;
  return next;
end;
$$;

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_rate_limits enable row level security;
alter table public.contact_messages enable row level security;
alter table public.contact_rate_limits enable row level security;
alter table public.financing_requests enable row level security;
alter table public.guest_access_grants enable row level security;

revoke all on table public.quotes, public.quote_items, public.contact_messages,
  public.contact_rate_limits, public.quote_rate_limits,
  public.financing_requests, public.guest_access_grants
from public, anon, authenticated, service_role;
grant select, insert, update on public.quotes, public.quote_items,
  public.financing_requests to service_role;
grant select, insert on public.guest_access_grants to service_role;
revoke all on function public.record_contact_message(uuid,text,text,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_contact_message(uuid,text,text,text,text,text,text,text,text)
  to service_role;
revoke all on function public.begin_guest_quote(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_guest_quote(uuid,text,text,text,text)
  to service_role;
revoke all on function public.consume_guest_access_grant(text,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_guest_access_grant(text,uuid,uuid)
  to service_role;
revoke all on function public.create_financing_draft(uuid,text,uuid,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_financing_draft(uuid,text,uuid,text,text,text,text,text,text)
  to service_role;
revoke all on function greenbel_private.guard_quote_change(),
  greenbel_private.guard_quote_item_change(),
  greenbel_private.guard_financing_draft(),
  greenbel_private.guard_guest_access_grant()
from public, anon, authenticated, service_role;

-- 002 is optional for this block; chronological DEV application adds the FK.
do $link_optional_orders$
begin
  if to_regclass('public.orders') is not null then
    alter table public.orders
      add constraint orders_source_quote_id_fkey
      foreign key (source_quote_id) references public.quotes(id) on delete restrict;
    create index orders_source_quote_idx on public.orders (source_quote_id)
      where source_quote_id is not null;
  end if;
end
$link_optional_orders$;

comment on table public.quotes is
  'Private historical quote. The server uploads a private PDF and verifies it before moving generating to issued.';
comment on table public.contact_messages is
  'Private contact submissions through the atomic server-only command. not_sent is a historical fact, never a delivery queue.';
comment on table public.contact_rate_limits is
  'Private abuse-control counters keyed by HMAC of verified ingress source; expired windows are pruned opportunistically.';
comment on table public.quote_rate_limits is
  'Private quote-issuance counters keyed by HMAC of verified ingress source; expired windows are pruned opportunistically.';
comment on table public.financing_requests is
  'Private drafts only. Email verification, sending and financial approval are not represented by this block.';
comment on table public.guest_access_grants is
  'Server-only, resource-scoped bearer grants. Store SHA-256 of a high-entropy random token, never the token. Consume with the atomic RPC.';

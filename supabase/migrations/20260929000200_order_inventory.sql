-- GreenBel block 2: order drafts and one global, auditable inventory.
-- Requires 20260929000100_catalog_foundation.sql. No stock is inferred or seeded.
-- Apply only through the reviewed DEV migration sequence, in one transaction.
-- Checkout remains closed: the confirmed stage is explicitly prohibited below.

do $preflight$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'GreenBel order/inventory block requires PostgreSQL 15+';
  end if;
  if to_regclass('public.products') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.user_roles') is null
     or to_regclass('public.catalog_products') is null
     or to_regnamespace('greenbel_private') is null
     or to_regprocedure('auth.uid()') is null then
    raise exception 'Apply and verify GreenBel catalog foundation before order/inventory block';
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
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.products'::regclass
      and c.conname = 'products_currency_check'
      and pg_get_constraintdef(c.oid) like '%GTQ%'
  ) then
    raise exception 'GTQ catalog price rule is missing from the foundation';
  end if;
  if to_regclass('public.orders') is not null
     or to_regclass('public.order_items') is not null
     or to_regclass('public.inventory_balances') is not null
     or to_regclass('public.inventory_movements') is not null
     or to_regclass('public.stock_reservations') is not null
     or to_regclass('public.inventory_operations') is not null
     or to_regprocedure('public.record_inventory_change(uuid,text,numeric,text,text,text)') is not null then
    raise exception 'Order/inventory objects already exist; audit history and data before migration';
  end if;
end
$preflight$;

-- A draft may await shipping; the later checkout block must remove the
-- checkout gate only after it installs final-total validation and payment flow.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  source_quote_id uuid,
  stage text not null default 'draft',
  currency char(3),
  customer_snapshot jsonb,
  billing_snapshot jsonb,
  delivery_snapshot jsonb,
  payment_method_snapshot jsonb,
  terms_snapshot jsonb,
  snapshot_version integer not null default 1,
  subtotal numeric(14,2),
  discount_total numeric(14,2),
  merchandise_total numeric(14,2),
  included_iva_amount numeric(14,2),
  shipping_fee numeric(14,2),
  shipping_charge_mode text,
  amount_due_greenbel numeric(14,2),
  amount_due_carrier_shipping numeric(14,2),
  customer_total numeric(14,2),
  accepted_total numeric(14,2),
  accepted_at timestamptz,
  confirmed_at timestamptz,
  idempotency_key text not null unique,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_reference_check check (char_length(btrim(reference)) between 1 and 100),
  constraint orders_key_check check (char_length(btrim(idempotency_key)) between 1 and 200),
  constraint orders_stage_check check (stage in ('draft', 'pending_shipping', 'confirmed', 'cancelled', 'completed')),
  constraint orders_checkout_gate_pending check (
    stage not in ('confirmed', 'completed') and confirmed_at is null
  ),
  constraint orders_currency_check check (currency is null or btrim(currency) = 'GTQ'),
  constraint orders_json_check check (
    (customer_snapshot is null or jsonb_typeof(customer_snapshot) = 'object')
    and (delivery_snapshot is null or jsonb_typeof(delivery_snapshot) = 'object')
    and (payment_method_snapshot is null or jsonb_typeof(payment_method_snapshot) = 'object')
    and (terms_snapshot is null or jsonb_typeof(terms_snapshot) = 'object')
  ),
  constraint orders_billing_snapshot_check check (
    billing_snapshot is null or (
      jsonb_typeof(billing_snapshot) = 'object'
      and billing_snapshot->'schema_version' = '1'::jsonb
      and (
        (
          billing_snapshot->>'type' = 'cf'
          and billing_snapshot ?& array['schema_version','type','first_name','last_name','phone']
          and billing_snapshot - array['schema_version','type','first_name','last_name','phone'] = '{}'::jsonb
          and jsonb_typeof(billing_snapshot->'first_name') = 'string'
          and jsonb_typeof(billing_snapshot->'last_name') = 'string'
          and jsonb_typeof(billing_snapshot->'phone') = 'string'
          and char_length(btrim(billing_snapshot->>'first_name')) between 1 and 160
          and char_length(btrim(billing_snapshot->>'last_name')) between 1 and 160
          and char_length(btrim(billing_snapshot->>'phone')) between 1 and 40
        ) or (
          billing_snapshot->>'type' = 'nit'
          and billing_snapshot ?& array['schema_version','type','nit','nit_holder_name','full_name','phone']
          and billing_snapshot - array['schema_version','type','nit','nit_holder_name','full_name','phone','email'] = '{}'::jsonb
          and jsonb_typeof(billing_snapshot->'nit') = 'string'
          and jsonb_typeof(billing_snapshot->'nit_holder_name') = 'string'
          and jsonb_typeof(billing_snapshot->'full_name') = 'string'
          and jsonb_typeof(billing_snapshot->'phone') = 'string'
          and char_length(btrim(billing_snapshot->>'nit')) between 1 and 40
          and char_length(btrim(billing_snapshot->>'nit_holder_name')) between 1 and 160
          and char_length(btrim(billing_snapshot->>'full_name')) between 1 and 240
          and char_length(btrim(billing_snapshot->>'phone')) between 1 and 40
          and (
            not billing_snapshot ? 'email'
            or (
              jsonb_typeof(billing_snapshot->'email') = 'string'
              and char_length(btrim(billing_snapshot->>'email')) between 1 and 254
            )
          )
        )
      )
    )
  ),
  constraint orders_version_check check (snapshot_version > 0 and version > 0),
  constraint orders_money_check check (
    (subtotal is null or subtotal >= 0)
    and (discount_total is null or discount_total >= 0)
    and (merchandise_total is null or merchandise_total >= 0)
    and (included_iva_amount is null or included_iva_amount >= 0)
    and (shipping_fee is null or shipping_fee >= 0)
    and (amount_due_greenbel is null or amount_due_greenbel >= 0)
    and (amount_due_carrier_shipping is null or amount_due_carrier_shipping >= 0)
    and (customer_total is null or customer_total >= 0)
    and (accepted_total is null or accepted_total >= 0)
  ),
  constraint orders_merchandise_reconcile_check check (
    subtotal is null or discount_total is null or merchandise_total is null
    or subtotal - discount_total = merchandise_total
  ),
  constraint orders_customer_total_reconcile_check check (
    amount_due_greenbel is null or amount_due_carrier_shipping is null or customer_total is null
    or amount_due_greenbel + amount_due_carrier_shipping = customer_total
  ),
  constraint orders_included_iva_bound_check check (
    included_iva_amount is null or customer_total is null
    or included_iva_amount <= customer_total
  ),
  constraint orders_acceptance_check check (
    (accepted_at is null and accepted_total is null)
    or (accepted_at is not null and accepted_total is not null
        and customer_total is not null and accepted_total = customer_total)
  ),
  constraint orders_shipping_mode_check check (
    shipping_charge_mode is null or shipping_charge_mode in ('included', 'carrier_collects', 'pickup')
  )
);
create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_stage_created_idx on public.orders (stage, created_at desc);
comment on column public.orders.source_quote_id is
  'Quote FK is installed by a later migration after the quotes table exists.';
comment on column public.orders.included_iva_amount is
  'Informational IVA already contained in GTQ prices; never add it to merchandise or customer totals. Keep NULL until an approved tax breakdown exists.';
comment on column public.orders.billing_snapshot is
  'Version 1 CF: first_name, last_name, phone. NIT: nit, nit_holder_name, full_name, phone, optional email. Draft may be NULL.';
comment on constraint orders_checkout_gate_pending on public.orders is
  'Blocks confirmation and reservation until complete delivery, tax, acceptance and payment validation are installed.';

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  line_no integer not null,
  quantity numeric(14,3) not null,
  sku_snapshot text,
  name_snapshot text,
  regular_unit_price numeric(14,2),
  discount_unit numeric(14,2),
  final_unit_price numeric(14,2),
  line_total numeric(14,2),
  warranty_snapshot jsonb,
  offer_snapshot jsonb,
  created_at timestamptz not null default now(),
  constraint order_items_order_line_uq unique (order_id, line_no),
  constraint order_items_line_no_check check (line_no > 0),
  constraint order_items_quantity_check check (quantity > 0),
  constraint order_items_sku_check check (sku_snapshot is null or char_length(btrim(sku_snapshot)) between 1 and 100),
  constraint order_items_name_check check (name_snapshot is null or char_length(btrim(name_snapshot)) between 1 and 240),
  constraint order_items_money_check check (
    (regular_unit_price is null or regular_unit_price > 0)
    and (discount_unit is null or discount_unit >= 0)
    and (final_unit_price is null or final_unit_price > 0)
    and (line_total is null or line_total > 0)
  ),
  constraint order_items_price_reconcile_check check (
    regular_unit_price is null or discount_unit is null or final_unit_price is null
    or regular_unit_price - discount_unit = final_unit_price
  ),
  constraint order_items_line_reconcile_check check (
    final_unit_price is null or line_total is null
    or round(final_unit_price * quantity, 2) = line_total
  ),
  constraint order_items_snapshot_check check (
    (warranty_snapshot is null or jsonb_typeof(warranty_snapshot) = 'object')
    and (offer_snapshot is null or jsonb_typeof(offer_snapshot) = 'object')
  )
);
create index order_items_product_idx on public.order_items (product_id);

-- Absence of a balance row means stock has not been verified or initialized.
create table public.inventory_balances (
  product_id uuid primary key references public.products(id) on delete restrict,
  stock_balance numeric(14,3) not null,
  reserved numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  constraint inventory_balances_nonnegative_check check (
    stock_balance >= 0 and reserved >= 0 and reserved <= stock_balance
  )
);

-- One operation key is globally unique across all inventory commands.
create table public.inventory_operations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  kind text not null,
  product_id uuid references public.products(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  request_fingerprint jsonb not null,
  actor_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_operations_key_check check (char_length(btrim(idempotency_key)) between 1 and 200),
  constraint inventory_operations_kind_check check (
    kind in ('stock_entry', 'adjustment', 'physical_sale', 'reserve', 'consolidate', 'release')
  ),
  constraint inventory_operations_subject_check check (
    (product_id is not null and order_id is null and kind in ('stock_entry', 'adjustment', 'physical_sale'))
    or (product_id is null and order_id is not null and kind in ('reserve', 'consolidate', 'release'))
  ),
  constraint inventory_operations_fingerprint_check check (jsonb_typeof(request_fingerprint) = 'object'),
  constraint inventory_operations_actor_check check (
    kind not in ('stock_entry', 'adjustment', 'physical_sale') or actor_id is not null
  )
);
create index inventory_operations_order_idx on public.inventory_operations (order_id, created_at);

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  attempt_no integer not null,
  quantity numeric(14,3) not null,
  status text not null default 'active',
  expires_at timestamptz,
  review_due_at timestamptz,
  reserve_operation_id uuid not null references public.inventory_operations(id) on delete restrict,
  close_operation_id uuid references public.inventory_operations(id) on delete restrict,
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  constraint stock_reservations_attempt_uq unique (order_item_id, attempt_no),
  constraint stock_reservations_attempt_check check (attempt_no > 0),
  constraint stock_reservations_quantity_check check (quantity > 0),
  constraint stock_reservations_status_check check (status in ('active', 'consumed', 'released')),
  constraint stock_reservations_close_check check (
    (status = 'active' and close_operation_id is null and consumed_at is null and released_at is null)
    or (status = 'consumed' and close_operation_id is not null and consumed_at is not null and released_at is null)
    or (status = 'released' and close_operation_id is not null and released_at is not null and consumed_at is null)
  )
);
create unique index stock_reservations_one_active_uq
  on public.stock_reservations (order_item_id) where status = 'active';
create index stock_reservations_status_expiry_idx
  on public.stock_reservations (status, expires_at) where status = 'active';
create index stock_reservations_review_idx
  on public.stock_reservations (review_due_at) where status = 'active' and review_due_at is not null;
create index stock_reservations_reserve_operation_idx
  on public.stock_reservations (reserve_operation_id);
create index stock_reservations_close_operation_idx
  on public.stock_reservations (close_operation_id) where close_operation_id is not null;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  kind text not null,
  quantity_delta numeric(14,3) not null,
  reason text not null,
  reference text,
  order_item_id uuid references public.order_items(id) on delete restrict,
  operation_id uuid not null references public.inventory_operations(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_movements_kind_check check (
    kind in ('stock_entry', 'adjustment', 'physical_sale', 'online_payment', 'cod_dispatch', 'pickup_handover')
  ),
  constraint inventory_movements_delta_check check (
    quantity_delta <> 0
    and (kind <> 'stock_entry' or quantity_delta > 0)
    and (kind not in ('physical_sale', 'online_payment', 'cod_dispatch', 'pickup_handover') or quantity_delta < 0)
  ),
  constraint inventory_movements_reason_check check (char_length(btrim(reason)) between 1 and 500),
  constraint inventory_movements_reference_check check (reference is null or char_length(btrim(reference)) between 1 and 200),
  constraint inventory_movements_source_check check (
    (kind in ('online_payment', 'cod_dispatch', 'pickup_handover') and order_item_id is not null)
    or (kind in ('stock_entry', 'adjustment', 'physical_sale') and order_item_id is null and actor_id is not null)
  )
);
create index inventory_movements_product_created_idx
  on public.inventory_movements (product_id, created_at desc);
create index inventory_movements_order_item_idx
  on public.inventory_movements (order_item_id) where order_item_id is not null;
create unique index inventory_movements_operation_item_uq
  on public.inventory_movements (operation_id, order_item_id) where order_item_id is not null;
create unique index inventory_movements_manual_operation_uq
  on public.inventory_movements (operation_id) where order_item_id is null;

create trigger orders_touch_updated_at before update on public.orders
for each row execute function greenbel_private.touch_updated_at();
create trigger inventory_balances_touch_updated_at before update on public.inventory_balances
for each row execute function greenbel_private.touch_updated_at();

-- Ledger and operation keys are append-only. Corrections require a new key.
create function greenbel_private.reject_immutable_change()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  raise exception 'Inventory audit rows are immutable';
end;
$$;
create trigger inventory_operations_immutable before update or delete on public.inventory_operations
for each row execute function greenbel_private.reject_immutable_change();
create trigger inventory_movements_immutable before update or delete on public.inventory_movements
for each row execute function greenbel_private.reject_immutable_change();

create function greenbel_private.guard_order_item_change()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare v_order_id uuid;
begin
  v_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  if exists (
    select 1 from public.orders o
    where o.id = v_order_id and o.stage in ('confirmed', 'completed', 'cancelled')
  ) or exists (
    select 1 from public.stock_reservations r
    where r.order_item_id = case when tg_op = 'INSERT' then new.id else old.id end
  ) then
    raise exception 'Confirmed or reserved order items cannot be changed';
  end if;
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id and exists (
    select 1 from public.orders o
    where o.id = new.order_id and o.stage in ('confirmed', 'completed', 'cancelled')
  ) then
    raise exception 'Cannot move an item into a confirmed order';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger order_items_guard_change before insert or update or delete on public.order_items
for each row execute function greenbel_private.guard_order_item_change();

create function greenbel_private.guard_order_snapshot_change()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if old.stage = 'cancelled' and new.stage is distinct from 'cancelled' then
    raise exception 'Cancelled order cannot be reopened';
  end if;
  if old.stage in ('confirmed', 'completed', 'cancelled')
     or exists (
       select 1 from public.order_items oi
       join public.stock_reservations sr on sr.order_item_id = oi.id
       where oi.order_id = old.id
     ) then
    if (to_jsonb(new) - array['stage','version','updated_at'])
       is distinct from (to_jsonb(old) - array['stage','version','updated_at']) then
      raise exception 'Confirmed or reserved order snapshots and totals are immutable';
    end if;
  end if;
  return new;
end;
$$;
create trigger orders_guard_snapshot_change before update on public.orders
for each row execute function greenbel_private.guard_order_snapshot_change();

-- No direct writes to stock tables, including from service_role. Their owner
-- functions below are the only ordinary write path.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_operations enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.stock_reservations enable row level security;

revoke all on table public.orders, public.order_items, public.inventory_balances,
  public.inventory_operations, public.inventory_movements, public.stock_reservations
from public, anon, authenticated, service_role;
grant select, insert, update on public.orders, public.order_items to service_role;
grant select on public.inventory_balances, public.inventory_operations,
  public.inventory_movements, public.stock_reservations to service_role;
grant select on public.orders, public.order_items, public.inventory_balances,
  public.inventory_operations, public.inventory_movements, public.stock_reservations
to authenticated;

create policy orders_customer_or_staff_read on public.orders
  for select to authenticated
  using (
    customer_id = (select auth.uid())
    or exists (
      select 1 from public.user_roles ur
      join public.profiles pr on pr.id = ur.user_id
      where ur.user_id = (select auth.uid()) and ur.role in ('operator', 'admin') and pr.active
    )
  );
create policy order_items_customer_or_staff_read on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy inventory_balances_staff_read on public.inventory_balances
  for select to authenticated
  using (exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = (select auth.uid()) and ur.role in ('operator', 'admin') and pr.active
  ));
create policy inventory_operations_staff_read on public.inventory_operations
  for select to authenticated
  using (exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = (select auth.uid()) and ur.role in ('operator', 'admin') and pr.active
  ));
create policy inventory_movements_staff_read on public.inventory_movements
  for select to authenticated
  using (exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = (select auth.uid()) and ur.role in ('operator', 'admin') and pr.active
  ));
create policy stock_reservations_staff_read on public.stock_reservations
  for select to authenticated
  using (exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = (select auth.uid()) and ur.role in ('operator', 'admin') and pr.active
  ));

-- This public RPC records a verified physical stock event. It does not record
-- or claim a customer payment. Authenticated operators/admins only.
create function public.record_inventory_change(
  p_product_id uuid,
  p_kind text,
  p_quantity_delta numeric,
  p_reason text,
  p_reference text,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_product public.products%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_operation public.inventory_operations%rowtype;
  v_fingerprint jsonb;
  v_movement_id uuid;
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = v_actor and ur.role in ('operator', 'admin') and pr.active
  ) then
    raise exception 'Active operator or admin required' using errcode = '42501';
  end if;
  if p_product_id is null or p_kind not in ('stock_entry', 'adjustment', 'physical_sale')
     or p_quantity_delta is null or p_quantity_delta = 0
     or p_quantity_delta <> round(p_quantity_delta, 3)
     or char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500
     or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200
     or (p_reference is not null and char_length(btrim(p_reference)) not between 1 and 200)
     or (p_kind = 'stock_entry' and p_quantity_delta < 0)
     or (p_kind = 'physical_sale' and p_quantity_delta > 0) then
    raise exception 'Invalid inventory change';
  end if;

  v_fingerprint := jsonb_build_object(
    'product_id', p_product_id, 'kind', p_kind, 'quantity_delta', p_quantity_delta,
    'reason', btrim(p_reason), 'reference', p_reference, 'actor_id', v_actor
  );
  select * into v_operation from public.inventory_operations
  where idempotency_key = p_idempotency_key for update;
  if found then
    if v_operation.kind is distinct from p_kind
       or v_operation.product_id is distinct from p_product_id
       or v_operation.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Inventory idempotency key reused with different input';
    end if;
    select id into v_movement_id from public.inventory_movements
    where operation_id = v_operation.id and order_item_id is null;
    if not found then raise exception 'Inventory operation has no matching movement'; end if;
    return v_movement_id;
  end if;

  select * into v_product from public.products where id = p_product_id for share;
  if not found then raise exception 'Unknown product'; end if;
  if not v_product.allows_fractional and p_quantity_delta <> trunc(p_quantity_delta) then
    raise exception 'Product requires whole units';
  end if;
  if p_kind = 'physical_sale' and v_product.regular_price is null then
    raise exception 'Physical sale disabled for a product without price';
  end if;

  insert into public.inventory_operations (
    idempotency_key, kind, product_id, request_fingerprint, actor_id
  ) values (
    p_idempotency_key, p_kind, p_product_id, v_fingerprint, v_actor
  ) on conflict (idempotency_key) do nothing;
  select * into v_operation from public.inventory_operations
  where idempotency_key = p_idempotency_key for update;
  if v_operation.kind is distinct from p_kind
     or v_operation.product_id is distinct from p_product_id
     or v_operation.request_fingerprint is distinct from v_fingerprint then
    raise exception 'Inventory idempotency key reused with different input';
  end if;
  select id into v_movement_id from public.inventory_movements
  where operation_id = v_operation.id and order_item_id is null;
  if found then return v_movement_id; end if;

  -- A missing row is uninitialized, never an assumed zero, except that a
  -- recorded positive entry can establish the first verified balance.
  if p_kind = 'stock_entry' and p_quantity_delta > 0 then
    insert into public.inventory_balances (product_id, stock_balance, reserved)
    values (p_product_id, 0, 0) on conflict (product_id) do nothing;
  end if;
  select * into v_balance from public.inventory_balances
  where product_id = p_product_id for update;
  if not found then raise exception 'Stock balance is not initialized'; end if;
  if v_balance.stock_balance + p_quantity_delta < v_balance.reserved then
    raise exception 'Insufficient unreserved stock';
  end if;
  update public.inventory_balances
  set stock_balance = stock_balance + p_quantity_delta
  where product_id = p_product_id;
  insert into public.inventory_movements (
    product_id, kind, quantity_delta, reason, reference, operation_id, actor_id
  ) values (
    p_product_id, p_kind, p_quantity_delta, btrim(p_reason), p_reference,
    v_operation.id, v_actor
  ) returning id into v_movement_id;
  return v_movement_id;
end;
$$;
revoke all on function public.record_inventory_change(uuid,text,numeric,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inventory_change(uuid,text,numeric,text,text,text)
  to authenticated;

comment on function public.record_inventory_change(uuid,text,numeric,text,text,text) is
  'Staff-only stock entry, adjustment or physical-sale stock reduction. No payment is recorded.';

-- The following three primitives are deliberately owner-only. In particular,
-- service_role has no EXECUTE or schema USAGE. A later reviewed checkout/payment
-- migration must provide validated wrappers and remove orders_checkout_gate_pending.
create function greenbel_private.reserve_order_core(p_order_id uuid, p_idempotency_key text)
returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_product_id uuid;
  v_product public.products%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_catalog record;
  v_operation public.inventory_operations%rowtype;
  v_fingerprint jsonb;
  v_item_count integer := 0;
  v_subtotal numeric(14,2) := 0;
  v_merchandise numeric(14,2) := 0;
  v_required numeric(14,3);
  v_attempt integer;
begin
  if p_order_id is null or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200 then
    raise exception 'Invalid reserve request';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order does not exist'; end if;
  select * into v_operation from public.inventory_operations
  where idempotency_key = p_idempotency_key for update;
  if found then
    if v_operation.kind is distinct from 'reserve'
       or v_operation.order_id is distinct from p_order_id then
      raise exception 'Inventory idempotency key reused with different input';
    end if;
    if not exists (select 1 from public.stock_reservations where reserve_operation_id = v_operation.id) then
      raise exception 'Reserve operation has no matching reservation';
    end if;
    return v_operation.id;
  end if;
  if v_order.stage <> 'confirmed' or v_order.confirmed_at is null then
    raise exception 'Only a validated confirmed order can reserve stock';
  end if;
  if v_order.accepted_at is null or v_order.accepted_total is null
     or v_order.customer_total is null or v_order.accepted_total <> v_order.customer_total
     or v_order.currency is null or v_order.delivery_snapshot is null
     or v_order.payment_method_snapshot is null or v_order.billing_snapshot is null
     or v_order.amount_due_greenbel is null or v_order.amount_due_carrier_shipping is null
     or v_order.merchandise_total is null then
    raise exception 'Confirmed order lacks required accepted checkout values';
  end if;

  v_fingerprint := jsonb_build_object('order_id', p_order_id, 'version', v_order.version,
    'customer_total', v_order.customer_total);
  insert into public.inventory_operations (idempotency_key, kind, order_id, request_fingerprint)
  values (p_idempotency_key, 'reserve', p_order_id, v_fingerprint)
  on conflict (idempotency_key) do nothing;
  select * into v_operation from public.inventory_operations
  where idempotency_key = p_idempotency_key for update;
  if v_operation.kind is distinct from 'reserve'
     or v_operation.order_id is distinct from p_order_id
     or v_operation.request_fingerprint is distinct from v_fingerprint then
    raise exception 'Inventory idempotency key reused with different input';
  end if;
  if exists (select 1 from public.stock_reservations where reserve_operation_id = v_operation.id) then
    return v_operation.id;
  end if;
  if exists (
    select 1 from public.stock_reservations sr
    join public.order_items oi on oi.id = sr.order_item_id
    where oi.order_id = p_order_id and sr.status = 'active'
  ) then
    raise exception 'Order already has an active reservation';
  end if;

  -- Product locks are ordered, matching stock locks and the offer trigger in
  -- block 1. Offer/price edits serialize with this price recheck.
  for v_product_id in
    select distinct product_id from public.order_items
    where order_id = p_order_id order by product_id
  loop
    select * into v_product from public.products where id = v_product_id for share;
    if not found then raise exception 'Order item product is missing'; end if;
  end loop;
  for v_product_id in
    select distinct product_id from public.order_items
    where order_id = p_order_id order by product_id
  loop
    select * into v_balance from public.inventory_balances
    where product_id = v_product_id for update;
    if not found then raise exception 'Stock balance is not initialized for product %', v_product_id; end if;
    select sum(quantity) into v_required from public.order_items
    where order_id = p_order_id and product_id = v_product_id;
    if v_balance.stock_balance - v_balance.reserved < v_required then
      raise exception 'Insufficient unreserved stock for product %', v_product_id;
    end if;
  end loop;

  for v_item in
    select * from public.order_items where order_id = p_order_id order by line_no for update
  loop
    v_item_count := v_item_count + 1;
    select * into v_product from public.products where id = v_item.product_id;
    if not v_product.allows_fractional and v_item.quantity <> trunc(v_item.quantity) then
      raise exception 'Product requires whole units';
    end if;
    select cp.regular_price, cp.effective_price, cp.currency
      into v_catalog
    from public.catalog_products cp where cp.id = v_item.product_id;
    if not found or v_catalog.regular_price is null or v_catalog.effective_price is null then
      raise exception 'Product is not priced and published for checkout';
    end if;
    if v_item.sku_snapshot is distinct from v_product.sku
       or v_item.name_snapshot is distinct from v_product.name
       or v_order.currency is distinct from v_catalog.currency
       or v_item.regular_unit_price is distinct from v_catalog.regular_price
       or v_item.final_unit_price is distinct from v_catalog.effective_price
       or v_item.discount_unit is distinct from (v_catalog.regular_price - v_catalog.effective_price)
       or v_item.line_total is distinct from round(v_catalog.effective_price * v_item.quantity, 2) then
      raise exception 'Order item price or snapshot is stale';
    end if;
    v_subtotal := v_subtotal + round(v_catalog.regular_price * v_item.quantity, 2);
    v_merchandise := v_merchandise + v_item.line_total;
  end loop;
  if v_item_count = 0 or v_order.subtotal is distinct from v_subtotal
     or v_order.merchandise_total is distinct from v_merchandise
     or v_order.discount_total is distinct from (v_subtotal - v_merchandise) then
    raise exception 'Order merchandise totals do not reconcile';
  end if;

  for v_product_id in
    select distinct product_id from public.order_items
    where order_id = p_order_id order by product_id
  loop
    select sum(quantity) into v_required from public.order_items
    where order_id = p_order_id and product_id = v_product_id;
    update public.inventory_balances set reserved = reserved + v_required
    where product_id = v_product_id;
  end loop;
  for v_item in
    select * from public.order_items where order_id = p_order_id order by line_no
  loop
    select coalesce(max(attempt_no), 0) + 1 into v_attempt
    from public.stock_reservations where order_item_id = v_item.id;
    insert into public.stock_reservations (
      order_item_id, attempt_no, quantity, reserve_operation_id
    ) values (v_item.id, v_attempt, v_item.quantity, v_operation.id);
  end loop;
  return v_operation.id;
end;
$$;

create function greenbel_private.consolidate_order_core(
  p_order_id uuid, p_event_kind text, p_idempotency_key text, p_evidence_reference text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_operation public.inventory_operations%rowtype;
  v_fingerprint jsonb;
  v_product_id uuid;
  v_quantity numeric(14,3);
  v_item_count integer;
  v_active_count integer;
  v_reservation record;
begin
  if p_order_id is null
     or p_event_kind not in ('online_payment', 'cod_dispatch', 'pickup_handover')
     or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200
     or char_length(btrim(coalesce(p_evidence_reference, ''))) not between 1 and 200 then
    raise exception 'Invalid consolidation request or missing verified event reference';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order does not exist'; end if;
  v_fingerprint := jsonb_build_object('order_id', p_order_id,
    'event_kind', p_event_kind, 'evidence_reference', p_evidence_reference);
  select * into v_operation from public.inventory_operations
  where idempotency_key = p_idempotency_key for update;
  if found then
    if v_operation.kind is distinct from 'consolidate'
       or v_operation.order_id is distinct from p_order_id
       or v_operation.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Inventory idempotency key reused with different input';
    end if;
    if not exists (select 1 from public.stock_reservations where close_operation_id = v_operation.id) then
      raise exception 'Consolidation operation has no matching reservation';
    end if;
    return v_operation.id;
  end if;
  if v_order.stage not in ('confirmed', 'completed') then
    raise exception 'Order is not eligible for stock consolidation';
  end if;
  insert into public.inventory_operations (idempotency_key, kind, order_id, request_fingerprint)
  values (p_idempotency_key, 'consolidate', p_order_id, v_fingerprint)
  on conflict (idempotency_key) do nothing;
  select * into v_operation from public.inventory_operations
  where idempotency_key = p_idempotency_key for update;
  if v_operation.kind is distinct from 'consolidate'
     or v_operation.order_id is distinct from p_order_id
     or v_operation.request_fingerprint is distinct from v_fingerprint then
    raise exception 'Inventory idempotency key reused with different input';
  end if;
  if exists (select 1 from public.stock_reservations where close_operation_id = v_operation.id) then
    return v_operation.id;
  end if;
  select count(*) into v_item_count from public.order_items where order_id = p_order_id;
  select count(*) into v_active_count
  from public.stock_reservations sr
  join public.order_items oi on oi.id = sr.order_item_id
  where oi.order_id = p_order_id and sr.status = 'active';
  if v_item_count = 0 or v_item_count <> v_active_count then
    raise exception 'Order does not have one active reservation per item';
  end if;
  for v_product_id in
    select distinct oi.product_id
    from public.order_items oi where oi.order_id = p_order_id order by oi.product_id
  loop
    perform 1 from public.inventory_balances where product_id = v_product_id for update;
    if not found then raise exception 'Stock balance missing during consolidation'; end if;
  end loop;
  for v_product_id in
    select distinct oi.product_id
    from public.order_items oi where oi.order_id = p_order_id order by oi.product_id
  loop
    select sum(sr.quantity) into v_quantity
    from public.stock_reservations sr join public.order_items oi on oi.id = sr.order_item_id
    where oi.order_id = p_order_id and oi.product_id = v_product_id and sr.status = 'active';
    update public.inventory_balances
    set stock_balance = stock_balance - v_quantity, reserved = reserved - v_quantity
    where product_id = v_product_id and stock_balance >= v_quantity and reserved >= v_quantity;
    if not found then raise exception 'Stock invariant failed during consolidation'; end if;
  end loop;
  for v_reservation in
    select sr.id, sr.quantity, oi.id as order_item_id, oi.product_id
    from public.stock_reservations sr join public.order_items oi on oi.id = sr.order_item_id
    where oi.order_id = p_order_id and sr.status = 'active'
    order by oi.line_no for update of sr
  loop
    update public.stock_reservations
    set status = 'consumed', close_operation_id = v_operation.id, consumed_at = now()
    where id = v_reservation.id;
    insert into public.inventory_movements (
      product_id, kind, quantity_delta, reason, reference, order_item_id, operation_id
    ) values (
      v_reservation.product_id, p_event_kind, -v_reservation.quantity,
      p_event_kind, p_evidence_reference, v_reservation.order_item_id, v_operation.id
    );
  end loop;
  return v_operation.id;
end;
$$;

create function greenbel_private.release_order_core(
  p_order_id uuid, p_idempotency_key text, p_verified_reason text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_operation public.inventory_operations%rowtype;
  v_fingerprint jsonb;
  v_product_id uuid;
  v_quantity numeric(14,3);
  v_item_count integer;
  v_active_count integer;
begin
  if p_order_id is null
     or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 1 and 200
     or char_length(btrim(coalesce(p_verified_reason, ''))) not between 1 and 500 then
    raise exception 'Invalid release request or missing verified reason';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order does not exist'; end if;
  v_fingerprint := jsonb_build_object('order_id', p_order_id, 'verified_reason', p_verified_reason);
  select * into v_operation from public.inventory_operations
  where idempotency_key = p_idempotency_key for update;
  if found then
    if v_operation.kind is distinct from 'release'
       or v_operation.order_id is distinct from p_order_id
       or v_operation.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Inventory idempotency key reused with different input';
    end if;
    if not exists (select 1 from public.stock_reservations where close_operation_id = v_operation.id) then
      raise exception 'Release operation has no matching reservation';
    end if;
    return v_operation.id;
  end if;
  if v_order.stage <> 'cancelled' then
    raise exception 'Only a cancelled order can release its active reservation';
  end if;
  insert into public.inventory_operations (idempotency_key, kind, order_id, request_fingerprint)
  values (p_idempotency_key, 'release', p_order_id, v_fingerprint)
  on conflict (idempotency_key) do nothing;
  select * into v_operation from public.inventory_operations
  where idempotency_key = p_idempotency_key for update;
  if v_operation.kind is distinct from 'release'
     or v_operation.order_id is distinct from p_order_id
     or v_operation.request_fingerprint is distinct from v_fingerprint then
    raise exception 'Inventory idempotency key reused with different input';
  end if;
  if exists (select 1 from public.stock_reservations where close_operation_id = v_operation.id) then
    return v_operation.id;
  end if;
  select count(*) into v_item_count from public.order_items where order_id = p_order_id;
  select count(*) into v_active_count
  from public.stock_reservations sr join public.order_items oi on oi.id = sr.order_item_id
  where oi.order_id = p_order_id and sr.status = 'active';
  if v_item_count = 0 or v_item_count <> v_active_count then
    raise exception 'Order does not have one active reservation per item';
  end if;
  for v_product_id in
    select distinct oi.product_id
    from public.order_items oi where oi.order_id = p_order_id order by oi.product_id
  loop
    perform 1 from public.inventory_balances where product_id = v_product_id for update;
    if not found then raise exception 'Stock balance missing during release'; end if;
  end loop;
  for v_product_id in
    select distinct oi.product_id
    from public.order_items oi where oi.order_id = p_order_id order by oi.product_id
  loop
    select sum(sr.quantity) into v_quantity
    from public.stock_reservations sr join public.order_items oi on oi.id = sr.order_item_id
    where oi.order_id = p_order_id and oi.product_id = v_product_id and sr.status = 'active';
    update public.inventory_balances set reserved = reserved - v_quantity
    where product_id = v_product_id and reserved >= v_quantity;
    if not found then raise exception 'Stock invariant failed during release'; end if;
  end loop;
  update public.stock_reservations sr
  set status = 'released', close_operation_id = v_operation.id, released_at = now()
  from public.order_items oi
  where sr.order_item_id = oi.id and oi.order_id = p_order_id and sr.status = 'active';
  return v_operation.id;
end;
$$;

revoke all on function greenbel_private.reserve_order_core(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.consolidate_order_core(uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.release_order_core(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.reject_immutable_change()
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.guard_order_item_change()
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.guard_order_snapshot_change()
  from public, anon, authenticated, service_role;

comment on function greenbel_private.reserve_order_core(uuid,text) is
  'Owner-only reserve primitive. Disabled in this migration by orders_checkout_gate_pending.';
comment on function greenbel_private.consolidate_order_core(uuid,text,text,text) is
  'Owner-only primitive; a future validated event wrapper must prove payment or dispatch.';
comment on function greenbel_private.release_order_core(uuid,text,text) is
  'Owner-only primitive; a future wrapper must verify payment state before cancellation.';

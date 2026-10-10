-- GreenBel block 4: delivery configuration and test-only payment records.
-- Requires catalog foundation (001) and order/inventory (002).
-- No provider, tariff, payment option, pickup address, or live charge is seeded.
-- Checkout remains blocked by orders_checkout_gate_pending from 002.

do $preflight$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'GreenBel delivery/payment block requires PostgreSQL 15+';
  end if;
  if to_regclass('public.orders') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.inventory_balances') is null
     or to_regclass('public.user_roles') is null
     or to_regnamespace('greenbel_private') is null then
    raise exception 'Apply and verify GreenBel catalog and order/inventory blocks first';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.orders'::regclass
      and c.conname = 'orders_checkout_gate_pending'
  ) then
    raise exception 'Checkout gate is missing; audit order/payment history before block 4';
  end if;
  if to_regclass('public.delivery_services') is not null
     or to_regclass('public.delivery_zones') is not null
     or to_regclass('public.service_zone_rates') is not null
     or to_regclass('public.service_payment_options') is not null
     or to_regclass('public.shipping_proposals') is not null
     or to_regclass('public.shipments') is not null
     or to_regclass('public.payments') is not null
     or to_regclass('public.carrier_settlements') is not null
     or to_regclass('public.settlement_receipts') is not null then
    raise exception 'Delivery/payment objects already exist; audit history and data';
  end if;
end
$preflight$;

create table public.delivery_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,
  carrier_name text,
  active boolean not null default false,
  cod_enabled boolean not null default false,
  cod_limit numeric(14,2),
  cod_terms_reference text,
  commission_percent numeric(6,3),
  commission_min numeric(14,2),
  commission_notes text,
  pickup_details jsonb,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_services_name_check check (char_length(btrim(name)) between 1 and 160),
  constraint delivery_services_kind_check check (kind in ('pickup','own_delivery','external')),
  constraint delivery_services_carrier_check check (
    (kind = 'external' and carrier_name is not null and char_length(btrim(carrier_name)) between 1 and 160)
    or (kind <> 'external' and carrier_name is null)
  ),
  constraint delivery_services_cod_check check (
    (not cod_enabled)
    or (kind = 'external' and cod_limit is not null and cod_limit > 0
      and cod_terms_reference is not null
      and char_length(btrim(cod_terms_reference)) between 1 and 300
      and commission_notes is not null
      and char_length(btrim(commission_notes)) between 1 and 500)
  ),
  constraint delivery_services_cod_fields_check check (
    (cod_limit is null or cod_limit > 0)
    and (cod_terms_reference is null or char_length(btrim(cod_terms_reference)) between 1 and 300)
    and (commission_percent is null or commission_percent >= 0 and commission_percent <= 100)
    and (commission_min is null or commission_min >= 0)
    and (commission_notes is null or char_length(btrim(commission_notes)) between 1 and 500)
  ),
  constraint delivery_services_pickup_check check (
    (kind <> 'pickup' and pickup_details is null)
    or (kind = 'pickup' and (
      pickup_details is null and not active
      or pickup_details is not null
        and jsonb_typeof(pickup_details) = 'object'
        and pickup_details ?& array['address','hours','instructions']
        and pickup_details - array['address','hours','instructions'] = '{}'::jsonb
        and jsonb_typeof(pickup_details->'address') = 'string'
        and jsonb_typeof(pickup_details->'hours') = 'string'
        and jsonb_typeof(pickup_details->'instructions') = 'string'
        and char_length(btrim(pickup_details->>'address')) between 1 and 500
        and char_length(btrim(pickup_details->>'hours')) between 1 and 300
        and char_length(btrim(pickup_details->>'instructions')) between 1 and 1000
    ))
  )
);
create unique index delivery_services_one_active_pickup_uq on public.delivery_services ((kind))
  where kind = 'pickup' and active;
create index delivery_services_active_kind_idx on public.delivery_services (kind,name) where active;
comment on table public.delivery_services is
  'No active services or contract terms are seeded. External COD requires reviewed terms before enablement.';

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  department text not null,
  municipality text not null,
  zone_detail text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_zones_code_check check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
  constraint delivery_zones_name_check check (char_length(btrim(name)) between 1 and 160),
  constraint delivery_zones_department_check check (char_length(btrim(department)) between 1 and 160),
  constraint delivery_zones_municipality_check check (char_length(btrim(municipality)) between 1 and 160),
  constraint delivery_zones_detail_check check (zone_detail is null or char_length(btrim(zone_detail)) between 1 and 160)
);
create index delivery_zones_location_idx on public.delivery_zones (department,municipality) where active;

create table public.service_zone_rates (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.delivery_services(id) on delete restrict,
  zone_id uuid not null references public.delivery_zones(id) on delete restrict,
  pricing_mode text not null,
  shipping_fee numeric(14,2),
  currency char(3) not null default 'GTQ',
  shipping_charge_mode text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_zone_rates_pair_uq unique (service_id,zone_id),
  constraint service_zone_rates_pricing_check check (
    (pricing_mode = 'fixed' and shipping_fee is not null and shipping_fee >= 0)
    or (pricing_mode = 'manual' and shipping_fee is null)
  ),
  constraint service_zone_rates_currency_check check (btrim(currency) = 'GTQ'),
  constraint service_zone_rates_charge_check check (
    shipping_charge_mode in ('with_order','at_destination','customer_choice')
  )
);
create index service_zone_rates_zone_idx on public.service_zone_rates (zone_id,service_id) where active;
comment on table public.service_zone_rates is
  'Manual NULL fee means unknown cost, never free. Pickup has no zone rate.';

create table public.service_payment_options (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.delivery_services(id) on delete restrict,
  method text not null,
  timing text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_payment_options_pair_uq unique (service_id,method,timing),
  constraint service_payment_options_method_check check (
    method in ('online_gateway','cash','terminal','carrier_cod')
  ),
  constraint service_payment_options_timing_check check (
    timing in ('prepaid','on_delivery','on_pickup')
  )
);
create index service_payment_options_active_idx on public.service_payment_options (service_id)
  where active;

-- A proposal is a shipping fee offer, not acceptance of the final order total.
create table public.shipping_proposals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  revision integer not null,
  fee numeric(14,2),
  currency char(3) not null default 'GTQ',
  charge_mode text,
  status text not null default 'draft',
  proposed_by uuid not null references public.profiles(id) on delete restrict,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete restrict,
  terms_snapshot text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_proposals_revision_uq unique (order_id,revision),
  constraint shipping_proposals_revision_check check (revision > 0),
  constraint shipping_proposals_fee_check check (fee is null or fee >= 0),
  constraint shipping_proposals_currency_check check (btrim(currency) = 'GTQ'),
  constraint shipping_proposals_charge_check check (
    charge_mode is null or charge_mode in ('with_order','at_destination')
  ),
  constraint shipping_proposals_status_check check (status in ('draft','offered','accepted','withdrawn')),
  constraint shipping_proposals_complete_check check (
    status not in ('offered','accepted')
    or (fee is not null and charge_mode is not null and char_length(btrim(terms_snapshot)) between 1 and 5000)
  ),
  constraint shipping_proposals_acceptance_check check (
    (status = 'accepted' and accepted_at is not null and accepted_by is not null)
    or (status <> 'accepted' and accepted_at is null and accepted_by is null)
  ),
  constraint shipping_proposals_terms_check check (char_length(terms_snapshot) <= 5000)
);
create unique index shipping_proposals_one_current_uq on public.shipping_proposals (order_id)
  where status in ('offered','accepted');
create index shipping_proposals_order_created_idx on public.shipping_proposals (order_id,created_at desc);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  service_id uuid not null references public.delivery_services(id) on delete restrict,
  zone_id uuid references public.delivery_zones(id) on delete restrict,
  status text not null default 'preparing',
  carrier_snapshot text,
  tracking_number text,
  tracking_url text,
  cod_amount numeric(14,2),
  currency char(3) not null default 'GTQ',
  dispatched_at timestamptz,
  delivered_at timestamptz,
  received_back_at timestamptz,
  updated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipments_status_check check (
    status in ('preparing','ready_for_pickup','dispatched','delivered','returned','cancelled')
  ),
  constraint shipments_tracking_check check (
    (tracking_number is null or char_length(btrim(tracking_number)) between 1 and 160)
    and (tracking_url is null or tracking_url ~ '^https://[^[:space:]]+$')
  ),
  constraint shipments_carrier_check check (
    carrier_snapshot is null or char_length(btrim(carrier_snapshot)) between 1 and 160
  ),
  constraint shipments_cod_check check (cod_amount is null or cod_amount > 0),
  constraint shipments_currency_check check (btrim(currency) = 'GTQ'),
  constraint shipments_dates_check check (
    (status not in ('dispatched','delivered','returned') or dispatched_at is not null or status = 'delivered')
    and (status <> 'delivered' or delivered_at is not null)
    and (status <> 'returned' or received_back_at is not null)
  )
);
create index shipments_status_created_idx on public.shipments (status,created_at desc);
create index shipments_service_idx on public.shipments (service_id);

-- These rows describe test attempts only. No gateway is selected here and a
-- test success is never proof of a real customer charge or inventory effect.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  method text not null,
  provider text,
  provider_payment_id text,
  test_mode boolean not null default true,
  status text not null default 'test_created',
  amount numeric(14,2) not null,
  currency char(3) not null default 'GTQ',
  idempotency_key text not null unique,
  request_fingerprint text not null,
  paid_at timestamptz,
  recorded_by uuid references public.profiles(id) on delete restrict,
  external_reference text,
  test_evidence_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_method_check check (
    method in ('online_gateway','cash','terminal','carrier_cod')
  ),
  constraint payments_test_only_check check (test_mode),
  constraint payments_status_check check (
    status in ('test_created','test_succeeded','test_failed','test_cancelled','test_review_required')
  ),
  constraint payments_amount_check check (amount > 0),
  constraint payments_currency_check check (btrim(currency) = 'GTQ'),
  constraint payments_key_check check (char_length(btrim(idempotency_key)) between 1 and 200),
  constraint payments_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint payments_provider_check check (
    (provider is null and provider_payment_id is null)
    or (provider is not null and char_length(btrim(provider)) between 1 and 100
      and (provider_payment_id is null or char_length(btrim(provider_payment_id)) between 1 and 200))
  ),
  constraint payments_evidence_check check (
    (status = 'test_succeeded' and paid_at is not null
      and test_evidence_reference is not null
      and char_length(btrim(test_evidence_reference)) between 1 and 200)
    or (status <> 'test_succeeded' and paid_at is null)
  ),
  constraint payments_reference_check check (
    (external_reference is null or char_length(btrim(external_reference)) between 1 and 200)
    and (test_evidence_reference is null or char_length(btrim(test_evidence_reference)) between 1 and 200)
  )
);
create unique index payments_provider_reference_uq on public.payments (provider,provider_payment_id)
  where provider_payment_id is not null;
create index payments_order_status_idx on public.payments (order_id,status,created_at desc);

create table public.carrier_settlements (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null unique references public.shipments(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  gross_collected numeric(14,2) not null,
  commission numeric(14,2) not null default 0,
  shipping_deducted numeric(14,2) not null default 0,
  other_documented_deductions numeric(14,2) not null default 0,
  commission_notes text,
  deduction_notes text,
  collection_variance_notes text,
  expected_net numeric(14,2) not null,
  currency char(3) not null default 'GTQ',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carrier_settlements_money_check check (
    gross_collected > 0 and commission >= 0 and shipping_deducted >= 0
    and other_documented_deductions >= 0 and expected_net >= 0
    and expected_net = gross_collected - commission - shipping_deducted - other_documented_deductions
  ),
  constraint carrier_settlements_notes_check check (
    (commission = 0 or commission_notes is not null and char_length(btrim(commission_notes)) between 1 and 500)
    and (other_documented_deductions = 0
      or deduction_notes is not null and char_length(btrim(deduction_notes)) between 1 and 500)
    and (commission_notes is null or char_length(btrim(commission_notes)) between 1 and 500)
    and (deduction_notes is null or char_length(btrim(deduction_notes)) between 1 and 500)
    and (collection_variance_notes is null or char_length(btrim(collection_variance_notes)) between 1 and 500)
  ),
  constraint carrier_settlements_currency_check check (btrim(currency) = 'GTQ'),
  constraint carrier_settlements_status_check check (status in ('pending','partial','settled','disputed'))
);
create index carrier_settlements_status_idx on public.carrier_settlements (status,created_at desc);

create table public.settlement_receipts (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.carrier_settlements(id) on delete restrict,
  amount numeric(14,2) not null,
  received_at timestamptz not null,
  bank_reference text not null,
  evidence_path text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint settlement_receipts_amount_check check (amount > 0),
  constraint settlement_receipts_bank_reference_check check (char_length(btrim(bank_reference)) between 1 and 200),
  constraint settlement_receipts_key_check check (char_length(btrim(idempotency_key)) between 1 and 200),
  constraint settlement_receipts_evidence_check check (
    evidence_path is null or (
      char_length(evidence_path) between 1 and 500
      and evidence_path !~ '(^/|(^|/)\.\.(/|$))'
    )
  )
);
create index settlement_receipts_settlement_idx on public.settlement_receipts (settlement_id,received_at);
comment on column public.settlement_receipts.bank_reference is
  'Not globally unique: one bank deposit may be allocated to more than one settlement.';

create trigger delivery_services_touch_updated_at before update on public.delivery_services
for each row execute function greenbel_private.touch_updated_at();
create trigger delivery_zones_touch_updated_at before update on public.delivery_zones
for each row execute function greenbel_private.touch_updated_at();
create trigger service_zone_rates_touch_updated_at before update on public.service_zone_rates
for each row execute function greenbel_private.touch_updated_at();
create trigger service_payment_options_touch_updated_at before update on public.service_payment_options
for each row execute function greenbel_private.touch_updated_at();
create trigger shipping_proposals_touch_updated_at before update on public.shipping_proposals
for each row execute function greenbel_private.touch_updated_at();
create trigger shipments_touch_updated_at before update on public.shipments
for each row execute function greenbel_private.touch_updated_at();
create trigger payments_touch_updated_at before update on public.payments
for each row execute function greenbel_private.touch_updated_at();
create trigger carrier_settlements_touch_updated_at before update on public.carrier_settlements
for each row execute function greenbel_private.touch_updated_at();

create function greenbel_private.guard_delivery_service()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    raise exception 'Delivery service kind is immutable; create a new service';
  end if;
  if tg_op = 'UPDATE' and old.cod_enabled and not new.cod_enabled
     and exists (
       select 1 from public.service_payment_options o
       where o.service_id = old.id and o.method = 'carrier_cod' and o.active
     ) then
    raise exception 'Disable carrier COD payment option before disabling COD terms';
  end if;
  return new;
end;
$$;
create trigger delivery_services_guard before update on public.delivery_services
for each row execute function greenbel_private.guard_delivery_service();

create function greenbel_private.validate_delivery_rate()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare v_kind text;
begin
  select kind into v_kind from public.delivery_services where id = new.service_id for share;
  if v_kind is null or v_kind = 'pickup' then
    raise exception 'Only delivery services can have zone rates';
  end if;
  return new;
end;
$$;
create trigger service_zone_rates_validate before insert or update on public.service_zone_rates
for each row execute function greenbel_private.validate_delivery_rate();

create function greenbel_private.validate_delivery_payment_option()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare v_service public.delivery_services%rowtype;
begin
  select * into v_service from public.delivery_services where id = new.service_id for share;
  if not found then raise exception 'Delivery service is missing'; end if;
  if not (
    (new.method = 'online_gateway' and new.timing = 'prepaid')
    or (v_service.kind = 'pickup' and new.method in ('cash','terminal') and new.timing = 'on_pickup')
    or (v_service.kind = 'own_delivery' and new.method in ('cash','terminal') and new.timing = 'on_delivery')
    or (v_service.kind = 'external' and new.method = 'carrier_cod' and new.timing = 'on_delivery')
  ) then
    raise exception 'Payment method/timing is not valid for this delivery service';
  end if;
  if new.active and new.method = 'carrier_cod' and not v_service.cod_enabled then
    raise exception 'Carrier COD terms must be verified before activating this option';
  end if;
  return new;
end;
$$;
create trigger service_payment_options_validate before insert or update on public.service_payment_options
for each row execute function greenbel_private.validate_delivery_payment_option();

create function greenbel_private.guard_shipping_proposal()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_latest integer;
begin
  if tg_op = 'INSERT' then
    select * into v_order from public.orders where id = new.order_id for update;
  else
    select * into v_order from public.orders where id = new.order_id;
  end if;
  if not found or v_order.stage <> 'pending_shipping' then
    raise exception 'Shipping proposals require an order pending shipping quote';
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft','offered') or new.accepted_at is not null then
      raise exception 'A new shipping proposal must start draft or offered';
    end if;
    if not exists (
      select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
      where ur.user_id = new.proposed_by and ur.role in ('operator','admin') and pr.active
    ) then raise exception 'Proposal author must be active staff'; end if;
    select coalesce(max(revision),0) into v_latest
    from public.shipping_proposals where order_id = new.order_id;
    if new.revision <> v_latest + 1 then
      raise exception 'Shipping proposal revision must increase by one';
    end if;
  else
    if new.order_id is distinct from old.order_id
       or new.revision is distinct from old.revision
       or new.proposed_by is distinct from old.proposed_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Proposal identity and author are immutable';
    end if;
    if old.status = 'draft' and new.status not in ('draft','offered','withdrawn')
       or old.status = 'offered' and new.status not in ('offered','accepted','withdrawn')
       or old.status in ('accepted','withdrawn') then
      raise exception 'Invalid or terminal shipping proposal transition';
    end if;
    if old.status <> 'draft' and (
      new.fee is distinct from old.fee
      or new.currency is distinct from old.currency
      or new.charge_mode is distinct from old.charge_mode
      or new.terms_snapshot is distinct from old.terms_snapshot
    ) then
      raise exception 'Offered shipping terms are immutable';
    end if;
  end if;
  if new.status = 'accepted' and new.accepted_by is distinct from v_order.customer_id then
    raise exception 'Only the order customer may accept this shipping proposal';
  end if;
  return new;
end;
$$;
create trigger shipping_proposals_guard before insert or update on public.shipping_proposals
for each row execute function greenbel_private.guard_shipping_proposal();

create function public.accept_shipping_proposal(p_proposal_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order_id uuid;
  v_proposal public.shipping_proposals%rowtype;
  v_order public.orders%rowtype;
begin
  if v_actor is null or p_proposal_id is null then
    raise exception 'Authenticated customer and proposal required' using errcode = '42501';
  end if;
  select order_id into v_order_id from public.shipping_proposals
  where id = p_proposal_id;
  if not found then raise exception 'Shipping proposal does not exist'; end if;
  select * into v_order from public.orders where id = v_order_id for update;
  select * into v_proposal from public.shipping_proposals
  where id = p_proposal_id for update;
  if v_proposal.order_id is distinct from v_order_id then
    raise exception 'Shipping proposal changed during acceptance';
  end if;
  if v_order.customer_id <> v_actor or v_order.stage <> 'pending_shipping' then
    raise exception 'Customer does not own a pending shipping order' using errcode = '42501';
  end if;
  if v_proposal.status = 'accepted' and v_proposal.accepted_by = v_actor then
    return v_proposal.id;
  end if;
  if v_proposal.status <> 'offered' then
    raise exception 'Only a current offered proposal can be accepted';
  end if;
  update public.shipping_proposals
  set status = 'accepted', accepted_by = v_actor, accepted_at = now()
  where id = p_proposal_id;
  return p_proposal_id;
end;
$$;
revoke all on function public.accept_shipping_proposal(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.accept_shipping_proposal(uuid) to authenticated;
comment on function public.accept_shipping_proposal(uuid) is
  'Acknowledges only the shipping proposal; does not accept a final total, confirm an order, reserve stock, or charge.';

create function greenbel_private.guard_shipment()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_service public.delivery_services%rowtype;
begin
  select * into v_order from public.orders where id = new.order_id for share;
  select * into v_service from public.delivery_services where id = new.service_id for share;
  if not found or v_order.stage not in ('confirmed','completed') then
    raise exception 'Shipment requires a confirmed order and delivery service';
  end if;
  if v_service.kind = 'pickup' then
    if new.zone_id is not null or new.cod_amount is not null
       or new.status in ('dispatched','returned') or new.dispatched_at is not null
       or new.carrier_snapshot is not null then
      raise exception 'Pickup cannot have carrier dispatch, zone, or COD';
    end if;
  else
    if new.zone_id is null or new.status = 'ready_for_pickup' then
      raise exception 'Delivery requires a zone and cannot use pickup status';
    end if;
    if v_service.kind = 'external' and new.carrier_snapshot is distinct from v_service.carrier_name then
      raise exception 'External shipment must snapshot the configured carrier';
    end if;
    if v_service.kind = 'own_delivery' and new.carrier_snapshot is not null then
      raise exception 'Own delivery must not imply an external carrier';
    end if;
  end if;
  if new.cod_amount is not null
     and (v_service.kind <> 'external' or not v_service.cod_enabled
       or new.cod_amount > v_service.cod_limit) then
    raise exception 'Carrier COD is not approved for this amount';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'preparing' then raise exception 'Shipment must start preparing'; end if;
  else
    if new.order_id is distinct from old.order_id
       or new.service_id is distinct from old.service_id
       or new.zone_id is distinct from old.zone_id
       or new.cod_amount is distinct from old.cod_amount
       or new.currency is distinct from old.currency
       or new.carrier_snapshot is distinct from old.carrier_snapshot then
      raise exception 'Shipment destination and financial instructions are immutable';
    end if;
    if old.status = 'preparing' and new.status not in ('preparing','ready_for_pickup','dispatched','cancelled')
       or old.status = 'ready_for_pickup' and new.status not in ('ready_for_pickup','delivered','cancelled')
       or old.status = 'dispatched' and new.status not in ('dispatched','delivered','returned')
       or old.status = 'delivered' and new.status not in ('delivered','returned')
       or old.status in ('returned','cancelled') and new.status <> old.status then
      raise exception 'Invalid shipment transition';
    end if;
    if old.status in ('returned','cancelled')
       and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'Terminal shipment is immutable';
    end if;
  end if;
  if v_service.kind = 'pickup' and new.status = 'delivered' and new.delivered_at is null then
    raise exception 'Pickup handover needs a delivered timestamp';
  end if;
  return new;
end;
$$;
create trigger shipments_guard before insert or update on public.shipments
for each row execute function greenbel_private.guard_shipment();

create function greenbel_private.guard_test_payment()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare v_stage text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'test_created' or new.paid_at is not null then
      raise exception 'Test payment must begin as test_created';
    end if;
  else
    if new.order_id is distinct from old.order_id
       or new.method is distinct from old.method
       or new.amount is distinct from old.amount
       or new.currency is distinct from old.currency
       or new.idempotency_key is distinct from old.idempotency_key
       or new.request_fingerprint is distinct from old.request_fingerprint
       or new.test_mode is distinct from old.test_mode then
      raise exception 'Payment identity and amount are immutable';
    end if;
    if old.status <> 'test_created' and new.status <> old.status then
      raise exception 'Terminal test payment cannot change state';
    end if;
    if old.status <> 'test_created'
       and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'Terminal test payment is immutable';
    end if;
  end if;
  if new.status = 'test_succeeded' then
    select stage into v_stage from public.orders where id = new.order_id for share;
    if v_stage not in ('confirmed','completed') then
      raise exception 'A test success requires a confirmed order';
    end if;
  end if;
  return new;
end;
$$;
create trigger payments_guard before insert or update on public.payments
for each row execute function greenbel_private.guard_test_payment();

create function greenbel_private.guard_carrier_settlement()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_shipment public.shipments%rowtype;
  v_service public.delivery_services%rowtype;
  v_payment_order uuid;
  v_received numeric(14,2);
begin
  select * into v_shipment from public.shipments where id = new.shipment_id for share;
  if not found then raise exception 'Shipment does not exist'; end if;
  select * into v_service from public.delivery_services where id = v_shipment.service_id;
  if v_shipment.status <> 'delivered' or v_service.kind <> 'external'
     or v_shipment.cod_amount is null then
    raise exception 'Carrier settlement requires delivered external COD shipment';
  end if;
  if new.gross_collected is distinct from v_shipment.cod_amount
     and char_length(btrim(coalesce(new.collection_variance_notes,''))) not between 1 and 500 then
    raise exception 'Document the difference from instructed carrier COD amount';
  end if;
  if new.payment_id is not null then
    select order_id into v_payment_order from public.payments where id = new.payment_id;
    if v_payment_order is distinct from v_shipment.order_id then
      raise exception 'Settlement payment belongs to another order';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.shipment_id is distinct from old.shipment_id
       or new.payment_id is distinct from old.payment_id
       or new.gross_collected is distinct from old.gross_collected
       or new.commission is distinct from old.commission
       or new.shipping_deducted is distinct from old.shipping_deducted
       or new.other_documented_deductions is distinct from old.other_documented_deductions
       or new.expected_net is distinct from old.expected_net
       or new.currency is distinct from old.currency then
      raise exception 'Settlement accounting amounts are immutable';
    end if;
    if old.status = 'settled' and new.status <> 'settled' then
      raise exception 'Settled carrier statement is terminal';
    end if;
  end if;
  select coalesce(sum(amount),0) into v_received
  from public.settlement_receipts where settlement_id = new.id;
  if new.status = 'settled' and v_received <> new.expected_net
     or new.status = 'partial' and (v_received <= 0 or v_received >= new.expected_net)
     or new.status = 'pending' and v_received <> 0 then
    raise exception 'Settlement status does not match received amount';
  end if;
  return new;
end;
$$;
create trigger carrier_settlements_guard before insert or update on public.carrier_settlements
for each row execute function greenbel_private.guard_carrier_settlement();

create function greenbel_private.guard_settlement_receipt()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_settlement public.carrier_settlements%rowtype;
  v_received numeric(14,2);
begin
  if not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = new.recorded_by and ur.role = 'admin' and pr.active
  ) then
    raise exception 'Active admin must record settlement receipt';
  end if;
  select * into v_settlement from public.carrier_settlements
  where id = new.settlement_id for update;
  if not found then raise exception 'Carrier settlement does not exist'; end if;
  select coalesce(sum(amount),0) into v_received from public.settlement_receipts
  where settlement_id = new.settlement_id;
  if v_received + new.amount > v_settlement.expected_net then
    raise exception 'Carrier receipts exceed expected net';
  end if;
  return new;
end;
$$;
create trigger settlement_receipts_guard before insert on public.settlement_receipts
for each row execute function greenbel_private.guard_settlement_receipt();
create trigger settlement_receipts_immutable before update or delete on public.settlement_receipts
for each row execute function greenbel_private.reject_immutable_change();

create function greenbel_private.sync_carrier_settlement_status()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_expected numeric(14,2);
  v_received numeric(14,2);
begin
  select expected_net into v_expected from public.carrier_settlements
  where id = new.settlement_id for update;
  select coalesce(sum(amount),0) into v_received from public.settlement_receipts
  where settlement_id = new.settlement_id;
  update public.carrier_settlements
  set status = case
    when status = 'disputed' then 'disputed'
    when v_received = v_expected then 'settled'
    when v_received > 0 then 'partial'
    else 'pending'
  end
  where id = new.settlement_id;
  return new;
end;
$$;
create trigger settlement_receipts_sync after insert on public.settlement_receipts
for each row execute function greenbel_private.sync_carrier_settlement_status();

alter table public.delivery_services enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.service_zone_rates enable row level security;
alter table public.service_payment_options enable row level security;
alter table public.shipping_proposals enable row level security;
alter table public.shipments enable row level security;
alter table public.payments enable row level security;
alter table public.carrier_settlements enable row level security;
alter table public.settlement_receipts enable row level security;

revoke all on table public.delivery_services, public.delivery_zones,
  public.service_zone_rates, public.service_payment_options,
  public.shipping_proposals, public.shipments, public.payments,
  public.carrier_settlements, public.settlement_receipts
from public, anon, authenticated, service_role;
grant select, insert, update on public.delivery_services, public.delivery_zones,
  public.service_zone_rates, public.service_payment_options,
  public.shipping_proposals, public.shipments, public.payments,
  public.carrier_settlements to service_role;
grant select, insert on public.settlement_receipts to service_role;

-- Public configuration exposes only active choices, without COD contract
-- commission, collection limits, internal author IDs, or draft rows.
grant select (id,name,kind,carrier_name,active,pickup_details)
  on public.delivery_services to anon, authenticated;
create policy delivery_services_active_read on public.delivery_services
  for select to anon, authenticated using (active);
grant select (id,code,name,department,municipality,zone_detail,active)
  on public.delivery_zones to anon, authenticated;
create policy delivery_zones_active_read on public.delivery_zones
  for select to anon, authenticated using (active);
grant select (id,service_id,zone_id,pricing_mode,shipping_fee,currency,shipping_charge_mode,active)
  on public.service_zone_rates to anon, authenticated;
create policy service_zone_rates_active_read on public.service_zone_rates
  for select to anon, authenticated
  using (
    active
    and exists (select 1 from public.delivery_services s where s.id = service_id)
    and exists (select 1 from public.delivery_zones z where z.id = zone_id)
  );
grant select (id,service_id,method,timing,active)
  on public.service_payment_options to anon, authenticated;
create policy service_payment_options_active_read on public.service_payment_options
  for select to anon, authenticated
  using (active and exists (select 1 from public.delivery_services s where s.id = service_id));

grant select (id,order_id,revision,fee,currency,charge_mode,status,
  accepted_at,terms_snapshot,created_at)
  on public.shipping_proposals to authenticated;
create policy shipping_proposals_customer_or_staff_read on public.shipping_proposals
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

grant select (id,order_id,service_id,zone_id,status,carrier_snapshot,
  tracking_number,tracking_url,cod_amount,currency,dispatched_at,delivered_at,
  received_back_at,created_at,updated_at)
  on public.shipments to authenticated;
create policy shipments_customer_or_staff_read on public.shipments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

grant select (id,order_id,method,test_mode,status,amount,currency,paid_at,created_at)
  on public.payments to authenticated;
create policy payments_customer_or_staff_read on public.payments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

grant select on public.carrier_settlements, public.settlement_receipts to authenticated;
create policy carrier_settlements_admin_read on public.carrier_settlements
  for select to authenticated
  using (exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = (select auth.uid()) and ur.role = 'admin' and pr.active
  ));
create policy settlement_receipts_admin_read on public.settlement_receipts
  for select to authenticated
  using (exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = (select auth.uid()) and ur.role = 'admin' and pr.active
  ));

revoke all on function greenbel_private.guard_delivery_service()
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.validate_delivery_rate()
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.validate_delivery_payment_option()
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.guard_shipping_proposal()
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.guard_shipment()
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.guard_test_payment()
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.guard_carrier_settlement()
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.guard_settlement_receipt()
  from public, anon, authenticated, service_role;
revoke all on function greenbel_private.sync_carrier_settlement_status()
  from public, anon, authenticated, service_role;

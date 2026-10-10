-- GreenBel checkout transaction. DEV only after target/history review.
-- No commercial fixture, payment success, email, or automatic reservation release.
-- Keep this migration in one transaction. Existing drafts and data are preserved.

do $preflight$
begin
  if current_setting('server_version_num')::integer < 150000
     or to_regclass('public.orders') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.stock_reservations') is null
     or to_regclass('public.delivery_services') is null
     or to_regclass('public.service_payment_options') is null
     or to_regprocedure('greenbel_private.reserve_order_core(uuid,text)') is null then
    raise exception 'GreenBel checkout requires the verified 001-008 schema on PostgreSQL 15+';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_checkout_gate_pending'
  ) then
    raise exception 'Checkout gate is absent; audit orders and history before migration';
  end if;
  if exists (select 1 from public.orders where stage in ('confirmed','completed')) then
    raise exception 'Unexpected confirmed orders exist before checkout migration';
  end if;
  if to_regclass('public.checkout_settings') is not null
     or to_regclass('public.checkout_review_requests') is not null
     or to_regprocedure('public.review_checkout(jsonb,uuid,uuid)') is not null
     or to_regprocedure('public.confirm_checkout(uuid,jsonb,integer,numeric,uuid)') is not null then
    raise exception 'Checkout migration objects already exist; audit without overwrite';
  end if;
end
$preflight$;

-- One editable policy row. NULL durations intentionally close their checkout path.
create table public.checkout_settings (
  id boolean primary key default true check (id),
  online_reservation_minutes integer,
  offline_review_hours integer,
  simulated_gateway_enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint checkout_settings_online_duration_check check (
    online_reservation_minutes is null or online_reservation_minutes between 1 and 1440
  ),
  constraint checkout_settings_offline_duration_check check (
    offline_review_hours is null or offline_review_hours between 1 and 720
  )
);
create trigger checkout_settings_touch_updated_at before update on public.checkout_settings
for each row execute function greenbel_private.touch_updated_at();
alter table public.checkout_settings enable row level security;
revoke all on public.checkout_settings from public, anon, authenticated, service_role;
grant select, insert, update on public.checkout_settings to service_role;
comment on table public.checkout_settings is
  'Admin-editable policy. DEV fixture may set 15 online minutes and 24 offline hours; no default policy or auto release.';

alter table public.orders
  add column checkout_intent jsonb,
  add column review_terms jsonb,
  add column confirmation_key uuid,
  add column confirmation_fingerprint jsonb;
create unique index orders_confirmation_key_uq on public.orders (confirmation_key)
  where confirmation_key is not null;
alter table public.orders add constraint orders_checkout_evidence_check check (
  (checkout_intent is null or jsonb_typeof(checkout_intent) = 'object')
  and (review_terms is null or jsonb_typeof(review_terms) = 'object')
  and (confirmation_fingerprint is null or jsonb_typeof(confirmation_fingerprint) = 'object')
  and (stage not in ('confirmed','completed') or (
    checkout_intent is not null and review_terms is not null
    and confirmation_key is not null and confirmation_fingerprint is not null
  ))
);

-- Request rows make review POST retries safe even while an order is being edited.
create table public.checkout_review_requests (
  request_key uuid primary key,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  request_fingerprint jsonb not null,
  order_id uuid references public.orders(id) on delete restrict,
  response jsonb,
  created_at timestamptz not null default now(),
  constraint checkout_review_request_fingerprint_check check (jsonb_typeof(request_fingerprint) = 'object'),
  constraint checkout_review_request_response_check check (
    (order_id is null and response is null)
    or (order_id is not null and response is not null and jsonb_typeof(response) = 'object')
  )
);
create index checkout_review_requests_order_idx on public.checkout_review_requests (order_id);
alter table public.checkout_review_requests enable row level security;
revoke all on public.checkout_review_requests from public, anon, authenticated, service_role;
grant select on public.checkout_review_requests to service_role;

-- Strict database validation. HTTP/Zod checks are useful but are not the authority.
create function greenbel_private.validate_checkout_intent(p_intent jsonb)
returns void language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_line jsonb;
  v_billing jsonb;
  v_delivery jsonb;
  v_seen uuid[] := array[]::uuid[];
  v_id uuid;
begin
  if p_intent is null or jsonb_typeof(p_intent) <> 'object'
     or not (p_intent ?& array['lines','billing','delivery','paymentOptionId'])
     or p_intent - array['lines','billing','delivery','paymentOptionId'] <> '{}'::jsonb
     or jsonb_typeof(p_intent->'lines') <> 'array'
     or jsonb_array_length(p_intent->'lines') not between 1 and 50
     or jsonb_typeof(p_intent->'billing') <> 'object'
     or jsonb_typeof(p_intent->'delivery') <> 'object'
     or coalesce(p_intent->>'paymentOptionId','') !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid checkout selection' using errcode='22023';
  end if;
  for v_line in select value from jsonb_array_elements(p_intent->'lines') loop
    if jsonb_typeof(v_line) <> 'object'
       or not (v_line ?& array['productId','quantity'])
       or v_line - array['productId','quantity'] <> '{}'::jsonb
       or coalesce(v_line->>'productId','') !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_line->'quantity') <> 'number'
       or (v_line->>'quantity')::numeric <> trunc((v_line->>'quantity')::numeric)
       or (v_line->>'quantity')::numeric not between 1 and 999 then
      raise exception 'Invalid checkout line' using errcode='22023';
    end if;
    v_id := (v_line->>'productId')::uuid;
    if v_id = any(v_seen) then
      raise exception 'Repeated checkout product' using errcode='22023';
    end if;
    v_seen := array_append(v_seen,v_id);
  end loop;
  v_billing := p_intent->'billing';
  if v_billing->>'kind' = 'cf' then
    if not (v_billing ?& array['kind','firstName','lastName','phone'])
       or v_billing - array['kind','firstName','lastName','phone'] <> '{}'::jsonb
       or jsonb_typeof(v_billing->'firstName') <> 'string'
       or jsonb_typeof(v_billing->'lastName') <> 'string'
       or char_length(btrim(v_billing->>'firstName')) not between 1 and 160
       or char_length(btrim(v_billing->>'lastName')) not between 1 and 160 then
      raise exception 'Invalid CF billing data' using errcode='22023';
    end if;
  elsif v_billing->>'kind' = 'nit' then
    if not (v_billing ?& array['kind','nit','nitOwnerName','fullName','phone'])
       or v_billing - array['kind','nit','nitOwnerName','fullName','phone','email'] <> '{}'::jsonb
       or jsonb_typeof(v_billing->'nit') <> 'string'
       or jsonb_typeof(v_billing->'nitOwnerName') <> 'string'
       or jsonb_typeof(v_billing->'fullName') <> 'string'
       or char_length(btrim(v_billing->>'nit')) not between 1 and 40
       or char_length(btrim(v_billing->>'nitOwnerName')) not between 1 and 160
       or char_length(btrim(v_billing->>'fullName')) not between 1 and 240
       or (v_billing ? 'email' and (
         jsonb_typeof(v_billing->'email') <> 'string'
         or char_length(btrim(v_billing->>'email')) not between 1 and 254
         or (v_billing->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       )) then
      raise exception 'Invalid NIT billing data' using errcode='22023';
    end if;
  else
    raise exception 'Invalid billing kind' using errcode='22023';
  end if;
  if jsonb_typeof(v_billing->'phone') <> 'string'
     or char_length(btrim(v_billing->>'phone')) not between 1 and 40
     or (v_billing->>'phone') !~ '^[+0-9 ()-]+$'
     or char_length(regexp_replace(v_billing->>'phone','[^0-9]','','g')) not between 8 and 15 then
    raise exception 'Invalid billing phone' using errcode='22023';
  end if;
  v_delivery := p_intent->'delivery';
  if v_delivery->>'kind' = 'pickup' then
    if not (v_delivery ?& array['kind','serviceId'])
       or v_delivery - array['kind','serviceId'] <> '{}'::jsonb then
      raise exception 'Invalid pickup selection' using errcode='22023';
    end if;
  elsif v_delivery->>'kind' = 'shipping' then
    if not (v_delivery ?& array['kind','serviceId','zoneId','chargeMode',
                                'recipientName','recipientPhone','addressLine'])
       or v_delivery - array['kind','serviceId','zoneId','chargeMode',
                             'recipientName','recipientPhone','addressLine'] <> '{}'::jsonb
       or coalesce(v_delivery->>'zoneId','') !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or v_delivery->>'chargeMode' not in ('with_order','at_destination')
       or jsonb_typeof(v_delivery->'recipientName') <> 'string'
       or char_length(btrim(v_delivery->>'recipientName')) not between 1 and 240
       or jsonb_typeof(v_delivery->'recipientPhone') <> 'string'
       or char_length(btrim(v_delivery->>'recipientPhone')) not between 1 and 40
       or (v_delivery->>'recipientPhone') !~ '^[+0-9 ()-]+$'
       or char_length(regexp_replace(v_delivery->>'recipientPhone','[^0-9]','','g')) not between 8 and 15
       or jsonb_typeof(v_delivery->'addressLine') <> 'string'
       or char_length(btrim(v_delivery->>'addressLine')) not between 5 and 500 then
      raise exception 'Invalid shipping selection' using errcode='22023';
    end if;
  else
    raise exception 'Invalid delivery kind' using errcode='22023';
  end if;
  if coalesce(v_delivery->>'serviceId','') !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid service ID' using errcode='22023';
  end if;
end;
$$;
revoke all on function greenbel_private.validate_checkout_intent(jsonb)
  from public,anon,authenticated,service_role;

-- Locks configuration first, then SKUs and their balances in ascending UUID order.
-- A single clock time is captured after product locks for offer evaluation.
-- This returns terms without transient stock counts or timestamps, so equality
-- means the customer is accepting the same commercial terms on confirmation.
create function greenbel_private.checkout_terms(p_intent jsonb, p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_service public.delivery_services%rowtype;
  v_zone public.delivery_zones%rowtype;
  v_rate public.service_zone_rates%rowtype;
  v_option public.service_payment_options%rowtype;
  v_settings public.checkout_settings%rowtype;
  v_proposal public.shipping_proposals%rowtype;
  v_product public.products%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_offer public.product_offers%rowtype;
  v_product_id uuid;
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_delivery jsonb := p_intent->'delivery';
  v_delivery_terms jsonb;
  v_rate_terms jsonb := 'null'::jsonb;
  v_proposal_terms jsonb := 'null'::jsonb;
  v_offer_terms jsonb;
  v_payment_terms jsonb;
  v_policy_terms jsonb;
  v_shipping_fee numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_merchandise numeric(14,2) := 0;
  v_greenbel numeric(14,2);
  v_carrier_shipping numeric(14,2);
  v_customer_total numeric(14,2);
  v_regular numeric(14,2);
  v_final numeric(14,2);
  v_quantity integer;
  v_line_no integer := 0;
  v_charge_mode text;
  v_shipping_mode text;
  v_pending boolean := false;
  v_price_at timestamptz;
begin
  perform greenbel_private.validate_checkout_intent(p_intent);
  select * into v_service from public.delivery_services
  where id = (v_delivery->>'serviceId')::uuid for share;
  if not found or not v_service.active
     or (v_delivery->>'kind' = 'pickup' and v_service.kind <> 'pickup')
     or (v_delivery->>'kind' = 'shipping' and v_service.kind = 'pickup') then
    raise exception 'Delivery service is unavailable' using errcode='P0002';
  end if;
  if v_service.kind = 'pickup' then
    if v_service.pickup_details is null then
      raise exception 'Pickup details are incomplete' using errcode='P0002';
    end if;
    v_shipping_fee := 0;
    v_shipping_mode := 'pickup';
    v_charge_mode := 'pickup';
    v_delivery_terms := jsonb_build_object(
      'serviceId',v_service.id,'kind',v_service.kind,'name',v_service.name,
      'pickupDetails',v_service.pickup_details,'shippingCollector','none'
    );
  else
    select * into v_zone from public.delivery_zones
    where id = (v_delivery->>'zoneId')::uuid for share;
    if not found or not v_zone.active then
      raise exception 'Delivery zone is unavailable' using errcode='P0002';
    end if;
    select * into v_rate from public.service_zone_rates
    where service_id = v_service.id and zone_id = v_zone.id for share;
    if not found or not v_rate.active then
      raise exception 'Delivery coverage is unavailable' using errcode='P0002';
    end if;
    if v_rate.shipping_charge_mode <> 'customer_choice'
       and v_rate.shipping_charge_mode <> v_delivery->>'chargeMode' then
      raise exception 'Shipping charge choice is unavailable' using errcode='P0002';
    end if;
    v_charge_mode := v_delivery->>'chargeMode';
    if p_order_id is not null then
      select * into v_proposal from public.shipping_proposals
      where order_id = p_order_id and status = 'accepted' for share;
    end if;
    if v_proposal.id is not null then
      if v_proposal.charge_mode is distinct from v_charge_mode
         or v_proposal.fee is null then
        raise exception 'Accepted shipping proposal does not match the selection'
          using errcode='P0001';
      end if;
      -- An accepted proposal fixes transport even if a later base rate changes.
      v_shipping_fee := v_proposal.fee;
      v_proposal_terms := jsonb_build_object(
        'id',v_proposal.id,'revision',v_proposal.revision,
        'fee',v_proposal.fee::text,'chargeMode',v_proposal.charge_mode,
        'terms',v_proposal.terms_snapshot,'acceptedAt',v_proposal.accepted_at
      );
    elsif v_rate.pricing_mode = 'fixed' then
      v_shipping_fee := v_rate.shipping_fee;
    else
      v_pending := true;
    end if;
    v_shipping_mode := case
      when v_service.kind = 'external' and v_charge_mode = 'at_destination'
        then 'carrier_collects' else 'included' end;
    v_rate_terms := jsonb_build_object(
      'id',v_rate.id,'pricingMode',v_rate.pricing_mode,
      'configuredFee',case when v_rate.shipping_fee is null then null else v_rate.shipping_fee::text end,
      'configuredChargeMode',v_rate.shipping_charge_mode
    );
    v_delivery_terms := jsonb_build_object(
      'serviceId',v_service.id,'kind',v_service.kind,'name',v_service.name,
      'carrierName',v_service.carrier_name,'codEnabled',v_service.cod_enabled,
      'codLimit',case when v_service.cod_limit is null then null else v_service.cod_limit::text end,
      'codTermsReference',v_service.cod_terms_reference,
      'commissionPercent',case when v_service.commission_percent is null then null else v_service.commission_percent::text end,
      'commissionMin',case when v_service.commission_min is null then null else v_service.commission_min::text end,
      'commissionNotes',v_service.commission_notes,
      'zoneId',v_zone.id,'zoneCode',v_zone.code,'department',v_zone.department,
      'municipality',v_zone.municipality,'zoneDetail',v_zone.zone_detail,
      'recipientName',v_delivery->>'recipientName',
      'recipientPhone',v_delivery->>'recipientPhone',
      'addressLine',v_delivery->>'addressLine',
      'chargeMode',v_charge_mode,
      'shippingCollector',case when v_shipping_mode='carrier_collects'
        then 'carrier' else 'greenbel' end
    );
  end if;
  select * into v_option from public.service_payment_options
  where id = (p_intent->>'paymentOptionId')::uuid for share;
  if not found or not v_option.active or v_option.service_id <> v_service.id
     or not (
       (v_option.method = 'online_gateway' and v_option.timing = 'prepaid')
       or (v_service.kind = 'pickup' and v_option.method in ('cash','terminal') and v_option.timing = 'on_pickup')
       or (v_service.kind = 'own_delivery' and v_option.method in ('cash','terminal') and v_option.timing = 'on_delivery')
       or (v_service.kind = 'external' and v_option.method = 'carrier_cod' and v_option.timing = 'on_delivery' and v_service.cod_enabled)
     ) then
    raise exception 'Payment option is unavailable for delivery' using errcode='P0002';
  end if;
  if v_service.kind='own_delivery' and v_charge_mode='at_destination'
     and v_option.method='online_gateway' then
    raise exception 'Split online and destination collection is not configured'
      using errcode='P0002';
  end if;
  select * into v_settings from public.checkout_settings where id for share;
  if not found then
    raise exception 'Checkout policy is not configured' using errcode='P0002';
  end if;
  if v_option.method = 'online_gateway' then
    if not v_settings.simulated_gateway_enabled or v_settings.online_reservation_minutes is null then
      raise exception 'Test gateway policy is unavailable' using errcode='P0002';
    end if;
  elsif v_settings.offline_review_hours is null then
    raise exception 'Offline reservation review policy is unavailable' using errcode='P0002';
  end if;
  v_payment_terms := jsonb_build_object(
    'optionId',v_option.id,'method',v_option.method,'timing',v_option.timing,
    'testMode',true,'paymentState','not_paid'
  );
  v_policy_terms := jsonb_build_object(
    'onlineReservationMinutes',v_settings.online_reservation_minutes,
    'offlineReviewHours',v_settings.offline_review_hours,
    'simulatedGatewayEnabled',v_settings.simulated_gateway_enabled
  );

  for v_product_id in
    select (value->>'productId')::uuid
    from jsonb_array_elements(p_intent->'lines')
    order by (value->>'productId')::uuid
  loop
    select * into v_product from public.products where id=v_product_id for share;
    if not found or v_product.publication_status <> 'published'
       or v_product.regular_price is null or v_product.currency <> 'GTQ' then
      raise exception 'A product is unavailable or has no price' using errcode='P0001';
    end if;
    perform 1 from public.categories
    where id=v_product.category_id and active for share;
    if not found then
      raise exception 'Product category is inactive' using errcode='P0001';
    end if;
    if v_product.brand_id is not null then
      perform 1 from public.brands where id=v_product.brand_id and active for share;
      if not found then
        raise exception 'Product brand is inactive' using errcode='P0001';
      end if;
    end if;
  end loop;
  for v_product_id in
    select (value->>'productId')::uuid
    from jsonb_array_elements(p_intent->'lines')
    order by (value->>'productId')::uuid
  loop
    select * into v_balance from public.inventory_balances
    where product_id=v_product_id for update;
    if not found then
      raise exception 'Stock balance is not initialized' using errcode='P0001';
    end if;
    select (value->>'quantity')::integer into v_quantity
    from jsonb_array_elements(p_intent->'lines')
    where (value->>'productId')::uuid=v_product_id;
    if v_balance.stock_balance-v_balance.reserved < v_quantity then
      raise exception 'Insufficient unreserved stock' using errcode='P0001';
    end if;
  end loop;

  -- This instant follows product AND balance locks. An inventory wait may cross
  -- an offer boundary; transaction-start now() would then be stale.
  v_price_at := clock_timestamp();

  for v_line in select value from jsonb_array_elements(p_intent->'lines') loop
    v_line_no := v_line_no + 1;
    v_product_id := (v_line->>'productId')::uuid;
    v_quantity := (v_line->>'quantity')::integer;
    select * into v_product from public.products where id=v_product_id;
    v_regular := v_product.regular_price;
    select * into v_offer from public.product_offers
    where product_id=v_product_id and enabled
      and starts_at <= v_price_at and ends_at > v_price_at
    order by starts_at desc,id limit 1 for share;
    v_final := case
      when v_offer.kind='fixed_price' then v_offer.value
      when v_offer.kind='percentage' then round(v_regular*(100-v_offer.value)/100,2)
      else v_regular end;
    if v_final is null or v_final <= 0 or v_final > v_regular then
      raise exception 'Product offer is invalid' using errcode='P0001';
    end if;
    v_offer_terms := case when v_offer.id is null then '{}'::jsonb else jsonb_build_object(
      'id',v_offer.id,'kind',v_offer.kind,'value',v_offer.value::text,
      'startsAt',v_offer.starts_at,'endsAt',v_offer.ends_at
    ) end;
    v_subtotal := v_subtotal + round(v_regular*v_quantity,2);
    v_merchandise := v_merchandise + round(v_final*v_quantity,2);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'lineNo',v_line_no,'productId',v_product_id,'sku',v_product.sku,
      'name',v_product.name,'quantity',v_quantity,
      'categoryId',v_product.category_id,'brandId',v_product.brand_id,
      'shippingWeightKg',case when v_product.shipping_weight_kg is null
        then null else v_product.shipping_weight_kg::text end,
      'shippingDimensions',v_product.shipping_dimensions,
      'regularUnitPrice',v_regular::text,
      'discountUnit',(v_regular-v_final)::numeric(14,2)::text,
      'finalUnitPrice',v_final::text,
      'lineTotal',round(v_final*v_quantity,2)::numeric(14,2)::text,
      'offer',v_offer_terms,
      'warranty',jsonb_build_object('months',v_product.warranty_months,
                                    'terms',v_product.warranty_terms)
    ));
  end loop;
  if v_pending then
    return jsonb_build_object(
      'lines',v_lines,'delivery',v_delivery_terms,'rate',v_rate_terms,
      'proposal',v_proposal_terms,'payment',v_payment_terms,'policy',v_policy_terms,
      'money',jsonb_build_object(
        'currency','GTQ','subtotal',v_subtotal::text,
        'discountTotal',(v_subtotal-v_merchandise)::numeric(14,2)::text,
        'merchandiseTotal',v_merchandise::text,
        'shippingFee',null,'shippingChargeMode',v_shipping_mode,
        'amountDueGreenbel',null,'amountDueCarrierShipping',null,'total',null
      )
    );
  end if;
  v_carrier_shipping := case when v_shipping_mode='carrier_collects' then v_shipping_fee else 0 end;
  v_greenbel := v_merchandise + v_shipping_fee - v_carrier_shipping;
  v_customer_total := v_greenbel + v_carrier_shipping;
  if v_option.method='carrier_cod' and (
    v_service.kind <> 'external' or not v_service.cod_enabled
    or v_service.cod_limit is null or v_customer_total > v_service.cod_limit
  ) then
    raise exception 'Carrier COD limit or terms do not allow this amount' using errcode='P0002';
  end if;
  return jsonb_build_object(
    'lines',v_lines,'delivery',v_delivery_terms,'rate',v_rate_terms,
    'proposal',v_proposal_terms,'payment',v_payment_terms,'policy',v_policy_terms,
    'money',jsonb_build_object(
      'currency','GTQ','subtotal',v_subtotal::text,
      'discountTotal',(v_subtotal-v_merchandise)::numeric(14,2)::text,
      'merchandiseTotal',v_merchandise::text,
      'shippingFee',v_shipping_fee::text,'shippingChargeMode',v_shipping_mode,
      'amountDueGreenbel',v_greenbel::text,
      'amountDueCarrierShipping',v_carrier_shipping::text,
      'total',v_customer_total::text
    )
  );
end;
$$;
revoke all on function greenbel_private.checkout_terms(jsonb,uuid)
  from public,anon,authenticated,service_role;

create function public.review_checkout(
  p_intent jsonb, p_review_key uuid, p_review_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_request public.checkout_review_requests%rowtype;
  v_fingerprint jsonb;
  v_terms jsonb;
  v_money jsonb;
  v_billing jsonb;
  v_response jsonb;
  v_stage text;
  v_line jsonb;
  v_inserted integer;
  v_revision integer;
  v_order_id uuid;
begin
  if v_actor is null or p_review_key is null then
    raise exception 'Authenticated customer and review key required' using errcode='42501';
  end if;
  select * into v_profile from public.profiles where id=v_actor and active;
  if not found then
    raise exception 'Active customer profile required' using errcode='42501';
  end if;
  perform greenbel_private.validate_checkout_intent(p_intent);
  v_fingerprint := jsonb_build_object('reviewId',p_review_id,'intent',p_intent);
  insert into public.checkout_review_requests(request_key,customer_id,request_fingerprint)
  values(p_review_key,v_actor,v_fingerprint)
  on conflict (request_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_request from public.checkout_review_requests
    where request_key=p_review_key for update;
    if v_request.customer_id is distinct from v_actor
       or v_request.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Review key reused with different input' using errcode='23505';
    end if;
    if v_request.response is null or v_request.order_id is null then
      raise exception 'Review retry has no completed result' using errcode='P0001';
    end if;
    return v_request.response;
  end if;

  if p_review_id is null then
    v_order_id := gen_random_uuid();
    insert into public.orders(
      id,reference,customer_id,stage,idempotency_key
    ) values (
      v_order_id,'GB-'||replace(v_order_id::text,'-',''),v_actor,'draft',
      'checkout-review:'||p_review_key::text
    );
    select * into v_order from public.orders where id=v_order_id for update;
  else
    select * into v_order from public.orders where id=p_review_id for update;
    if not found or v_order.customer_id is distinct from v_actor
       or v_order.idempotency_key not like 'checkout-review:%'
       or v_order.checkout_intent is null then
      raise exception 'Customer does not own an editable checkout review' using errcode='42501';
    end if;
    if v_order.stage not in ('draft','pending_shipping')
       or exists (
         select 1 from public.stock_reservations sr
         join public.order_items oi on oi.id=sr.order_item_id
         where oi.order_id=v_order.id
       )
       or exists (select 1 from public.shipments where order_id=v_order.id)
       or exists (select 1 from public.payments where order_id=v_order.id) then
      raise exception 'Checkout review is no longer editable' using errcode='P0001';
    end if;
    -- A shipping proposal was calculated for this precise selection. Withdraw
    -- it before changing the lines, address, service, billing or payment.
    if p_intent is distinct from v_order.checkout_intent
       and exists (
         select 1 from public.shipping_proposals
         where order_id=v_order.id and status in ('offered','accepted')
       ) then
      raise exception 'Shipping proposal must be withdrawn before changing selection'
        using errcode='P0001';
    end if;
  end if;
  v_terms := greenbel_private.checkout_terms(p_intent,v_order.id);
  if p_review_id is not null
     and exists (select 1 from public.shipping_proposals
       where order_id=v_order.id and status in ('offered','accepted'))
     and exists (
       select 1
       from jsonb_array_elements(v_order.review_terms->'lines') with ordinality old_line(value,n)
       join jsonb_array_elements(v_terms->'lines') with ordinality new_line(value,n)
         using (n)
       where old_line.value->'shippingWeightKg'
               is distinct from new_line.value->'shippingWeightKg'
          or old_line.value->'shippingDimensions'
               is distinct from new_line.value->'shippingDimensions'
     ) then
    raise exception 'Shipping package changed after proposal; start a new quote'
      using errcode='P0001';
  end if;
  v_money := v_terms->'money';
  v_stage := case when v_money->>'total' is null then 'pending_shipping' else 'draft' end;
  if p_review_id is not null
     and v_order.checkout_intent = p_intent
     and v_order.review_terms = v_terms
     and v_order.stage = v_stage then
    v_revision := v_order.version;
  else
    v_revision := case when p_review_id is null then 1 else v_order.version+1 end;
    v_billing := case when p_intent->'billing'->>'kind'='cf' then
      jsonb_build_object(
        'schema_version',1,'type','cf',
        'first_name',btrim(p_intent->'billing'->>'firstName'),
        'last_name',btrim(p_intent->'billing'->>'lastName'),
        'phone',btrim(p_intent->'billing'->>'phone')
      ) else
      jsonb_build_object(
        'schema_version',1,'type','nit',
        'nit',btrim(p_intent->'billing'->>'nit'),
        'nit_holder_name',btrim(p_intent->'billing'->>'nitOwnerName'),
        'full_name',btrim(p_intent->'billing'->>'fullName'),
        'phone',btrim(p_intent->'billing'->>'phone')
      ) || case when p_intent->'billing' ? 'email'
        then jsonb_build_object('email',btrim(p_intent->'billing'->>'email'))
        else '{}'::jsonb end
    end;
    delete from public.order_items where order_id=v_order.id;
    for v_line in select value from jsonb_array_elements(v_terms->'lines') loop
      insert into public.order_items(
        order_id,product_id,line_no,quantity,sku_snapshot,name_snapshot,
        regular_unit_price,discount_unit,final_unit_price,line_total,
        offer_snapshot,warranty_snapshot
      ) values (
        v_order.id,(v_line->>'productId')::uuid,(v_line->>'lineNo')::integer,
        (v_line->>'quantity')::integer,v_line->>'sku',v_line->>'name',
        (v_line->>'regularUnitPrice')::numeric,
        (v_line->>'discountUnit')::numeric,
        (v_line->>'finalUnitPrice')::numeric,
        (v_line->>'lineTotal')::numeric,
        v_line->'offer',v_line->'warranty'
      );
    end loop;
    update public.orders set
      stage=v_stage,version=v_revision,currency='GTQ',
      customer_snapshot=jsonb_build_object('id',v_actor,
        'displayName',v_profile.display_name,'phone',v_profile.phone),
      billing_snapshot=v_billing,
      delivery_snapshot=(v_terms->'delivery') || jsonb_build_object(
        'shippingChargeMode',v_money->>'shippingChargeMode'),
      payment_method_snapshot=v_terms->'payment',
      terms_snapshot=jsonb_build_object('schemaVersion',1,'reviewTerms',v_terms),
      checkout_intent=p_intent,review_terms=v_terms,
      subtotal=(v_money->>'subtotal')::numeric,
      discount_total=(v_money->>'discountTotal')::numeric,
      merchandise_total=(v_money->>'merchandiseTotal')::numeric,
      shipping_fee=(v_money->>'shippingFee')::numeric,
      shipping_charge_mode=v_money->>'shippingChargeMode',
      amount_due_greenbel=(v_money->>'amountDueGreenbel')::numeric,
      amount_due_carrier_shipping=(v_money->>'amountDueCarrierShipping')::numeric,
      customer_total=(v_money->>'total')::numeric,
      included_iva_amount=null,accepted_total=null,accepted_at=null,confirmed_at=null
    where id=v_order.id;
  end if;
  v_response := jsonb_build_object(
    'reviewId',v_order.id,'revision',v_revision,'stage',v_stage,
    'currency','GTQ','subtotal',v_money->>'subtotal',
    'discountTotal',v_money->>'discountTotal',
    'merchandiseTotal',v_money->>'merchandiseTotal',
    'shippingFee',v_money->>'shippingFee',
    'amountDueGreenbel',v_money->>'amountDueGreenbel',
    'amountDueCarrierShipping',v_money->>'amountDueCarrierShipping',
    'shippingChargeMode',v_money->>'shippingChargeMode',
    'total',v_money->>'total','lines',v_terms->'lines',
    'delivery',v_terms->'delivery','payment',v_terms->'payment',
    'proposal',v_terms->'proposal'
  );
  update public.checkout_review_requests
  set order_id=v_order.id,response=v_response where request_key=p_review_key;
  return v_response;
end;
$$;
revoke all on function public.review_checkout(jsonb,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.review_checkout(jsonb,uuid,uuid) to authenticated;
-- The 002 primitive used catalog_products.now(), which is fixed at transaction
-- start. A wait on the last stock unit may cross an offer boundary. Revalidate
-- at the current clock after locks and compare the offer identity as well as price.
-- If a boundary is crossed between review and this final check, failure rolls
-- back confirmation and reservation together; it never charges stale terms.
create or replace function greenbel_private.reserve_order_core(p_order_id uuid, p_idempotency_key text)
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
  v_checked_at timestamptz;
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

  -- Recheck offer time after all product and balance locks, never at transaction start.
  v_checked_at := clock_timestamp();
  for v_item in
    select * from public.order_items where order_id = p_order_id order by line_no for update
  loop
    v_item_count := v_item_count + 1;
    select * into v_product from public.products where id = v_item.product_id;
    if not v_product.allows_fractional and v_item.quantity <> trunc(v_item.quantity) then
      raise exception 'Product requires whole units';
    end if;
    select p.regular_price, p.currency,
      case when p.regular_price is null then null::numeric
        when o.kind='fixed_price' then o.value
        when o.kind='percentage' then round(p.regular_price*(100-o.value)/100,2)
        else p.regular_price end as effective_price,
      case when o.id is null then '{}'::jsonb else jsonb_build_object(
        'id',o.id,'kind',o.kind,'value',o.value::text,
        'startsAt',o.starts_at,'endsAt',o.ends_at
      ) end as offer_snapshot
      into v_catalog
    from public.products p
    join public.categories c on c.id=p.category_id and c.active
    left join public.brands b on b.id=p.brand_id and b.active
    left join lateral (
      select offer.id,offer.kind,offer.value,offer.starts_at,offer.ends_at
      from public.product_offers offer
      where offer.product_id=p.id and offer.enabled
        and offer.starts_at<=v_checked_at and offer.ends_at>v_checked_at
      order by offer.starts_at desc,offer.id limit 1
    ) o on true
    where p.id=v_item.product_id and p.publication_status='published'
      and (p.brand_id is null or b.id is not null);
    if not found or v_catalog.regular_price is null or v_catalog.effective_price is null then
      raise exception 'Product is not priced and published for checkout';
    end if;
    if v_item.sku_snapshot is distinct from v_product.sku
       or v_item.name_snapshot is distinct from v_product.name
       or v_order.currency is distinct from v_catalog.currency
       or v_item.regular_unit_price is distinct from v_catalog.regular_price
       or v_item.offer_snapshot is distinct from v_catalog.offer_snapshot
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
revoke all on function greenbel_private.reserve_order_core(uuid,text)
  from public,anon,authenticated,service_role;


create function public.confirm_checkout(
  p_review_id uuid, p_intent jsonb, p_accepted_revision integer,
  p_accepted_total numeric, p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_fingerprint jsonb;
  v_terms jsonb;
  v_money jsonb;
  v_reservation_id uuid;
  v_reserve_key text;
  v_policy jsonb;
  v_method text;
  v_expires_at timestamptz;
  v_review_due_at timestamptz;
  v_payment_status text;
begin
  if v_actor is null or p_review_id is null or p_idempotency_key is null
     or p_accepted_revision is null or p_accepted_revision < 1
     or p_accepted_total is null or p_accepted_total <= 0
     or p_accepted_total <> round(p_accepted_total,2) then
    raise exception 'Authenticated customer and valid acceptance required' using errcode='22023';
  end if;
  perform greenbel_private.validate_checkout_intent(p_intent);
  if not exists (select 1 from public.profiles where id=v_actor and active) then
    raise exception 'Active customer profile required' using errcode='42501';
  end if;
  select * into v_order from public.orders where id=p_review_id for update;
  if not found or v_order.customer_id is distinct from v_actor then
    raise exception 'Customer does not own checkout review' using errcode='42501';
  end if;
  v_fingerprint := jsonb_build_object(
    'reviewId',p_review_id,'intent',p_intent,
    'acceptedRevision',p_accepted_revision,'acceptedTotal',p_accepted_total
  );
  select * into v_existing from public.orders
  where confirmation_key=p_idempotency_key;
  if found and v_existing.id is distinct from p_review_id then
    raise exception 'Confirmation key reused with another order' using errcode='23505';
  end if;
  if v_order.confirmation_key = p_idempotency_key then
    if v_order.confirmation_fingerprint is distinct from v_fingerprint then
      raise exception 'Confirmation key reused with different input' using errcode='23505';
    end if;
    select id into v_reservation_id from public.inventory_operations
    where idempotency_key='checkout-reserve:'||p_idempotency_key::text
      and kind='reserve' and order_id=v_order.id;
    if v_reservation_id is null then
      raise exception 'Confirmed order lacks reservation evidence' using errcode='P0001';
    end if;
    v_payment_status := case when exists (
      select 1 from public.payments
      where order_id=v_order.id and status='test_succeeded'
    ) then 'test_succeeded' else 'pending' end;
    return jsonb_build_object(
      'orderId',v_order.id,'reference',v_order.reference,'stage',v_order.stage,
      'currency','GTQ','total',v_order.customer_total::text,
      'paymentStatus',v_payment_status,'reservationId',v_reservation_id,
      'revision',p_accepted_revision,'alreadyConfirmed',true
    );
  end if;
  if v_order.confirmation_key is not null
     or v_order.stage <> 'draft'
     or v_order.checkout_intent is distinct from p_intent
     or v_order.review_terms is null
     or v_order.version <> p_accepted_revision
     or v_order.customer_total is null
     or v_order.customer_total <> p_accepted_total then
    raise exception 'Checkout review changed; accept the current terms' using errcode='P0001';
  end if;
  v_terms := greenbel_private.checkout_terms(p_intent,p_review_id);
  v_money := v_terms->'money';
  if v_terms is distinct from v_order.review_terms
     or v_money->>'total' is null
     or (v_money->>'total')::numeric <> p_accepted_total
     or (v_money->>'subtotal')::numeric is distinct from v_order.subtotal
     or (v_money->>'discountTotal')::numeric is distinct from v_order.discount_total
     or (v_money->>'merchandiseTotal')::numeric is distinct from v_order.merchandise_total
     or (v_money->>'shippingFee')::numeric is distinct from v_order.shipping_fee
     or (v_money->>'amountDueGreenbel')::numeric is distinct from v_order.amount_due_greenbel
     or (v_money->>'amountDueCarrierShipping')::numeric is distinct from v_order.amount_due_carrier_shipping then
    raise exception 'Checkout price, availability or delivery terms changed'
      using errcode='P0001';
  end if;
  v_policy := v_terms->'policy';
  v_method := v_terms->'payment'->>'method';
  if v_method='online_gateway' then
    if (v_policy->>'simulatedGatewayEnabled')::boolean is distinct from true
       or (v_policy->>'onlineReservationMinutes')::integer is null then
      raise exception 'Test gateway is unavailable' using errcode='P0002';
    end if;
    v_expires_at := clock_timestamp()
      + make_interval(mins=>(v_policy->>'onlineReservationMinutes')::integer);
  else
    if (v_policy->>'offlineReviewHours')::integer is null then
      raise exception 'Offline review duration is unavailable' using errcode='P0002';
    end if;
    v_review_due_at := clock_timestamp()
      + make_interval(hours=>(v_policy->>'offlineReviewHours')::integer);
  end if;

  -- No test success is inferred from this command. The payment remains pending.
  update public.orders set
    stage='confirmed',accepted_total=p_accepted_total,
    accepted_at=clock_timestamp(),confirmed_at=clock_timestamp(),
    confirmation_key=p_idempotency_key,
    confirmation_fingerprint=v_fingerprint,
    version=version+1
  where id=p_review_id;
  v_reserve_key := 'checkout-reserve:'||p_idempotency_key::text;
  v_reservation_id := greenbel_private.reserve_order_core(p_review_id,v_reserve_key);
  update public.stock_reservations sr set
    expires_at=v_expires_at,review_due_at=v_review_due_at
  from public.order_items oi
  where sr.order_item_id=oi.id and oi.order_id=p_review_id
    and sr.reserve_operation_id=v_reservation_id and sr.status='active';
  if not found then
    raise exception 'Reservation was not persisted' using errcode='P0001';
  end if;
  return jsonb_build_object(
    'orderId',v_order.id,'reference',v_order.reference,'stage','confirmed',
    'currency','GTQ','total',p_accepted_total::numeric(14,2)::text,
    'paymentStatus','pending','reservationId',v_reservation_id,
    'revision',p_accepted_revision,'alreadyConfirmed',false
  );
end;
$$;
revoke all on function public.confirm_checkout(uuid,jsonb,integer,numeric,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.confirm_checkout(uuid,jsonb,integer,numeric,uuid)
  to authenticated;

-- Shipment writes are still managed by staff, but may never change the
-- approved service, zone or COD collection amount by choosing another row.
create function greenbel_private.checkout_shipment_match()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=new.order_id for share;
  if not found or v_order.stage not in ('confirmed','completed')
     or v_order.delivery_snapshot is null or v_order.payment_method_snapshot is null
     or new.service_id is distinct from (v_order.delivery_snapshot->>'serviceId')::uuid
     or new.zone_id is distinct from (v_order.delivery_snapshot->>'zoneId')::uuid
     or (
       v_order.payment_method_snapshot->>'method'='carrier_cod'
       and new.cod_amount is distinct from v_order.customer_total
     )
     or (
       v_order.payment_method_snapshot->>'method'<>'carrier_cod'
       and new.cod_amount is not null
     ) then
    raise exception 'Shipment does not match confirmed delivery and payment terms'
      using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger shipments_checkout_match before insert or update on public.shipments
for each row execute function greenbel_private.checkout_shipment_match();
revoke all on function greenbel_private.checkout_shipment_match()
  from public,anon,authenticated,service_role;

-- No privileged HTTP client may skip the reviewed commands once the gate opens.
revoke insert,update on public.orders,public.order_items from service_role;
revoke insert,update on public.payments from service_role;
revoke insert,update on public.shipments from service_role;

-- The two RPCs, direct-write revocation, reservation core and snapshot guards
-- are installed before dropping this temporary checkout prohibition.
alter table public.orders drop constraint orders_checkout_gate_pending;
comment on function public.review_checkout(jsonb,uuid,uuid) is
  'Authenticated atomic review/draft and lines. Manual shipping remains pending without final total or reservation.';
comment on function public.confirm_checkout(uuid,jsonb,integer,numeric,uuid) is
  'Authenticated accepted review. Revalidates and reserves stock atomically; never records payment success.';

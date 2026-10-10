-- REVIEW ONLY: staff fulfillment and test/manual collection for DEV.
-- Move to supabase/migrations and apply only after 010 and 011 are reviewed
-- and linked DEV history is rechecked. This file has not been applied.
-- Every payment here is a TEST record; no terminal, carrier or gateway call.

do $preflight$
begin
  if to_regclass('public.checkout_settings') is null
     or to_regprocedure('public.confirm_checkout(uuid,jsonb,integer,numeric,uuid)') is null
     or to_regclass('public.dev_payment_events') is null
     or to_regprocedure('public.record_dev_online_payment_event(uuid,uuid,text,text)') is null
     or to_regclass('public.shipments') is null
     or to_regclass('public.payments') is null
     or to_regclass('public.shipping_proposals') is null
     or to_regclass('public.audit_events') is null
     or to_regprocedure('greenbel_private.consolidate_order_core(uuid,text,text,text)') is null then
    raise exception 'Apply reviewed GreenBel 001-011 before staff fulfillment';
  end if;
  if to_regclass('greenbel_private.staff_order_operations') is not null
     or to_regprocedure('public.record_staff_shipment_event(uuid,text,text,text,text,text)') is not null
     or to_regprocedure('public.record_staff_test_payment(uuid,text,text,text,text)') is not null
     or to_regprocedure('public.offer_staff_shipping_proposal(uuid,numeric,text,text,text)') is not null then
    raise exception 'Staff fulfillment objects already exist; audit DEV history';
  end if;
end
$preflight$;

-- This ledger is not exposed through PostgREST. It serializes retries under
-- the order lock and records the exact input and actor before returning an ID.
create table greenbel_private.staff_order_operations (
  idempotency_key text primary key,
  kind text not null,
  order_id uuid not null references public.orders(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  request_fingerprint jsonb not null,
  result_id uuid not null,
  created_at timestamptz not null default now(),
  constraint staff_ops_key_check check (char_length(btrim(idempotency_key)) between 1 and 160),
  constraint staff_ops_kind_check check (kind in ('shipment_event','manual_test_payment','shipping_offer','shipping_withdraw','carrier_statement','carrier_receipt')),
  constraint staff_ops_fingerprint_check check (jsonb_typeof(request_fingerprint)='object')
);
revoke all on greenbel_private.staff_order_operations from public,anon,authenticated,service_role;

-- Migration 004 compared an external shipment with the carrier's *current*
-- configuration. The order snapshot is the accepted historic instruction.
create or replace function greenbel_private.guard_shipment()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_service public.delivery_services%rowtype;
begin
  select * into v_order from public.orders where id = new.order_id for share;
  select * into v_service from public.delivery_services where id = new.service_id for share;
  if v_order.id is null or v_service.id is null
     or v_order.stage not in ('confirmed','completed') then
    raise exception 'Shipment requires a confirmed order and delivery service';
  end if;
  if v_order.delivery_snapshot is null
     or v_order.delivery_snapshot->>'kind' is distinct from v_service.kind then
    raise exception 'Shipment service differs from accepted order';
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
    if v_service.kind = 'external' and new.carrier_snapshot is distinct from
       (v_order.delivery_snapshot->>'carrierName') then
      raise exception 'External shipment must retain the accepted carrier';
    end if;
    if v_service.kind = 'own_delivery' and new.carrier_snapshot is not null then
      raise exception 'Own delivery must not imply an external carrier';
    end if;
  end if;
  if new.cod_amount is not null and (
      v_service.kind <> 'external'
      or v_order.payment_method_snapshot->>'method' <> 'carrier_cod'
      or new.cod_amount is distinct from v_order.customer_total
      or coalesce((v_order.delivery_snapshot->>'codLimit')::numeric,0) < new.cod_amount
    ) then
    raise exception 'Carrier COD differs from accepted order terms';
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
      raise exception 'Invalid or terminal shipment transition';
    end if;
    if old.status in ('returned','cancelled')
       and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
      raise exception 'Terminal shipment is immutable';
    end if;
  end if;
  if v_service.kind = 'pickup' and new.status = 'delivered' and new.delivered_at is null then
    raise exception 'Pickup handover needs a delivered timestamp';
  end if;
  return new;
end;
$$;
revoke all on function greenbel_private.guard_shipment() from public,anon,authenticated,service_role;

create function public.record_staff_shipment_event(
  p_order_id uuid, p_event text, p_tracking_number text,
  p_tracking_url text, p_evidence_reference text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_shipment public.shipments%rowtype;
  v_service public.delivery_services%rowtype;
  v_existing greenbel_private.staff_order_operations%rowtype;
  v_fingerprint jsonb;
  v_count integer;
  v_active integer;
  v_consumed integer;
  v_payment_ok boolean;
  v_method text;
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=v_actor and ur.role in ('operator','admin') and pr.active
  ) then raise exception 'Active staff required' using errcode='42501'; end if;
  if p_order_id is null or p_event is null
     or p_event not in ('prepare','ready_for_pickup','dispatch','deliver','returned')
     or char_length(btrim(coalesce(p_evidence_reference,''))) not between 1 and 200
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 160
     or char_length(btrim(coalesce(p_tracking_number,''))) > 160
     or (p_tracking_url is not null and p_tracking_url <> ''
         and (char_length(p_tracking_url) > 2000 or p_tracking_url !~ '^https://[^[:space:]]+$')) then
    raise exception 'Invalid staff shipment input';
  end if;
  if p_event<>'dispatch' and (
    nullif(btrim(p_tracking_number),'') is not null
    or nullif(btrim(p_tracking_url),'') is not null
  ) then raise exception 'Tracking fields are only valid for dispatch'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.stage <> 'confirmed'
     or v_order.delivery_snapshot is null or v_order.payment_method_snapshot is null then
    raise exception 'Confirmed order required for fulfillment';
  end if;
  v_fingerprint := jsonb_build_object('event',p_event,'trackingNumber',nullif(btrim(p_tracking_number),''),
    'trackingUrl',nullif(btrim(p_tracking_url),''),'reference',btrim(p_evidence_reference));
  select * into v_existing from greenbel_private.staff_order_operations
  where idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.kind<>'shipment_event' or v_existing.actor_id<>v_actor
       or v_existing.order_id<>p_order_id
       or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Staff shipment key reused with different input';
    end if;
    return v_existing.result_id;
  end if;
  select * into v_service from public.delivery_services
  where id=(v_order.delivery_snapshot->>'serviceId')::uuid for share;
  if not found or v_service.kind is distinct from v_order.delivery_snapshot->>'kind' then
    raise exception 'Accepted delivery service is unavailable';
  end if;
  v_method := v_order.payment_method_snapshot->>'method';
  select * into v_shipment from public.shipments where order_id=p_order_id for update;
  if p_event='prepare' then
    if found then raise exception 'Shipment already prepared; reload'; end if;
    select count(*) into v_count from public.order_items where order_id=p_order_id;
    select count(*) into v_active from public.stock_reservations sr
      join public.order_items oi on oi.id=sr.order_item_id
      where oi.order_id=p_order_id and sr.status='active';
    select count(*) into v_consumed from public.stock_reservations sr
      join public.order_items oi on oi.id=sr.order_item_id
      where oi.order_id=p_order_id and sr.status='consumed';
    if v_count=0 or not (
      v_count=v_active
      or (v_method='online_gateway' and v_count=v_consumed
          and exists(select 1 from public.payments p where p.order_id=p_order_id
            and p.method='online_gateway' and p.test_mode and p.status='test_succeeded'
            and p.amount=v_order.amount_due_greenbel)
          and not exists(select 1 from public.payments p where p.order_id=p_order_id
            and p.method='online_gateway' and p.test_mode and p.status='test_review_required'))
    ) then
      raise exception 'Confirmed order lacks a valid reserved or paid inventory state';
    end if;
    insert into public.shipments(
      order_id,service_id,zone_id,carrier_snapshot,cod_amount,updated_by
    ) values (
      p_order_id,v_service.id,(v_order.delivery_snapshot->>'zoneId')::uuid,
      case when v_service.kind='external' then v_order.delivery_snapshot->>'carrierName' else null end,
      case when v_method='carrier_cod' then v_order.customer_total else null end,
      v_actor
    ) returning * into v_shipment;
  else
    if not found then raise exception 'Prepare shipment before this event'; end if;
    if p_event='ready_for_pickup' then
      if v_service.kind<>'pickup' or v_shipment.status<>'preparing' then
        raise exception 'Pickup is not ready for this transition';
      end if;
      update public.shipments set status='ready_for_pickup',updated_by=v_actor
      where id=v_shipment.id;
    elsif p_event='dispatch' then
      if v_service.kind='pickup' or v_shipment.status<>'preparing' then
        raise exception 'Delivery is not ready for dispatch';
      end if;
      if v_service.kind='external' and char_length(btrim(coalesce(p_tracking_number,'')))=0 then
        raise exception 'External dispatch needs a tracking number';
      end if;
      if v_method='online_gateway' then
        select exists(select 1 from public.payments p where p.order_id=p_order_id
          and p.method='online_gateway' and p.test_mode and p.status='test_succeeded'
          and p.amount=v_order.amount_due_greenbel) into v_payment_ok;
        if not v_payment_ok then raise exception 'Online test payment not verified'; end if;
        if exists(select 1 from public.payments p where p.order_id=p_order_id
          and p.method='online_gateway' and p.test_mode and p.status='test_review_required') then
          raise exception 'Online test payment requires manual reconciliation';
        end if;
        select count(*) into v_count from public.order_items where order_id=p_order_id;
        select count(*) into v_consumed from public.stock_reservations sr
          join public.order_items oi on oi.id=sr.order_item_id
          where oi.order_id=p_order_id and sr.status='consumed';
        if v_count=0 or v_count<>v_consumed then
          raise exception 'Online payment has not consumed reserved stock';
        end if;
      else
        perform greenbel_private.consolidate_order_core(
          p_order_id,'cod_dispatch','staff-dispatch:'||p_idempotency_key,btrim(p_evidence_reference));
      end if;
      update public.shipments set status='dispatched',dispatched_at=clock_timestamp(),
        tracking_number=nullif(btrim(p_tracking_number),''),
        tracking_url=nullif(btrim(p_tracking_url),''),updated_by=v_actor
      where id=v_shipment.id;
    elsif p_event='deliver' then
      if v_service.kind='pickup' and v_shipment.status<>'ready_for_pickup'
         or v_service.kind<>'pickup' and v_shipment.status<>'dispatched' then
        raise exception 'Shipment is not ready for delivery';
      end if;
      if v_method<>'carrier_cod' then
        select exists(select 1 from public.payments p where p.order_id=p_order_id
          and p.method=v_method and p.test_mode and p.status='test_succeeded'
          and p.amount=v_order.amount_due_greenbel) into v_payment_ok;
        if not v_payment_ok then raise exception 'Test payment not recorded before handover'; end if;
      end if;
      if v_method='online_gateway' and exists(
        select 1 from public.payments p where p.order_id=p_order_id
          and p.method='online_gateway' and p.test_mode and p.status='test_review_required'
      ) then raise exception 'Online test payment requires manual reconciliation'; end if;
      if v_method='online_gateway' then
        select count(*) into v_count from public.order_items where order_id=p_order_id;
        select count(*) into v_consumed from public.stock_reservations sr
          join public.order_items oi on oi.id=sr.order_item_id
          where oi.order_id=p_order_id and sr.status='consumed';
        if v_count=0 or v_count<>v_consumed then
          raise exception 'Online payment has not consumed reserved stock';
        end if;
      end if;
      if v_service.kind='pickup' and v_method<>'online_gateway' then
        perform greenbel_private.consolidate_order_core(
          p_order_id,'pickup_handover','staff-pickup:'||p_idempotency_key,btrim(p_evidence_reference));
      end if;
      update public.shipments set status='delivered',delivered_at=clock_timestamp(),
        updated_by=v_actor where id=v_shipment.id;
    else
      if v_service.kind='pickup' or v_shipment.status not in ('dispatched','delivered') then
        raise exception 'Only a dispatched delivery may be returned';
      end if;
      update public.shipments set status='returned',received_back_at=clock_timestamp(),
        updated_by=v_actor where id=v_shipment.id;
      -- Return is a logistics fact, never automatic restock or refund.
    end if;
  end if;
  insert into greenbel_private.staff_order_operations(
    idempotency_key,kind,order_id,actor_id,request_fingerprint,result_id
  ) values (p_idempotency_key,'shipment_event',p_order_id,v_actor,v_fingerprint,v_shipment.id);
  insert into public.audit_events(actor_id,entity_type,entity_id,action,changes,correlation_key)
  values (v_actor,'shipment',v_shipment.id,'staff_'||p_event,
    jsonb_build_object('order_id',p_order_id),p_idempotency_key);
  return v_shipment.id;
end;
$$;
revoke all on function public.record_staff_shipment_event(uuid,text,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_staff_shipment_event(uuid,text,text,text,text,text)
  to authenticated;

-- This registers a staff-observed TEST outcome. It neither calls a terminal
-- nor implies a real transfer. Failed terminal attempts remain unpaid.
create function public.record_staff_test_payment(
  p_order_id uuid, p_method text, p_outcome text,
  p_evidence_reference text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_shipment public.shipments%rowtype;
  v_existing greenbel_private.staff_order_operations%rowtype;
  v_fingerprint jsonb;
  v_amount numeric(14,2);
  v_payment_id uuid;
  v_kind text;
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=v_actor and ur.role in ('operator','admin') and pr.active
  ) then raise exception 'Active staff required' using errcode='42501'; end if;
  if p_order_id is null or p_method is null or p_method not in ('cash','terminal','carrier_cod')
     or p_outcome is null or p_outcome not in ('succeeded','failed')
     or char_length(btrim(coalesce(p_evidence_reference,''))) not between 1 and 200
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 160 then
    raise exception 'Invalid test collection evidence';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.stage<>'confirmed'
     or v_order.payment_method_snapshot->>'method' is distinct from p_method
     or v_order.payment_method_snapshot->>'testMode' is distinct from 'true'
     or v_order.amount_due_greenbel is null then
    raise exception 'Confirmed matching TEST order required';
  end if;
  v_fingerprint := jsonb_build_object('method',p_method,'outcome',p_outcome,
    'reference',btrim(p_evidence_reference));
  select * into v_existing from greenbel_private.staff_order_operations
  where idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.kind<>'manual_test_payment' or v_existing.actor_id<>v_actor
       or v_existing.order_id<>p_order_id
       or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Test collection key reused with different input';
    end if;
    return v_existing.result_id;
  end if;
  select * into v_shipment from public.shipments where order_id=p_order_id for update;
  if not found then raise exception 'Prepare shipment before recording collection'; end if;
  v_kind := v_order.delivery_snapshot->>'kind';
  if (v_kind='pickup' and (p_method not in ('cash','terminal')
       or v_shipment.status<>'ready_for_pickup'))
     or (v_kind='own_delivery' and (p_method not in ('cash','terminal')
       or v_shipment.status<>'dispatched'))
     or (v_kind='external' and (p_method<>'carrier_cod'
       or not (v_shipment.status='delivered'
         or (v_shipment.status='returned' and v_shipment.delivered_at is not null)))) then
    raise exception 'Test collection method or delivery stage does not match order';
  end if;
  if p_outcome='succeeded' and exists (
    select 1 from public.payments p where p.order_id=p_order_id
      and p.status='test_succeeded'
  ) then raise exception 'Successful test collection already recorded'; end if;
  v_amount := case when p_method='carrier_cod' then v_order.customer_total
    else v_order.amount_due_greenbel end;
  if v_amount is null or v_amount<=0 then raise exception 'Positive order amount required'; end if;

  -- The 004 trigger requires test_created first. Both steps are one SQL
  -- transaction, so no observer sees an invented interim successful payment.
  insert into public.payments(
    order_id,method,test_mode,status,amount,currency,idempotency_key,
    request_fingerprint,recorded_by,external_reference
  ) values (
    p_order_id,p_method,true,'test_created',v_amount,'GTQ',p_idempotency_key,
    md5(v_fingerprint::text)||md5('greenbel:'||v_fingerprint::text),
    v_actor,btrim(p_evidence_reference)
  ) returning id into v_payment_id;
  update public.payments set
    status=case when p_outcome='succeeded' then 'test_succeeded' else 'test_failed' end,
    paid_at=case when p_outcome='succeeded' then clock_timestamp() else null end,
    test_evidence_reference=btrim(p_evidence_reference)
  where id=v_payment_id;
  insert into greenbel_private.staff_order_operations(
    idempotency_key,kind,order_id,actor_id,request_fingerprint,result_id
  ) values (p_idempotency_key,'manual_test_payment',p_order_id,v_actor,v_fingerprint,v_payment_id);
  insert into public.audit_events(actor_id,entity_type,entity_id,action,changes,correlation_key)
  values (v_actor,'payment',v_payment_id,'staff_test_payment_recorded',
    jsonb_build_object('order_id',p_order_id,'method',p_method,'outcome',p_outcome),p_idempotency_key);
  return v_payment_id;
end;
$$;
revoke all on function public.record_staff_test_payment(uuid,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_staff_test_payment(uuid,text,text,text,text)
  to authenticated;

-- A staff offer is only a transport quote, never the customer's acceptance
-- of the final checkout total, a reservation, a payment or a dispatch.
create function public.offer_staff_shipping_proposal(
  p_order_id uuid, p_fee numeric, p_charge_mode text,
  p_terms text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_existing greenbel_private.staff_order_operations%rowtype;
  v_fingerprint jsonb;
  v_revision integer;
  v_proposal_id uuid;
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=v_actor and ur.role in ('operator','admin') and pr.active
  ) then raise exception 'Active staff required' using errcode='42501'; end if;
  if p_order_id is null or p_fee is null or p_fee not between 0 and 999999999999.99
     or p_fee is distinct from round(p_fee,2)
     or p_charge_mode is null or p_charge_mode not in ('with_order','at_destination')
     or char_length(btrim(coalesce(p_terms,''))) not between 1 and 5000
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 160 then
    raise exception 'Complete fee, charge mode, terms and key required';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.stage<>'pending_shipping'
     or v_order.checkout_intent is null
     or v_order.delivery_snapshot->>'kind' not in ('own_delivery','external')
     or v_order.checkout_intent->'delivery'->>'chargeMode' is distinct from p_charge_mode then
    raise exception 'Order does not await this shipping quote';
  end if;
  v_fingerprint := jsonb_build_object('fee',p_fee,'chargeMode',p_charge_mode,'terms',btrim(p_terms));
  select * into v_existing from greenbel_private.staff_order_operations
  where idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.kind<>'shipping_offer' or v_existing.actor_id<>v_actor
       or v_existing.order_id<>p_order_id
       or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Shipping offer key reused with different input';
    end if;
    return v_existing.result_id;
  end if;
  if exists (select 1 from public.shipping_proposals
    where order_id=p_order_id and status in ('offered','accepted')) then
    raise exception 'Withdraw the current offer before sending another';
  end if;
  select coalesce(max(revision),0)+1 into v_revision from public.shipping_proposals
  where order_id=p_order_id;
  insert into public.shipping_proposals(
    order_id,revision,fee,currency,charge_mode,status,proposed_by,terms_snapshot
  ) values (
    p_order_id,v_revision,p_fee,'GTQ',p_charge_mode,'offered',v_actor,btrim(p_terms)
  ) returning id into v_proposal_id;
  insert into greenbel_private.staff_order_operations(
    idempotency_key,kind,order_id,actor_id,request_fingerprint,result_id
  ) values (p_idempotency_key,'shipping_offer',p_order_id,v_actor,v_fingerprint,v_proposal_id);
  insert into public.audit_events(actor_id,entity_type,entity_id,action,changes,correlation_key)
  values (v_actor,'shipping_proposal',v_proposal_id,'shipping_fee_offered',
    jsonb_build_object('order_id',p_order_id,'revision',v_revision,'fee',p_fee),p_idempotency_key);
  return v_proposal_id;
end;
$$;
revoke all on function public.offer_staff_shipping_proposal(uuid,numeric,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.offer_staff_shipping_proposal(uuid,numeric,text,text,text)
  to authenticated;

create function public.withdraw_staff_shipping_proposal(
  p_proposal_id uuid, p_reason text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_proposal public.shipping_proposals%rowtype;
  v_existing greenbel_private.staff_order_operations%rowtype;
  v_fingerprint jsonb;
  v_order_id uuid;
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=v_actor and ur.role in ('operator','admin') and pr.active
  ) then raise exception 'Active staff required' using errcode='42501'; end if;
  if p_proposal_id is null or char_length(btrim(coalesce(p_reason,''))) not between 1 and 2000
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 160 then
    raise exception 'Proposal, reason and key required';
  end if;
  select order_id into v_order_id from public.shipping_proposals where id=p_proposal_id;
  if not found then raise exception 'Proposal is unavailable'; end if;
  select * into v_order from public.orders where id=v_order_id for update;
  if not found or v_order.stage<>'pending_shipping' then
    raise exception 'Order no longer awaits shipping';
  end if;
  v_fingerprint := jsonb_build_object('proposalId',p_proposal_id,'reason',btrim(p_reason));
  select * into v_existing from greenbel_private.staff_order_operations
  where idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.kind<>'shipping_withdraw' or v_existing.actor_id<>v_actor
       or v_existing.order_id<>v_order.id
       or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Shipping withdrawal key reused with different input';
    end if;
    return v_existing.result_id;
  end if;
  select * into v_proposal from public.shipping_proposals where id=p_proposal_id for update;
  if not found or v_proposal.status<>'offered' then
    raise exception 'Only an offered shipping proposal may be withdrawn';
  end if;
  update public.shipping_proposals set status='withdrawn' where id=p_proposal_id;
  insert into greenbel_private.staff_order_operations(
    idempotency_key,kind,order_id,actor_id,request_fingerprint,result_id
  ) values (p_idempotency_key,'shipping_withdraw',v_order.id,v_actor,v_fingerprint,p_proposal_id);
  insert into public.audit_events(actor_id,entity_type,entity_id,action,changes,correlation_key)
  values (v_actor,'shipping_proposal',p_proposal_id,'shipping_fee_withdrawn',
    jsonb_build_object('order_id',v_order.id,'reason',btrim(p_reason)),p_idempotency_key);
  return p_proposal_id;
end;
$$;
revoke all on function public.withdraw_staff_shipping_proposal(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.withdraw_staff_shipping_proposal(uuid,text,text)
  to authenticated;

-- Operator duties include documenting the carrier's collection and deposit.
-- These are test-mode operational facts, separate from delivery and from
-- GreenBel's receipt. A variance or deduction requires an explicit note.
-- A shipment returned *after* recorded delivery can still have a collection
-- report and deposit to reconcile. A return before delivery cannot.
create or replace function greenbel_private.guard_carrier_settlement()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_shipment public.shipments%rowtype;
  v_service public.delivery_services%rowtype;
  v_payment_order uuid;
  v_received numeric(14,2);
begin
  select * into v_shipment from public.shipments where id=new.shipment_id for share;
  if not found then raise exception 'Shipment does not exist'; end if;
  select * into v_service from public.delivery_services where id=v_shipment.service_id;
  if not (v_shipment.status='delivered'
          or (v_shipment.status='returned' and v_shipment.delivered_at is not null))
     or v_service.kind<>'external' or v_shipment.cod_amount is null then
    raise exception 'Carrier statement requires an external COD delivery';
  end if;
  if new.gross_collected is distinct from v_shipment.cod_amount
     and char_length(btrim(coalesce(new.collection_variance_notes,''))) not between 1 and 500 then
    raise exception 'Document the difference from instructed carrier COD amount';
  end if;
  if new.payment_id is not null then
    select order_id into v_payment_order from public.payments where id=new.payment_id;
    if v_payment_order is distinct from v_shipment.order_id then
      raise exception 'Settlement payment belongs to another order';
    end if;
  end if;
  if tg_op='UPDATE' then
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
    if old.status='settled' and new.status<>'settled' then
      raise exception 'Settled carrier statement is terminal';
    end if;
  end if;
  select coalesce(sum(amount),0) into v_received
  from public.settlement_receipts where settlement_id=new.id;
  if new.status='settled' and v_received<>new.expected_net
     or new.status='partial' and (v_received<=0 or v_received>=new.expected_net)
     or new.status='pending' and v_received<>0 then
    raise exception 'Settlement status does not match received amount';
  end if;
  return new;
end;
$$;
revoke all on function greenbel_private.guard_carrier_settlement()
  from public,anon,authenticated,service_role;

create or replace function greenbel_private.guard_settlement_receipt()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_settlement public.carrier_settlements%rowtype;
  v_received numeric(14,2);
begin
  if not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=new.recorded_by and ur.role in ('operator','admin') and pr.active
  ) then raise exception 'Active staff must record settlement receipt'; end if;
  select * into v_settlement from public.carrier_settlements
  where id=new.settlement_id for update;
  if not found then raise exception 'Carrier settlement does not exist'; end if;
  select coalesce(sum(amount),0) into v_received from public.settlement_receipts
  where settlement_id=new.settlement_id;
  if v_received+new.amount>v_settlement.expected_net then
    raise exception 'Carrier receipts exceed expected net';
  end if;
  return new;
end;
$$;
revoke all on function greenbel_private.guard_settlement_receipt()
  from public,anon,authenticated,service_role;

drop policy carrier_settlements_admin_read on public.carrier_settlements;
create policy carrier_settlements_staff_read on public.carrier_settlements
  for select to authenticated using (exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=(select auth.uid()) and ur.role in ('operator','admin') and pr.active
  ));
drop policy settlement_receipts_admin_read on public.settlement_receipts;
create policy settlement_receipts_staff_read on public.settlement_receipts
  for select to authenticated using (exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=(select auth.uid()) and ur.role in ('operator','admin') and pr.active
  ));

create function public.record_staff_carrier_statement(
  p_shipment_id uuid, p_gross_collected numeric, p_commission numeric,
  p_shipping_deducted numeric, p_other_deductions numeric,
  p_commission_notes text, p_deduction_notes text,
  p_variance_notes text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_shipment public.shipments%rowtype;
  v_existing greenbel_private.staff_order_operations%rowtype;
  v_fingerprint jsonb;
  v_payment_id uuid;
  v_statement_id uuid;
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=v_actor and ur.role in ('operator','admin') and pr.active
  ) then raise exception 'Active staff required' using errcode='42501'; end if;
  if p_shipment_id is null or p_gross_collected is null
     or p_gross_collected not between 0.01 and 999999999999.99
     or p_gross_collected is distinct from round(p_gross_collected,2)
     or p_commission is null or p_commission not between 0 and 999999999999.99
     or p_commission is distinct from round(p_commission,2)
     or p_shipping_deducted is null or p_shipping_deducted not between 0 and 999999999999.99
     or p_shipping_deducted is distinct from round(p_shipping_deducted,2)
     or p_other_deductions is null or p_other_deductions not between 0 and 999999999999.99
     or p_other_deductions is distinct from round(p_other_deductions,2)
     or p_gross_collected < p_commission+p_shipping_deducted+p_other_deductions
     or (p_commission>0 and char_length(btrim(coalesce(p_commission_notes,''))) not between 1 and 500)
     or ((p_shipping_deducted>0 or p_other_deductions>0)
         and char_length(btrim(coalesce(p_deduction_notes,''))) not between 1 and 500)
     or char_length(btrim(coalesce(p_commission_notes,'')))>500
     or char_length(btrim(coalesce(p_deduction_notes,'')))>500
     or char_length(btrim(coalesce(p_variance_notes,'')))>500
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 160 then
    raise exception 'Invalid documented carrier statement';
  end if;
  select order_id into v_order_id from public.shipments where id=p_shipment_id;
  if not found then raise exception 'Shipment does not exist'; end if;
  select * into v_order from public.orders where id=v_order_id for update;
  if not found or v_order.stage not in ('confirmed','completed') then
    raise exception 'Confirmed order required';
  end if;
  v_fingerprint := jsonb_build_object('shipmentId',p_shipment_id,'gross',p_gross_collected,
    'commission',p_commission,'shippingDeducted',p_shipping_deducted,
    'otherDeductions',p_other_deductions,'commissionNotes',nullif(btrim(p_commission_notes),''),
    'deductionNotes',nullif(btrim(p_deduction_notes),''),
    'varianceNotes',nullif(btrim(p_variance_notes),''));
  select * into v_existing from greenbel_private.staff_order_operations
  where idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.kind<>'carrier_statement' or v_existing.actor_id<>v_actor
       or v_existing.order_id<>v_order.id
       or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Carrier statement key reused with different input';
    end if;
    return v_existing.result_id;
  end if;
  select * into v_shipment from public.shipments where id=p_shipment_id for update;
  if not (v_shipment.status='delivered'
          or (v_shipment.status='returned' and v_shipment.delivered_at is not null))
     or v_shipment.cod_amount is null
     or v_order.payment_method_snapshot->>'method'<>'carrier_cod' then
    raise exception 'Delivered external COD shipment required';
  end if;
  if p_gross_collected is distinct from v_shipment.cod_amount
     and char_length(btrim(coalesce(p_variance_notes,''))) not between 1 and 500 then
    raise exception 'Document carrier collection variance';
  end if;
  if exists (select 1 from public.carrier_settlements where shipment_id=p_shipment_id) then
    raise exception 'Carrier statement already exists';
  end if;
  select id into v_payment_id from public.payments
  where order_id=v_order.id and method='carrier_cod' and test_mode
    and status='test_succeeded' order by created_at desc limit 1;
  insert into public.carrier_settlements(
    shipment_id,payment_id,gross_collected,commission,shipping_deducted,
    other_documented_deductions,commission_notes,deduction_notes,
    collection_variance_notes,expected_net,status
  ) values (
    p_shipment_id,v_payment_id,p_gross_collected,p_commission,p_shipping_deducted,
    p_other_deductions,nullif(btrim(p_commission_notes),''),
    nullif(btrim(p_deduction_notes),''),nullif(btrim(p_variance_notes),''),
    p_gross_collected-p_commission-p_shipping_deducted-p_other_deductions,
    case
      when p_gross_collected is distinct from v_shipment.cod_amount then 'disputed'
      when p_gross_collected=p_commission+p_shipping_deducted+p_other_deductions then 'settled'
      else 'pending'
    end
  ) returning id into v_statement_id;
  insert into greenbel_private.staff_order_operations(
    idempotency_key,kind,order_id,actor_id,request_fingerprint,result_id
  ) values (p_idempotency_key,'carrier_statement',v_order.id,v_actor,v_fingerprint,v_statement_id);
  insert into public.audit_events(actor_id,entity_type,entity_id,action,changes,correlation_key)
  values (v_actor,'carrier_settlement',v_statement_id,'carrier_collection_reported',
    jsonb_build_object('shipment_id',p_shipment_id,'gross_collected',p_gross_collected),p_idempotency_key);
  return v_statement_id;
end;
$$;
revoke all on function public.record_staff_carrier_statement(uuid,numeric,numeric,numeric,numeric,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_staff_carrier_statement(uuid,numeric,numeric,numeric,numeric,text,text,text,text)
  to authenticated;

create function public.record_staff_carrier_receipt(
  p_statement_id uuid, p_amount numeric, p_bank_reference text,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_statement public.carrier_settlements%rowtype;
  v_existing greenbel_private.staff_order_operations%rowtype;
  v_fingerprint jsonb;
  v_receipt_id uuid;
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=v_actor and ur.role in ('operator','admin') and pr.active
  ) then raise exception 'Active staff required' using errcode='42501'; end if;
  if p_statement_id is null or p_amount is null
     or p_amount not between 0.01 and 999999999999.99
     or p_amount is distinct from round(p_amount,2)
     or char_length(btrim(coalesce(p_bank_reference,''))) not between 1 and 200
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 160 then
    raise exception 'Valid documented receipt required';
  end if;
  select sh.order_id into v_order_id from public.carrier_settlements cs
    join public.shipments sh on sh.id=cs.shipment_id where cs.id=p_statement_id;
  if not found then raise exception 'Carrier statement does not exist'; end if;
  select * into v_order from public.orders where id=v_order_id for update;
  if not found then raise exception 'Order does not exist'; end if;
  v_fingerprint := jsonb_build_object('statementId',p_statement_id,'amount',p_amount,
    'bankReference',btrim(p_bank_reference));
  select * into v_existing from greenbel_private.staff_order_operations
  where idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.kind<>'carrier_receipt' or v_existing.actor_id<>v_actor
       or v_existing.order_id<>v_order.id
       or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Carrier receipt key reused with different input';
    end if;
    return v_existing.result_id;
  end if;
  select * into v_statement from public.carrier_settlements
  where id=p_statement_id for update;
  if not found or v_statement.status='settled' then
    raise exception 'Carrier statement is not receivable';
  end if;
  insert into public.settlement_receipts(
    settlement_id,amount,received_at,bank_reference,recorded_by,idempotency_key
  ) values (p_statement_id,p_amount,clock_timestamp(),btrim(p_bank_reference),v_actor,p_idempotency_key)
  returning id into v_receipt_id;
  insert into greenbel_private.staff_order_operations(
    idempotency_key,kind,order_id,actor_id,request_fingerprint,result_id
  ) values (p_idempotency_key,'carrier_receipt',v_order.id,v_actor,v_fingerprint,v_receipt_id);
  insert into public.audit_events(actor_id,entity_type,entity_id,action,changes,correlation_key)
  values (v_actor,'settlement_receipt',v_receipt_id,'carrier_deposit_recorded',
    jsonb_build_object('statement_id',p_statement_id,'amount',p_amount),p_idempotency_key);
  return v_receipt_id;
end;
$$;
revoke all on function public.record_staff_carrier_receipt(uuid,numeric,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_staff_carrier_receipt(uuid,numeric,text,text)
  to authenticated;

comment on function public.record_staff_test_payment(uuid,text,text,text,text) is
  'Authenticated operator/admin records an observed fictitious DEV payment outcome. Never calls an actual provider.';
comment on function public.record_staff_shipment_event(uuid,text,text,text,text,text) is
  'Authenticated operator/admin manual shipment fact; COD dispatch and pickup handover consolidate the one reserved stock exactly once.';
comment on function public.record_staff_carrier_receipt(uuid,numeric,text,text) is
  'Manual receipt record for a documented carrier deposit. No bank integration or transfer is performed.';

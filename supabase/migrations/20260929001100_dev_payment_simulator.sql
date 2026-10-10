-- DEV-only, server-controlled payment simulator. Pending review; do not apply
-- until 010 is verified and the linked project/history match DEV.
-- No external gateway call, real charge, email, refund, or automatic release.

do $preflight$
begin
  if current_setting('server_version_num')::integer < 150000
     or to_regclass('public.checkout_settings') is null
     or to_regclass('public.payments') is null
     or to_regclass('public.stock_reservations') is null
     or to_regprocedure('public.confirm_checkout(uuid,jsonb,integer,numeric,uuid)') is null
     or to_regprocedure('greenbel_private.consolidate_order_core(uuid,text,text,text)') is null then
    raise exception 'Apply and verify GreenBel checkout 010 before DEV simulator';
  end if;
  if exists (select 1 from pg_constraint where conrelid='public.orders'::regclass
    and conname='orders_checkout_gate_pending') then
    raise exception 'Checkout gate is still active';
  end if;
  if has_table_privilege('service_role','public.payments','INSERT')
     or has_table_privilege('service_role','public.payments','UPDATE') then
    raise exception 'Direct service_role payment DML must be revoked by 010';
  end if;
  if to_regclass('public.dev_payment_events') is not null
     or to_regprocedure('public.create_dev_online_payment_attempt(uuid,uuid)') is not null
     or to_regprocedure('public.record_dev_online_payment_event(uuid,uuid,text,text)') is not null then
    raise exception 'DEV simulator objects already exist; audit before migration';
  end if;
end
$preflight$;

-- Internal event ledger. Response is persisted so transport retries return the
-- original result; a different payload with the same key fails.
create table public.dev_payment_events (
  event_key uuid primary key,
  payment_id uuid not null references public.payments(id) on delete restrict,
  requested_outcome text not null,
  evidence_reference text not null,
  processing_result text not null,
  consolidation_operation_id uuid references public.inventory_operations(id) on delete restrict,
  review_payment_id uuid references public.payments(id) on delete restrict,
  response jsonb not null,
  occurred_at timestamptz not null default clock_timestamp(),
  constraint dev_payment_events_outcome_check check (
    requested_outcome in ('success','rejected','expired')
  ),
  constraint dev_payment_events_evidence_check check (
    char_length(evidence_reference) between 12 and 200
    and evidence_reference like 'PRUEBA DEV:%'
  ),
  constraint dev_payment_events_result_check check (
    processing_result in ('succeeded','rejected','expired_review',
      'late_success_review','duplicate_success','conflicting_event_review','terminal_noop')
  ),
  constraint dev_payment_events_response_check check (jsonb_typeof(response)='object'),
  constraint dev_payment_events_consolidation_check check (
    (processing_result='succeeded' and consolidation_operation_id is not null)
    or (processing_result<>'succeeded' and consolidation_operation_id is null)
  ),
  constraint dev_payment_events_review_link_check check (
    review_payment_id is null
    or processing_result in ('late_success_review','conflicting_event_review')
  )
);
create index dev_payment_events_payment_time_idx
  on public.dev_payment_events(payment_id,occurred_at);
alter table public.dev_payment_events enable row level security;
revoke all on public.dev_payment_events from public,anon,authenticated,service_role;
grant select on public.dev_payment_events to service_role;
comment on table public.dev_payment_events is
  'DEV simulator evidence only. Late or contradictory events need review; no event releases inventory.';

create function public.create_dev_online_payment_attempt(
  p_order_id uuid,p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_settings public.checkout_settings%rowtype;
  v_payment public.payments%rowtype;
  v_payment_id uuid;
  v_key text;
  v_payload text;
  v_fingerprint text;
  v_item_count integer;
  v_active_count integer;
  v_response jsonb;
begin
  -- EXECUTE is granted only to service_role; the calling script separately
  -- enforces APP_ENV=DEV, linked project identity and DEV URL.
  if p_order_id is null or p_idempotency_key is null then
    raise exception 'DEV server payment command required' using errcode='42501';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.payment_method_snapshot->>'method' is distinct from 'online_gateway'
     or v_order.payment_method_snapshot->>'timing' is distinct from 'prepaid'
     or v_order.payment_method_snapshot->>'testMode' is distinct from 'true'
     or v_order.amount_due_greenbel is null or v_order.amount_due_greenbel <= 0
     or v_order.currency is distinct from 'GTQ' then
    raise exception 'Order is not eligible for a simulated online attempt'
      using errcode='P0001';
  end if;
  v_key := 'dev-online-attempt:'||p_idempotency_key::text;
  v_payload := jsonb_build_object('orderId',p_order_id,
    'amount',v_order.amount_due_greenbel,'method','online_gateway',
    'testMode',true)::text;
  -- The exact order/amount/method are checked again on replay. The 64 hex
  -- digest is a lookup fingerprint, never a provider signature.
  v_fingerprint := md5('greenbel-dev-v1:'||v_payload)
    ||md5('greenbel-dev-v2:'||v_payload);
  select * into v_payment from public.payments
  where idempotency_key=v_key for update;
  if found then
    if v_payment.order_id is distinct from p_order_id
       or v_payment.method is distinct from 'online_gateway'
       or v_payment.provider is distinct from 'DEV_SIMULATOR'
       or v_payment.amount is distinct from v_order.amount_due_greenbel
       or v_payment.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Payment attempt key reused with different input'
        using errcode='23505';
    end if;
    return jsonb_build_object('paymentId',v_payment.id,'orderId',p_order_id,
      'amount',v_payment.amount::text,'currency','GTQ',
      'status',v_payment.status,'simulated',true,'alreadyCreated',true);
  end if;
  if v_order.stage <> 'confirmed' then
    raise exception 'Only a confirmed order may start a simulated payment'
      using errcode='P0001';
  end if;
  select * into v_settings from public.checkout_settings where id for share;
  if not found or not v_settings.simulated_gateway_enabled then
    raise exception 'DEV simulator is disabled' using errcode='P0002';
  end if;
  if exists (select 1 from public.payments
    where order_id=p_order_id and method='online_gateway'
      and status in ('test_created','test_succeeded','test_review_required')) then
    raise exception 'Order has an unresolved or successful online payment attempt'
      using errcode='P0001';
  end if;
  select count(*) into v_item_count from public.order_items where order_id=p_order_id;
  select count(*) into v_active_count
  from public.stock_reservations sr
  join public.order_items oi on oi.id=sr.order_item_id
  where oi.order_id=p_order_id and sr.status='active'
    and sr.expires_at>clock_timestamp();
  if v_item_count=0 or v_item_count<>v_active_count then
    raise exception 'Online reservation is absent or expired' using errcode='P0001';
  end if;
  v_payment_id := gen_random_uuid();
  insert into public.payments(
    id,order_id,method,provider,provider_payment_id,test_mode,status,
    amount,currency,idempotency_key,request_fingerprint,external_reference
  ) values (
    v_payment_id,p_order_id,'online_gateway','DEV_SIMULATOR',
    'DEV-SIM-'||v_payment_id::text,true,'test_created',
    v_order.amount_due_greenbel,'GTQ',v_key,v_fingerprint,'PRUEBA DEV: sin cobro real'
  );
  v_response := jsonb_build_object('paymentId',v_payment_id,'orderId',p_order_id,
    'amount',v_order.amount_due_greenbel::text,'currency','GTQ',
    'status','test_created','simulated',true,'alreadyCreated',false);
  return v_response;
end;
$$;
revoke all on function public.create_dev_online_payment_attempt(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.create_dev_online_payment_attempt(uuid,uuid)
  to service_role;

create function public.record_dev_online_payment_event(
  p_payment_id uuid,p_event_key uuid,p_outcome text,p_evidence_reference text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_existing public.dev_payment_events%rowtype;
  v_result text;
  v_status text;
  v_operation_id uuid;
  v_item_count integer;
  v_active_count integer;
  v_review_payment_id uuid;
  v_review_key text;
  v_review_payload text;
  v_response jsonb;
begin
  if p_payment_id is null or p_event_key is null or p_outcome is null
     or p_outcome not in ('success','rejected','expired')
     or char_length(btrim(coalesce(p_evidence_reference,''))) not between 12 and 200
     or btrim(p_evidence_reference) not like 'PRUEBA DEV:%' then
    raise exception 'Valid DEV server payment event required' using errcode='42501';
  end if;
  select order_id into v_order_id from public.payments where id=p_payment_id;
  if not found then
    raise exception 'Unknown simulated payment' using errcode='P0002';
  end if;
  select * into v_order from public.orders where id=v_order_id for update;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found or v_payment.order_id is distinct from v_order_id
     or v_payment.method is distinct from 'online_gateway'
     or v_payment.provider is distinct from 'DEV_SIMULATOR'
     or v_payment.test_mode is distinct from true
     or v_payment.currency is distinct from 'GTQ'
     or v_payment.amount is distinct from v_order.amount_due_greenbel then
    raise exception 'Payment is not a matching DEV simulator attempt'
      using errcode='P0001';
  end if;
  select * into v_existing from public.dev_payment_events
  where event_key=p_event_key for update;
  if found then
    if v_existing.payment_id is distinct from p_payment_id
       or v_existing.requested_outcome is distinct from p_outcome
       or v_existing.evidence_reference is distinct from btrim(p_evidence_reference) then
      raise exception 'Payment event key reused with different input'
        using errcode='23505';
    end if;
    return v_existing.response;
  end if;
  if v_payment.status='test_succeeded' then
    v_result := case when p_outcome='success' then 'duplicate_success'
      else 'conflicting_event_review' end;
  elsif v_payment.status in ('test_failed','test_cancelled','test_review_required') then
    v_result := case when p_outcome='success' then 'late_success_review'
      else 'terminal_noop' end;
  elsif v_payment.status='test_created' then
    if p_outcome='rejected' then
      update public.payments set status='test_failed',
        test_evidence_reference=btrim(p_evidence_reference)
      where id=p_payment_id;
      v_result := 'rejected';
    elsif p_outcome='expired' then
      if exists (
        select 1 from public.stock_reservations sr
        join public.order_items oi on oi.id=sr.order_item_id
        where oi.order_id=v_order_id and sr.status='active'
          and sr.expires_at>clock_timestamp()
      ) then
        raise exception 'Online reservation has not expired' using errcode='P0001';
      end if;
      update public.payments set status='test_review_required',
        test_evidence_reference=btrim(p_evidence_reference)
      where id=p_payment_id;
      v_result := 'expired_review';
    else
      select count(*) into v_item_count from public.order_items where order_id=v_order_id;
      select count(*) into v_active_count
      from public.stock_reservations sr
      join public.order_items oi on oi.id=sr.order_item_id
      where oi.order_id=v_order_id and sr.status='active'
        and sr.expires_at>clock_timestamp();
      if v_order.stage='confirmed' and v_item_count>0
         and v_item_count=v_active_count
         and not exists (select 1 from public.payments
           where order_id=v_order_id and id<>p_payment_id
             and status in ('test_succeeded','test_review_required')) then
        v_operation_id := greenbel_private.consolidate_order_core(
          v_order_id,'online_payment',
          'dev-online-consolidate:'||p_payment_id::text,
          btrim(p_evidence_reference)
        );
        update public.payments set status='test_succeeded',
          paid_at=clock_timestamp(),
          test_evidence_reference=btrim(p_evidence_reference)
        where id=p_payment_id;
        v_result := 'succeeded';
      else
        -- A late success is evidence for human reconciliation, never authority
        -- to re-reserve, release stock, or assert a completed payment.
        update public.payments set status='test_review_required',
          test_evidence_reference=btrim(p_evidence_reference)
        where id=p_payment_id;
        v_result := 'late_success_review';
      end if;
    end if;
  else
    raise exception 'Unsupported test payment state' using errcode='P0001';
  end if;
  if v_result in ('late_success_review','conflicting_event_review') then
    if v_payment.status in ('test_review_required','test_created') then
      -- The original attempt itself is now a visible review row.
      v_review_payment_id := p_payment_id;
    else
      -- A terminal failed/succeeded attempt stays immutable under the 004
      -- guard. One additional review row makes the conflict visible to staff.
      select review_payment_id into v_review_payment_id
      from public.dev_payment_events
      where payment_id=p_payment_id
        and processing_result in ('late_success_review','conflicting_event_review')
        and review_payment_id is not null
      order by occurred_at,event_key limit 1;
      if v_review_payment_id is null then
        v_review_payment_id := gen_random_uuid();
        v_review_key := 'dev-online-review:'||p_event_key::text;
        v_review_payload := jsonb_build_object(
          'sourcePaymentId',p_payment_id,'eventKey',p_event_key,
          'outcome',p_outcome,'evidence',btrim(p_evidence_reference)
        )::text;
        insert into public.payments(
          id,order_id,method,provider,provider_payment_id,test_mode,status,
          amount,currency,idempotency_key,request_fingerprint,external_reference
        ) values (
          v_review_payment_id,v_order_id,'online_gateway','DEV_SIMULATOR',
          'DEV-REVIEW-'||v_review_payment_id::text,true,'test_created',
          v_payment.amount,'GTQ',v_review_key,
          md5('greenbel-review-v1:'||v_review_payload)
            ||md5('greenbel-review-v2:'||v_review_payload),
          'PRUEBA DEV: evento contradictorio pendiente de revisión'
        );
        update public.payments set status='test_review_required',
          test_evidence_reference=btrim(p_evidence_reference)
        where id=v_review_payment_id;
      end if;
    end if;
  end if;
  select status into v_status from public.payments where id=p_payment_id;
  v_response := jsonb_build_object(
    'eventKey',p_event_key,'paymentId',p_payment_id,'orderId',v_order_id,
    'requestedOutcome',p_outcome,'processingResult',v_result,
    'paymentStatus',v_status,'consolidationOperationId',v_operation_id,
    'reviewPaymentId',v_review_payment_id,
    'simulated',true
  );
  insert into public.dev_payment_events(
    event_key,payment_id,requested_outcome,evidence_reference,
    processing_result,consolidation_operation_id,review_payment_id,response
  ) values (
    p_event_key,p_payment_id,p_outcome,btrim(p_evidence_reference),
    v_result,v_operation_id,v_review_payment_id,v_response
  );
  return v_response;
end;
$$;
revoke all on function public.record_dev_online_payment_event(uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_dev_online_payment_event(uuid,uuid,text,text)
  to service_role;

comment on function public.create_dev_online_payment_attempt(uuid,uuid) is
  'DEV-only test attempt, service_role caller; no external gateway or charge.';
comment on function public.record_dev_online_payment_event(uuid,uuid,text,text) is
  'DEV-only test event; timely success consolidates inventory atomically. Late success remains reviewable.';

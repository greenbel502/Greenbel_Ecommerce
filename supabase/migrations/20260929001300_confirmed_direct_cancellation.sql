-- Direct customer cancellation of a confirmed but unprepared order.
-- DEV technical migration; apply only after 010-012 target/history review.
-- A pending/approved/review-required payment or any preparation forces review.

do $preflight$
begin
  if to_regprocedure('public.confirm_checkout(uuid,jsonb,integer,numeric,uuid)') is null
     or to_regprocedure('greenbel_private.release_order_core(uuid,text,text)') is null
     or to_regclass('public.service_cases') is null
     or to_regprocedure('public.request_order_cancellation(uuid,text,text)') is null then
    raise exception 'Confirmed direct cancellation requires verified checkout and service cases';
  end if;
  if to_regprocedure('public.cancel_unprepared_confirmed_order(uuid,text,text)') is not null then
    raise exception 'Direct confirmed cancellation already exists; audit before applying';
  end if;
  if exists (select 1 from public.service_cases where intake_path='direct_confirmed') then
    raise exception 'Unexpected direct_confirmed cases before migration';
  end if;
end
$preflight$;

alter table public.service_cases drop constraint service_cases_intake_check;
alter table public.service_cases add constraint service_cases_intake_check check (
  intake_path in ('direct_draft','direct_confirmed','customer_request','staff_manual')
);
alter table public.service_cases drop constraint service_cases_path_kind_check;
alter table public.service_cases add constraint service_cases_path_kind_check check (
  (intake_path in ('direct_draft','direct_confirmed') and kind='cancellation' and status='closed')
  or (intake_path='customer_request' and kind='cancellation')
  or intake_path='staff_manual'
);

-- Keep the evidence check next to the existing 005 case guard. The command
-- changes stage and closes the reservation in the same transaction.
create function greenbel_private.guard_direct_confirmed_case()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if new.intake_path='direct_confirmed' and (
    new.kind <> 'cancellation' or new.status <> 'closed'
    or not exists (select 1 from public.orders o
      where o.id=new.order_id and o.stage='cancelled' and o.confirmation_key is not null)
    or not exists (select 1 from public.inventory_operations io
      where io.order_id=new.order_id and io.kind='release'
        and io.idempotency_key='direct-confirmed-release:'||new.idempotency_key)
  ) then
    raise exception 'Direct confirmed case requires cancelled order and reservation release'
      using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger service_cases_direct_confirmed_guard before insert or update on public.service_cases
for each row execute function greenbel_private.guard_direct_confirmed_case();
revoke all on function greenbel_private.guard_direct_confirmed_case()
  from public,anon,authenticated,service_role;

create function public.cancel_unprepared_confirmed_order(
  p_order_id uuid, p_reason text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_existing public.service_cases%rowtype;
  v_case_id uuid;
  v_release_id uuid;
  v_reason text := btrim(coalesce(p_reason,''));
  v_item_count integer;
  v_active_count integer;
begin
  if v_actor is null or p_order_id is null
     or char_length(v_reason) not between 1 and 2000
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 160 then
    raise exception 'Authenticated customer, order, reason and key required'
      using errcode='22023';
  end if;
  if not exists (select 1 from public.profiles where id=v_actor and active) then
    raise exception 'Active customer profile required' using errcode='42501';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.customer_id is distinct from v_actor then
    raise exception 'Customer does not own order' using errcode='42501';
  end if;
  select * into v_existing from public.service_cases
  where idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.order_id is distinct from p_order_id
       or v_existing.kind is distinct from 'cancellation'
       or v_existing.intake_path is distinct from 'direct_confirmed'
       or v_existing.requested_by is distinct from v_actor
       or v_existing.reason is distinct from v_reason
       or v_order.stage <> 'cancelled'
       or not exists (select 1 from public.inventory_operations io
         where io.order_id=p_order_id and io.kind='release'
           and io.idempotency_key='direct-confirmed-release:'||p_idempotency_key) then
      raise exception 'Cancellation key reused or evidence changed' using errcode='23505';
    end if;
    return v_existing.id;
  end if;
  if v_order.stage <> 'confirmed' or v_order.confirmation_key is null
     or exists (select 1 from public.shipments where order_id=p_order_id)
     or exists (select 1 from public.payments where order_id=p_order_id
       and status in ('test_created','test_succeeded','test_review_required'))
     or exists (select 1 from public.service_cases where order_id=p_order_id
       and kind='cancellation' and status in ('requested','in_review'))
     or exists (select 1 from public.inventory_movements im
       join public.order_items oi on oi.id=im.order_item_id
       where oi.order_id=p_order_id) then
    raise exception 'Payment or preparation review required before cancellation'
      using errcode='P0001';
  end if;
  select count(*) into v_item_count from public.order_items where order_id=p_order_id;
  select count(*) into v_active_count from public.stock_reservations sr
    join public.order_items oi on oi.id=sr.order_item_id
    where oi.order_id=p_order_id and sr.status='active';
  if v_item_count=0 or v_item_count<>v_active_count then
    raise exception 'Reservation requires staff review' using errcode='P0001';
  end if;

  update public.orders set stage='cancelled',version=version+1 where id=p_order_id;
  v_release_id := greenbel_private.release_order_core(
    p_order_id,'direct-confirmed-release:'||p_idempotency_key,
    'Customer cancelled before payment and preparation');
  insert into public.service_cases (
    order_id,kind,status,intake_path,reason,requested_by,created_by,
    resolution,closed_at,idempotency_key
  ) values (
    p_order_id,'cancellation','closed','direct_confirmed',v_reason,v_actor,v_actor,
    'Pedido cancelado antes de preparación y cobro; reserva liberada',
    clock_timestamp(),p_idempotency_key
  ) returning id into v_case_id;
  insert into public.audit_events (
    actor_id,entity_type,entity_id,action,changes,correlation_key
  ) values (
    v_actor,'order',p_order_id,'direct_confirmed_cancellation',
    jsonb_build_object('caseId',v_case_id,'releaseOperationId',v_release_id),
    p_idempotency_key
  );
  return v_case_id;
end;
$$;
revoke all on function public.cancel_unprepared_confirmed_order(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.cancel_unprepared_confirmed_order(uuid,text,text)
  to authenticated;

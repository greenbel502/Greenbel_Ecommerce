-- DEV technical correction to PAG-03/PAG-06 and the approved preparation rule.
-- 016 allowed a fresh online reservation to start preparation. Payment must
-- instead be server-confirmed and its reserved stock consumed before any
-- online shipment starts or advances. Offline/COD operations keep 012's flow.
-- Apply only after linked DEV and migration history 001-019 are checked.

do $preflight$
begin
  if to_regprocedure('greenbel_private.guard_online_shipment_preparation()') is null
     or to_regprocedure('public.record_staff_shipment_event(uuid,text,text,text,text,text)') is null
     or to_regclass('public.dev_payment_events') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid='public.shipments'::regclass
         and tgname='shipments_online_preparation_guard' and not tgisinternal
     ) then
    raise exception 'Reviewed staff, simulator and online shipment guards are required';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgrelid='public.shipments'::regclass
      and tgname='shipments_online_preparation_guard'
      and (tgtype::integer & 16) <> 0
  ) then
    raise exception 'Online preparation UPDATE guard already exists; audit DEV history';
  end if;
end
$preflight$;

-- This guard also applies to UPDATE so shipments prepared under the earlier
-- policy cannot advance while payment remains pending. Cancellation remains
-- possible as a de-escalation; no historical row is modified by this DDL.
create or replace function greenbel_private.guard_online_shipment_preparation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_items integer;
  v_consumed integer;
  v_active integer;
begin
  select * into v_order from public.orders where id=new.order_id for share;
  if not found then raise exception 'Order does not exist'; end if;
  if v_order.payment_method_snapshot->>'method' is distinct from 'online_gateway' then
    return new;
  end if;
  if tg_op='UPDATE' and new.status='cancelled' then
    return new;
  end if;
  if v_order.payment_method_snapshot->>'testMode' is distinct from 'true'
     or exists (
       select 1 from public.payments p
       where p.order_id=v_order.id and p.method='online_gateway'
         and p.test_mode and p.status='test_review_required'
     ) then
    raise exception 'Online payment requires manual reconciliation'
      using errcode='P0001';
  end if;
  if not exists (
    select 1 from public.payments p
    where p.order_id=v_order.id and p.method='online_gateway'
      and p.test_mode and p.status='test_succeeded'
      and p.amount=v_order.amount_due_greenbel
      and p.currency=v_order.currency
  ) then
    raise exception 'Online payment must be confirmed before preparation'
      using errcode='P0001';
  end if;
  select count(*) into v_items from public.order_items
  where order_id=v_order.id;
  select count(*) into v_consumed from public.stock_reservations sr
    join public.order_items oi on oi.id=sr.order_item_id
  where oi.order_id=v_order.id and sr.status='consumed';
  select count(*) into v_active from public.stock_reservations sr
    join public.order_items oi on oi.id=sr.order_item_id
  where oi.order_id=v_order.id and sr.status='active';
  if v_items=0 or v_items<>v_consumed or v_active<>0
     or exists (
       select 1 from public.order_items oi where oi.order_id=v_order.id
         and (select count(*) from public.stock_reservations sr
              where sr.order_item_id=oi.id and sr.status='consumed'
                and sr.quantity=oi.quantity)<>1
     ) then
    raise exception 'Online payment has not consumed the complete reservation'
      using errcode='P0001';
  end if;
  return new;
end;
$$;

drop trigger shipments_online_preparation_guard on public.shipments;
create trigger shipments_online_preparation_guard
before insert or update on public.shipments
for each row execute function greenbel_private.guard_online_shipment_preparation();

revoke all on function greenbel_private.guard_online_shipment_preparation()
  from public,anon,authenticated,service_role;
comment on function greenbel_private.guard_online_shipment_preparation() is
  'Online shipment preparation and subsequent advances require exact successful DEV payment and consumed stock; pending/review-required payment blocks. COD is unchanged.';

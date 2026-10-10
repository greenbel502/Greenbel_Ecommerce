-- REVIEW ONLY: a confirmed online order may start preparation before the
-- simulated payment only while every inventory reservation is still valid.
-- Any test_review_required event blocks preparation until manual resolution.
-- This is an additional INSERT guard; 012's dispatch/delivery checks remain.
-- Apply only to linked DEV after reviewing history through 015.

do $preflight$
declare
  v_online_shipments integer;
  v_review_required integer;
  v_invalid_state integer;
  v_checked_at timestamptz := clock_timestamp();
begin
  if to_regclass('public.shipments') is null
     or to_regclass('public.stock_reservations') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.dev_payment_events') is null
     or to_regprocedure('public.record_staff_shipment_event(uuid,text,text,text,text,text)') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid='public.shipments'::regclass
         and tgname='shipments_guard' and not tgisinternal
     ) then raise exception 'Reviewed online payment and shipment guards required'; end if;
  if to_regprocedure('greenbel_private.guard_online_shipment_preparation()') is not null
     or exists (
       select 1 from pg_trigger
       where tgrelid='public.shipments'::regclass
         and tgname='shipments_online_preparation_guard' and not tgisinternal
     ) then raise exception 'Online preparation guard already exists; audit DEV history'; end if;

  select count(*) into v_online_shipments from public.shipments sh
    join public.orders o on o.id=sh.order_id
  where o.payment_method_snapshot->>'method'='online_gateway';
  select count(*) into v_review_required from public.shipments sh
    join public.orders o on o.id=sh.order_id
  where o.payment_method_snapshot->>'method'='online_gateway'
    and exists (select 1 from public.payments p where p.order_id=o.id
      and p.method='online_gateway' and p.test_mode and p.status='test_review_required');
  select count(*) into v_invalid_state from public.shipments sh
    join public.orders o on o.id=sh.order_id
  where o.payment_method_snapshot->>'method'='online_gateway'
    and (
      not exists (select 1 from public.order_items oi where oi.order_id=o.id)
      or exists (select 1 from public.payments p where p.order_id=o.id
        and p.method='online_gateway' and p.test_mode and p.status='test_review_required')
      or
      (exists (select 1 from public.payments p where p.order_id=o.id
          and p.method='online_gateway' and p.test_mode and p.status='test_succeeded'
          and p.amount=o.amount_due_greenbel)
        and (exists (select 1 from public.stock_reservations sr
              join public.order_items oi on oi.id=sr.order_item_id
              where oi.order_id=o.id and sr.status='active')
          or exists (select 1 from public.order_items oi where oi.order_id=o.id
              and (select count(*) from public.stock_reservations sr
                where sr.order_item_id=oi.id and sr.status='consumed'
                  and sr.quantity=oi.quantity)<>1)))
      or
      (not exists (select 1 from public.payments p where p.order_id=o.id
          and p.method='online_gateway' and p.test_mode and p.status='test_succeeded'
          and p.amount=o.amount_due_greenbel)
        and (exists (select 1 from public.stock_reservations sr
              join public.order_items oi on oi.id=sr.order_item_id
              where oi.order_id=o.id and sr.status='consumed')
          or exists (select 1 from public.order_items oi where oi.order_id=o.id
              and (select count(*) from public.stock_reservations sr
                where sr.order_item_id=oi.id and sr.status='active'
                  and sr.quantity=oi.quantity
                  and sr.expires_at is not null and sr.expires_at>v_checked_at)<>1)))
    );
  raise notice 'Existing online shipments: %, review-required: %, invalid payment/reservation state: %',
    v_online_shipments,v_review_required,v_invalid_state;
end
$preflight$;

create function greenbel_private.guard_online_shipment_preparation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_items integer;
  v_valid_active integer;
  v_active_total integer;
  v_consumed integer;
  v_paid boolean;
  v_review_required boolean;
  v_checked_at timestamptz;
begin
  select * into v_order from public.orders where id=new.order_id for share;
  if not found then raise exception 'Order does not exist'; end if;
  if v_order.payment_method_snapshot->>'method' is distinct from 'online_gateway' then
    return new;
  end if;
  v_checked_at := clock_timestamp();
  select exists (
    select 1 from public.payments p
    where p.order_id=v_order.id and p.method='online_gateway'
      and p.test_mode and p.status='test_review_required'
  ) into v_review_required;
  if v_review_required then
    raise exception 'Online test payment requires manual reconciliation';
  end if;
  select exists (
    select 1 from public.payments p
    where p.order_id=v_order.id and p.method='online_gateway'
      and p.test_mode and p.status='test_succeeded'
      and p.amount=v_order.amount_due_greenbel
  ) into v_paid;
  select count(*) into v_items from public.order_items
  where order_id=v_order.id;
  select count(*) into v_valid_active from public.stock_reservations sr
    join public.order_items oi on oi.id=sr.order_item_id
  where oi.order_id=v_order.id and sr.status='active'
    and sr.expires_at is not null and sr.expires_at>v_checked_at;
  select count(*) into v_active_total from public.stock_reservations sr
    join public.order_items oi on oi.id=sr.order_item_id
  where oi.order_id=v_order.id and sr.status='active';
  select count(*) into v_consumed from public.stock_reservations sr
    join public.order_items oi on oi.id=sr.order_item_id
  where oi.order_id=v_order.id and sr.status='consumed';
  if v_items=0
     or (v_paid and (v_items<>v_consumed or v_active_total<>0
       or exists (select 1 from public.order_items oi where oi.order_id=v_order.id
         and (select count(*) from public.stock_reservations sr
           where sr.order_item_id=oi.id and sr.status='consumed'
             and sr.quantity=oi.quantity)<>1)))
     or (not v_paid and (v_items<>v_valid_active or v_consumed<>0
       or exists (select 1 from public.order_items oi where oi.order_id=v_order.id
         and (select count(*) from public.stock_reservations sr
           where sr.order_item_id=oi.id and sr.status='active'
             and sr.quantity=oi.quantity
             and sr.expires_at is not null and sr.expires_at>v_checked_at)<>1))) then
    raise exception 'Online order lacks verified payment or an unexpired full reservation';
  end if;
  return new;
end;
$$;

create trigger shipments_online_preparation_guard
before insert on public.shipments
for each row execute function greenbel_private.guard_online_shipment_preparation();

revoke all on function greenbel_private.guard_online_shipment_preparation()
  from public,anon,authenticated,service_role;

comment on function greenbel_private.guard_online_shipment_preparation() is
  'Online preparation requires either every reservation unexpired before payment, or server-verified successful test payment with stock consumed; review-required events always block.';

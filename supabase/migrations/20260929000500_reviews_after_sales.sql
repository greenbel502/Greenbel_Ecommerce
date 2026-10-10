-- GreenBel block 5: delivered-purchase reviews and manual after-sales records.
-- Requires catalog (001), orders/inventory (002), and delivery/test payments (004).
-- No refund, return-to-stock, warranty decision, or real payment is executed here.
-- Checkout remains blocked by orders_checkout_gate_pending.

do $preflight$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'GreenBel after-sales block requires PostgreSQL 15+';
  end if;
  if to_regclass('public.products') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.orders') is null
     or to_regclass('public.shipments') is null
     or to_regclass('public.payments') is null
     or to_regclass('public.stock_reservations') is null
     or to_regnamespace('greenbel_private') is null then
    raise exception 'Apply and verify GreenBel catalog, order and delivery blocks first';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_checkout_gate_pending'
  ) then
    raise exception 'Checkout gate is missing; audit order history before after-sales block';
  end if;
  if to_regclass('public.reviews') is not null
     or to_regclass('public.service_cases') is not null
     or to_regclass('public.service_case_items') is not null
     or to_regclass('public.refunds') is not null
     or to_regclass('public.audit_events') is not null
     or to_regprocedure('public.cancel_unprepared_draft_order(uuid,text,text)') is not null
     or to_regprocedure('public.register_manual_service_case(uuid,text,text,jsonb,text)') is not null
     or to_regprocedure('public.register_refund_request(uuid,text,text)') is not null then
    raise exception 'After-sales objects already exist; audit history and data';
  end if;
end
$preflight$;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  rating smallint not null,
  comment text not null,
  moderation_status text not null default 'pending',
  moderation_reason text,
  moderated_by uuid references public.profiles(id) on delete restrict,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_rating_check check (rating between 1 and 5),
  constraint reviews_comment_check check (char_length(btrim(comment)) between 1 and 3000),
  constraint reviews_status_check check (moderation_status in ('pending','visible','hidden')),
  constraint reviews_moderation_check check (
    (moderation_status = 'pending' and moderation_reason is null
      and moderated_by is null and moderated_at is null)
    or (moderation_status = 'visible' and moderation_reason is null
      and moderated_by is not null and moderated_at is not null)
    or (moderation_status = 'hidden'
      and moderation_reason in ('spam','personal_data','offensive_content')
      and moderated_by is not null and moderated_at is not null)
  )
);
create index reviews_product_visible_idx on public.reviews (product_id,created_at desc)
  where moderation_status = 'visible';
create index reviews_customer_created_idx on public.reviews (customer_id,created_at desc);
create index reviews_order_item_idx on public.reviews (order_item_id);
comment on table public.reviews is
  'No customer/product uniqueness or review editing rule is assumed. A negative rating alone cannot be a moderation reason.';

create table public.service_cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  kind text not null,
  status text not null default 'requested',
  intake_path text not null,
  reason text not null,
  requested_by uuid references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  handled_by uuid references public.profiles(id) on delete restrict,
  resolution text,
  closed_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_cases_kind_check check (kind in ('cancellation','return','warranty')),
  constraint service_cases_status_check check (
    status in ('requested','in_review','resolved','rejected','closed')
  ),
  constraint service_cases_intake_check check (
    intake_path in ('direct_draft','customer_request','staff_manual')
  ),
  constraint service_cases_path_kind_check check (
    (intake_path = 'direct_draft' and kind = 'cancellation' and status = 'closed')
    or (intake_path = 'customer_request' and kind = 'cancellation')
    or (intake_path = 'staff_manual')
  ),
  constraint service_cases_reason_check check (char_length(btrim(reason)) between 1 and 2000),
  constraint service_cases_resolution_check check (
    resolution is null or char_length(btrim(resolution)) between 1 and 3000
  ),
  constraint service_cases_key_check check (char_length(btrim(idempotency_key)) between 1 and 200),
  constraint service_cases_closed_check check (
    (status = 'closed' and closed_at is not null and resolution is not null)
    or (status <> 'closed' and closed_at is null)
  )
);
create index service_cases_order_created_idx on public.service_cases (order_id,created_at desc);
create index service_cases_status_created_idx on public.service_cases (status,created_at desc);
create unique index service_cases_one_open_cancellation_uq on public.service_cases (order_id)
  where kind = 'cancellation' and status in ('requested','in_review');

create table public.service_case_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.service_cases(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity numeric(14,3) not null,
  received_at timestamptz,
  inspection_result text,
  restocked_quantity numeric(14,3) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_case_items_pair_uq unique (case_id,order_item_id),
  constraint service_case_items_quantity_check check (quantity > 0),
  constraint service_case_items_inspection_check check (
    inspection_result is null or inspection_result in ('pending','accepted','rejected')
  ),
  constraint service_case_items_received_check check (
    inspection_result not in ('accepted','rejected') or received_at is not null
  ),
  constraint service_case_items_restock_gate check (restocked_quantity = 0),
  constraint service_case_items_notes_check check (
    notes is null or char_length(btrim(notes)) between 1 and 2000
  )
);
create index service_case_items_order_item_idx on public.service_case_items (order_item_id);
comment on constraint service_case_items_restock_gate on public.service_case_items is
  'No returned stock is made available until a later audited restock command enforces receipt, inspection and cumulative cap.';

-- A refund row is a request/assessment record, not proof that money moved.
-- Authorization, real payment links, refund execution and policy remain later work.
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.service_cases(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  requested_amount numeric(14,2),
  currency char(3) not null default 'GTQ',
  status text not null default 'requested',
  reason text not null,
  idempotency_key text not null unique,
  handled_by uuid references public.profiles(id) on delete restrict,
  resolution text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refunds_amount_check check (requested_amount is null or requested_amount > 0),
  constraint refunds_currency_check check (btrim(currency) = 'GTQ'),
  constraint refunds_status_gate check (status in ('requested','in_review','rejected')),
  constraint refunds_no_confirmed_money_check check (confirmed_at is null),
  constraint refunds_reason_check check (char_length(btrim(reason)) between 1 and 2000),
  constraint refunds_key_check check (char_length(btrim(idempotency_key)) between 1 and 200),
  constraint refunds_resolution_check check (
    resolution is null or char_length(btrim(resolution)) between 1 and 3000
  )
);
create index refunds_case_idx on public.refunds (case_id,created_at desc);
create index refunds_payment_idx on public.refunds (payment_id) where payment_id is not null;
comment on table public.refunds is
  'Only request/review/rejection records. No status implies a refund was paid in this block.';

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  correlation_key text,
  created_at timestamptz not null default now(),
  constraint audit_events_entity_check check (char_length(btrim(entity_type)) between 1 and 100),
  constraint audit_events_action_check check (char_length(btrim(action)) between 1 and 100),
  constraint audit_events_changes_check check (jsonb_typeof(changes) = 'object'),
  constraint audit_events_correlation_check check (
    correlation_key is null or char_length(btrim(correlation_key)) between 1 and 200
  )
);
create index audit_events_entity_created_idx on public.audit_events (entity_type,entity_id,created_at desc);
comment on table public.audit_events is
  'Append-only metadata. Server must omit secrets and unnecessary personal data; no automatic payload capture.';

create trigger reviews_touch_updated_at before update on public.reviews
for each row execute function greenbel_private.touch_updated_at();
create trigger service_cases_touch_updated_at before update on public.service_cases
for each row execute function greenbel_private.touch_updated_at();
create trigger service_case_items_touch_updated_at before update on public.service_case_items
for each row execute function greenbel_private.touch_updated_at();
create trigger refunds_touch_updated_at before update on public.refunds
for each row execute function greenbel_private.touch_updated_at();

create function greenbel_private.guard_review()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_product uuid;
  v_customer uuid;
  v_delivered_at timestamptz;
begin
  if tg_op = 'INSERT' then
    select oi.product_id, o.customer_id, sh.delivered_at
      into v_product, v_customer, v_delivered_at
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.shipments sh on sh.order_id = o.id
    where oi.id = new.order_item_id
    for share of oi, o, sh;
    if not found or v_delivered_at is null
       or v_product is distinct from new.product_id
       or v_customer is distinct from new.customer_id then
      raise exception 'Review requires this customer, product and delivered order line';
    end if;
    if new.moderation_status <> 'pending' then
      raise exception 'Review must enter moderation as pending';
    end if;
  else
    if new.customer_id is distinct from old.customer_id
       or new.product_id is distinct from old.product_id
       or new.order_item_id is distinct from old.order_item_id
       or new.rating is distinct from old.rating
       or new.comment is distinct from old.comment
       or new.created_at is distinct from old.created_at then
      raise exception 'Review content and purchase link are immutable';
    end if;
    if old.moderation_status <> new.moderation_status
       or old.moderation_reason is distinct from new.moderation_reason
       or old.moderated_by is distinct from new.moderated_by
       or old.moderated_at is distinct from new.moderated_at then
      if new.moderation_status = 'pending' or not exists (
        select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
        where ur.user_id = new.moderated_by and ur.role = 'admin' and pr.active
      ) then
        raise exception 'Only active admin can publish or hide a review';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger reviews_guard before insert or update on public.reviews
for each row execute function greenbel_private.guard_review();

create function greenbel_private.guard_service_case()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_customer uuid;
  v_stage text;
  v_created_by_staff boolean;
begin
  select customer_id,stage into v_customer,v_stage
  from public.orders where id = new.order_id for share;
  if not found then raise exception 'Case order does not exist'; end if;
  select exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = new.created_by and ur.role in ('operator','admin') and pr.active
  ) into v_created_by_staff;
  if new.intake_path = 'staff_manual' then
    if not v_created_by_staff then raise exception 'Manual case requires active staff'; end if;
  elsif new.created_by is distinct from v_customer
     or new.requested_by is distinct from v_customer then
    raise exception 'Customer case actor must own the order';
  end if;
  if new.intake_path = 'direct_draft' and v_stage <> 'cancelled' then
    raise exception 'Direct draft cancellation must cancel the order atomically';
  end if;
  if tg_op = 'INSERT' and new.intake_path = 'customer_request'
     and v_stage not in ('confirmed','completed') then
    raise exception 'Confirmed order required for cancellation review request';
  end if;
  if tg_op = 'INSERT' and new.kind in ('return','warranty')
     and (new.intake_path <> 'staff_manual' or v_stage not in ('confirmed','completed')
       or not exists (
         select 1 from public.shipments sh where sh.order_id=new.order_id
           and (
             (new.kind = 'return'
               and sh.status in ('dispatched','delivered','returned')
               and (sh.dispatched_at is not null or sh.delivered_at is not null))
             or (new.kind = 'warranty'
               and sh.status in ('delivered','returned')
               and sh.delivered_at is not null)
           )
       )) then
    raise exception 'Manual return requires dispatch/handover; warranty requires delivered purchase';
  end if;
  if new.handled_by is not null and not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = new.handled_by and ur.role in ('operator','admin') and pr.active
  ) then
    raise exception 'Case handler must be active staff';
  end if;
  if tg_op = 'UPDATE' then
    if new.order_id is distinct from old.order_id
       or new.kind is distinct from old.kind
       or new.intake_path is distinct from old.intake_path
       or new.reason is distinct from old.reason
       or new.requested_by is distinct from old.requested_by
       or new.created_by is distinct from old.created_by
       or new.idempotency_key is distinct from old.idempotency_key
       or new.created_at is distinct from old.created_at then
      raise exception 'Case identity and original request are immutable';
    end if;
    if old.status in ('closed','rejected')
       and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'Closed or rejected case is immutable';
    end if;
  end if;
  return new;
end;
$$;
create trigger service_cases_guard before insert or update on public.service_cases
for each row execute function greenbel_private.guard_service_case();

create function greenbel_private.guard_service_case_item()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_case_order uuid;
  v_item_order uuid;
  v_item_quantity numeric(14,3);
  v_fractional boolean;
begin
  select order_id into v_case_order from public.service_cases where id = new.case_id for share;
  select oi.order_id,oi.quantity,p.allows_fractional
    into v_item_order,v_item_quantity,v_fractional
  from public.order_items oi join public.products p on p.id = oi.product_id
  where oi.id = new.order_item_id for share of oi,p;
  if v_case_order is null or v_item_order is distinct from v_case_order
     or new.quantity > v_item_quantity then
    raise exception 'Case item must belong to its order and not exceed purchased quantity';
  end if;
  if not v_fractional and new.quantity <> trunc(new.quantity) then
    raise exception 'Case item requires whole units';
  end if;
  if tg_op = 'UPDATE' and (
    new.case_id is distinct from old.case_id
    or new.order_item_id is distinct from old.order_item_id
    or new.quantity is distinct from old.quantity
  ) then
    raise exception 'Case line identity and claimed quantity are immutable';
  end if;
  return new;
end;
$$;
create trigger service_case_items_guard before insert or update on public.service_case_items
for each row execute function greenbel_private.guard_service_case_item();

create function greenbel_private.guard_refund_request()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_case public.service_cases%rowtype;
  v_payment_order uuid;
begin
  select * into v_case from public.service_cases where id = new.case_id for share;
  if not found or v_case.kind not in ('cancellation','return')
     or v_case.intake_path = 'direct_draft' then
    raise exception 'Refund request must be tied to cancellation or return case';
  end if;
  if new.payment_id is not null then
    select order_id into v_payment_order from public.payments where id = new.payment_id;
    if v_payment_order is distinct from v_case.order_id then
      raise exception 'Refund payment belongs to another order';
    end if;
  end if;
  if new.handled_by is not null and not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = new.handled_by and ur.role = 'admin' and pr.active
  ) then
    raise exception 'Refund review handler must be active admin';
  end if;
  if new.status in ('in_review','rejected') and new.handled_by is null then
    raise exception 'Refund review requires assigned admin';
  end if;
  if new.status = 'rejected' and new.resolution is null then
    raise exception 'Refund rejection requires a reason';
  end if;
  if tg_op = 'UPDATE' then
    if new.case_id is distinct from old.case_id
       or new.payment_id is distinct from old.payment_id
       or new.requested_amount is distinct from old.requested_amount
       or new.currency is distinct from old.currency
       or new.reason is distinct from old.reason
       or new.idempotency_key is distinct from old.idempotency_key
       or new.created_at is distinct from old.created_at then
      raise exception 'Refund request identity and amount are immutable';
    end if;
    if old.status = 'rejected'
       and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'Rejected refund request is immutable';
    end if;
  end if;
  return new;
end;
$$;
create trigger refunds_guard before insert or update on public.refunds
for each row execute function greenbel_private.guard_refund_request();

create trigger audit_events_immutable before update or delete on public.audit_events
for each row execute function greenbel_private.reject_immutable_change();

-- This is deliberately limited to unprepared, unpaid draft/pending-shipping
-- orders while checkout is closed. CAN-01 for confirmed orders needs a later
-- payment/inventory-aware command; this function does not pretend to cover it.
create function public.cancel_unprepared_draft_order(
  p_order_id uuid, p_reason text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_existing public.service_cases%rowtype;
  v_case_id uuid;
begin
  if v_actor is null or p_order_id is null
     or char_length(btrim(coalesce(p_reason,''))) not between 1 and 2000
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 200 then
    raise exception 'Authenticated customer, order, reason and key required' using errcode='42501';
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
       or v_existing.intake_path is distinct from 'direct_draft'
       or v_existing.requested_by is distinct from v_actor
       or v_existing.reason is distinct from btrim(p_reason) then
      raise exception 'Cancellation idempotency key reused with different input';
    end if;
    return v_existing.id;
  end if;
  if v_order.stage not in ('draft','pending_shipping')
     or exists (select 1 from public.shipments sh where sh.order_id=p_order_id)
     or exists (select 1 from public.payments pa
       where pa.order_id=p_order_id and pa.status='test_succeeded')
     or exists (
       select 1 from public.stock_reservations sr
       join public.order_items oi on oi.id=sr.order_item_id
       where oi.order_id=p_order_id
     ) or exists (
       select 1 from public.inventory_movements im
       join public.order_items oi on oi.id=im.order_item_id
       where oi.order_id=p_order_id
     ) then
    raise exception 'Order requires payment, stock or preparation review before cancellation';
  end if;
  update public.orders set stage='cancelled' where id=p_order_id;
  insert into public.service_cases (
    order_id,kind,status,intake_path,reason,requested_by,created_by,
    resolution,closed_at,idempotency_key
  ) values (
    p_order_id,'cancellation','closed','direct_draft',btrim(p_reason),v_actor,v_actor,
    'Borrador cancelado antes de preparación',now(),p_idempotency_key
  ) returning id into v_case_id;
  return v_case_id;
end;
$$;
revoke all on function public.cancel_unprepared_draft_order(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_unprepared_draft_order(uuid,text,text) to authenticated;

create function public.request_order_cancellation(
  p_order_id uuid, p_reason text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_existing public.service_cases%rowtype;
  v_case_id uuid;
begin
  if v_actor is null or p_order_id is null
     or char_length(btrim(coalesce(p_reason,''))) not between 1 and 2000
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 200 then
    raise exception 'Authenticated customer, order, reason and key required' using errcode='42501';
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
       or v_existing.intake_path is distinct from 'customer_request'
       or v_existing.requested_by is distinct from v_actor
       or v_existing.reason is distinct from btrim(p_reason) then
      raise exception 'Cancellation idempotency key reused with different input';
    end if;
    return v_existing.id;
  end if;
  if v_order.stage not in ('confirmed','completed') then
    raise exception 'Cancellation review request requires confirmed order';
  end if;
  insert into public.service_cases (
    order_id,kind,status,intake_path,reason,requested_by,created_by,idempotency_key
  ) values (
    p_order_id,'cancellation','requested','customer_request',btrim(p_reason),
    v_actor,v_actor,p_idempotency_key
  ) returning id into v_case_id;
  return v_case_id;
end;
$$;
revoke all on function public.request_order_cancellation(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_order_cancellation(uuid,text,text) to authenticated;

-- One authenticated staff command records a manual case and its claimed
-- order lines atomically. It does not decide eligibility, return money or
-- make returned stock available. An order lock serializes same-order retries.
create function public.register_manual_service_case(
  p_order_id uuid, p_kind text, p_reason text, p_items jsonb, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_existing public.service_cases%rowtype;
  v_case_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_quantity numeric(14,3);
  v_purchased_quantity numeric(14,3);
  v_item_order uuid;
  v_fractional boolean;
  v_seen uuid[] := '{}'::uuid[];
  v_requested_items jsonb := '[]'::jsonb;
  v_existing_items jsonb;
begin
  if v_actor is null or p_order_id is null
     or not exists (
       select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
       where ur.user_id=v_actor and ur.role in ('operator','admin') and pr.active
     ) then
    raise exception 'Active staff session required' using errcode='42501';
  end if;
  if p_kind not in ('return','warranty')
     or char_length(btrim(coalesce(p_reason,''))) not between 1 and 2000
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 200
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Valid kind, reason, item lines and key required';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or v_item - array['order_item_id','quantity'] <> '{}'::jsonb
       or not (v_item ?& array['order_item_id','quantity']) then
      raise exception 'Case item requires only order_item_id and quantity';
    end if;
    v_item_id := (v_item->>'order_item_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric(14,3);
    if v_item_id is null or v_quantity is null or v_quantity <= 0
       or v_item_id = any(v_seen) then
      raise exception 'Invalid or repeated case item';
    end if;
    v_seen := array_append(v_seen,v_item_id);
    v_requested_items := v_requested_items || jsonb_build_array(
      jsonb_build_object('order_item_id',v_item_id,'quantity',v_quantity));
  end loop;
  select jsonb_agg(value order by value->>'order_item_id') into v_requested_items
    from jsonb_array_elements(v_requested_items);

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found' using errcode='42501'; end if;
  select * into v_existing from public.service_cases
    where idempotency_key=p_idempotency_key for update;
  if found then
    select coalesce(jsonb_agg(
      jsonb_build_object('order_item_id',sci.order_item_id,'quantity',sci.quantity)
      order by sci.order_item_id::text), '[]'::jsonb) into v_existing_items
    from public.service_case_items sci where sci.case_id=v_existing.id;
    if v_existing.order_id is distinct from p_order_id
       or v_existing.kind is distinct from p_kind
       or v_existing.intake_path is distinct from 'staff_manual'
       or v_existing.created_by is distinct from v_actor
       or v_existing.reason is distinct from btrim(p_reason)
       or v_existing_items is distinct from v_requested_items then
      raise exception 'Manual case idempotency key reused with different input';
    end if;
    return v_existing.id;
  end if;
  if v_order.stage not in ('confirmed','completed') then
    raise exception 'Manual case requires confirmed purchase';
  end if;

  -- Check every line before writing. The table trigger checks again on insert.
  for v_item in select value from jsonb_array_elements(v_requested_items) loop
    v_item_id := (v_item->>'order_item_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric(14,3);
    select oi.order_id,oi.quantity,p.allows_fractional
      into v_item_order,v_purchased_quantity,v_fractional
      from public.order_items oi join public.products p on p.id=oi.product_id
      where oi.id=v_item_id for share of oi,p;
    if not found or v_item_order is distinct from p_order_id
       or v_quantity > v_purchased_quantity
       or (not v_fractional and v_quantity <> trunc(v_quantity)) then
      raise exception 'Case item must be a valid quantity from this order';
    end if;
  end loop;

  insert into public.service_cases (
    order_id,kind,status,intake_path,reason,created_by,idempotency_key
  ) values (
    p_order_id,p_kind,'requested','staff_manual',btrim(p_reason),v_actor,p_idempotency_key
  ) returning id into v_case_id;
  for v_item in select value from jsonb_array_elements(v_requested_items) loop
    insert into public.service_case_items (case_id,order_item_id,quantity)
      values (v_case_id,(v_item->>'order_item_id')::uuid,(v_item->>'quantity')::numeric(14,3));
  end loop;
  insert into public.audit_events (actor_id,entity_type,entity_id,action,changes,correlation_key)
    values (v_actor,'service_case',v_case_id,'manual_case_registered',
      jsonb_build_object('kind',p_kind,'item_count',jsonb_array_length(v_requested_items)),
      p_idempotency_key);
  return v_case_id;
end;
$$;
revoke all on function public.register_manual_service_case(uuid,text,text,jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_manual_service_case(uuid,text,text,jsonb,text) to authenticated;
comment on function public.register_manual_service_case(uuid,text,text,jsonb,text) is
  'Staff intake only; no commercial decision, refund, inventory restock, or notification.';

-- An admin may record that a refund was requested for review. The row has no
-- amount or payment proof and cannot enter a money-confirmed state. This does
-- not determine whether the customer is entitled to a refund.
create function public.register_refund_request(
  p_case_id uuid, p_reason text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_case public.service_cases%rowtype;
  v_existing public.refunds%rowtype;
  v_refund_id uuid;
begin
  if v_actor is null or p_case_id is null or not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=v_actor and ur.role='admin' and pr.active
  ) then
    raise exception 'Active admin session required' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 1 and 2000
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 200 then
    raise exception 'Refund request reason and key required';
  end if;
  select * into v_case from public.service_cases where id=p_case_id for update;
  if not found or v_case.kind not in ('cancellation','return')
     or v_case.intake_path='direct_draft' then
    raise exception 'Refund request requires reviewable cancellation or return case';
  end if;
  select * into v_existing from public.refunds where idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.case_id is distinct from p_case_id
       or v_existing.reason is distinct from btrim(p_reason)
       or v_existing.requested_amount is not null
       or v_existing.payment_id is not null
       or not exists (
         select 1 from public.audit_events ae
         where ae.entity_type='refund' and ae.entity_id=v_existing.id
           and ae.action='refund_request_registered'
           and ae.actor_id=v_actor and ae.correlation_key=p_idempotency_key
       ) then
      raise exception 'Refund idempotency key reused with different input';
    end if;
    return v_existing.id;
  end if;
  insert into public.refunds (case_id,reason,idempotency_key)
    values (p_case_id,btrim(p_reason),p_idempotency_key)
    returning id into v_refund_id;
  insert into public.audit_events (actor_id,entity_type,entity_id,action,changes,correlation_key)
    values (v_actor,'refund',v_refund_id,'refund_request_registered',
      jsonb_build_object('case_id',p_case_id),p_idempotency_key);
  return v_refund_id;
end;
$$;
revoke all on function public.register_refund_request(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_refund_request(uuid,text,text) to authenticated;
comment on function public.register_refund_request(uuid,text,text) is
  'Admin intake of a review request only. No amount, payment link, approval, confirmed refund, or notification.';

alter table public.reviews enable row level security;
alter table public.service_cases enable row level security;
alter table public.service_case_items enable row level security;
alter table public.refunds enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.reviews,public.service_cases,public.service_case_items,
  public.refunds,public.audit_events from public,anon,authenticated,service_role;
grant select,insert,update on public.reviews,public.service_cases,
  public.service_case_items,public.refunds to service_role;
grant select,insert on public.audit_events to service_role;

grant select (id,product_id,rating,comment,moderation_status,created_at)
  on public.reviews to anon,authenticated;
create policy reviews_public_visible_read on public.reviews
  for select to anon,authenticated using (moderation_status='visible');
create policy reviews_customer_or_admin_read on public.reviews
  for select to authenticated using (
    customer_id = (select auth.uid())
    or exists (
      select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
      where ur.user_id=(select auth.uid()) and ur.role='admin' and pr.active
    )
  );

grant select on public.service_cases,public.service_case_items to authenticated;
create policy service_cases_owner_or_staff_read on public.service_cases
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id=order_id)
  );
create policy service_case_items_owner_or_staff_read on public.service_case_items
  for select to authenticated using (
    exists (select 1 from public.service_cases sc where sc.id=case_id)
  );

grant select (id,case_id,payment_id,requested_amount,currency,status,
  reason,resolution,created_at,updated_at)
  on public.refunds to authenticated;
create policy refunds_owner_or_admin_read on public.refunds
  for select to authenticated using (
    exists (
      select 1 from public.service_cases sc join public.orders o on o.id=sc.order_id
      where sc.id=case_id and o.customer_id=(select auth.uid())
    ) or exists (
      select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
      where ur.user_id=(select auth.uid()) and ur.role='admin' and pr.active
    )
  );

grant select on public.audit_events to authenticated;
create policy audit_events_admin_read on public.audit_events
  for select to authenticated using (exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id=ur.user_id
    where ur.user_id=(select auth.uid()) and ur.role='admin' and pr.active
  ));

revoke all on function greenbel_private.guard_review()
  from public,anon,authenticated,service_role;
revoke all on function greenbel_private.guard_service_case()
  from public,anon,authenticated,service_role;
revoke all on function greenbel_private.guard_service_case_item()
  from public,anon,authenticated,service_role;
revoke all on function greenbel_private.guard_refund_request()
  from public,anon,authenticated,service_role;

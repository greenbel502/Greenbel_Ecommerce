\set ON_ERROR_STOP on

-- Run after local 001, 002, 004 and 005 with Auth stubs. All fixtures roll back.
begin;
alter table public.orders drop constraint orders_checkout_gate_pending;

insert into auth.users(id) values
  ('11000000-0000-0000-0000-000000000001'),
  ('11000000-0000-0000-0000-000000000002'),
  ('11000000-0000-0000-0000-000000000003');
update public.user_roles set role='operator'
  where user_id='11000000-0000-0000-0000-000000000002';
update public.user_roles set role='admin'
  where user_id='11000000-0000-0000-0000-000000000003';
insert into public.categories(id,name,slug,active)
  values ('21000000-0000-0000-0000-000000000001','Categoría TEST','categoria-test-cases',true);
insert into public.products(id,sku,slug,name,kind,category_id,regular_price,currency,publication_status)
  values ('31000000-0000-0000-0000-000000000001','TEST-CASE','test-case-product',
    'Producto TEST','equipment','21000000-0000-0000-0000-000000000001',100,'GTQ','published');
insert into public.orders(id,reference,customer_id,idempotency_key) values
  ('41000000-0000-0000-0000-000000000001','TEST-CASE-1',
    '11000000-0000-0000-0000-000000000001','test-case-order-1'),
  ('41000000-0000-0000-0000-000000000002','TEST-CASE-2',
    '11000000-0000-0000-0000-000000000001','test-case-order-2');
insert into public.order_items(id,order_id,product_id,line_no,quantity) values
  ('51000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',1,2),
  ('51000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000002',
    '31000000-0000-0000-0000-000000000001',1,1);
update public.orders set stage='confirmed',confirmed_at=now()
  where id in ('41000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002');
insert into public.delivery_services(id,name,kind,active)
  values ('61000000-0000-0000-0000-000000000001','Mensajería TEST','own_delivery',true);
insert into public.delivery_zones(id,code,name,department,municipality,active)
  values ('71000000-0000-0000-0000-000000000001','TEST_CASES','Zona TEST',
    'Departamento TEST','Municipio TEST',true);
insert into public.shipments(id,order_id,service_id,zone_id) values
  ('81000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
do $$
declare denied boolean := false;
begin
  begin
    perform public.register_manual_service_case(
      '41000000-0000-0000-0000-000000000001','return','Retorno TEST',
      '[{"order_item_id":"51000000-0000-0000-0000-000000000001","quantity":1}]',
      'manual-case-too-early');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Return was registered before dispatch'; end if;
  denied := false;
  begin
    perform public.register_manual_service_case(
      '41000000-0000-0000-0000-000000000001','warranty','Garantía TEST',
      '[{"order_item_id":"51000000-0000-0000-0000-000000000001","quantity":1}]',
      'warranty-too-early');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Warranty was registered before delivery'; end if;
end $$;
reset role;
update public.shipments set status='dispatched',dispatched_at=now()
  where id='81000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
do $$
declare
  first_id uuid;
  again_id uuid;
  denied boolean := false;
begin
  first_id := public.register_manual_service_case(
    '41000000-0000-0000-0000-000000000001','return','Retorno TEST',
    '[{"order_item_id":"51000000-0000-0000-0000-000000000001","quantity":1}]',
    'manual-case-return');
  again_id := public.register_manual_service_case(
    '41000000-0000-0000-0000-000000000001','return','Retorno TEST',
    '[{"order_item_id":"51000000-0000-0000-0000-000000000001","quantity":1}]',
    'manual-case-return');
  if first_id is distinct from again_id then
    raise exception 'Retry duplicated manual case';
  end if;
  begin
    perform public.register_manual_service_case(
      '41000000-0000-0000-0000-000000000001','return','Retorno TEST',
      '[{"order_item_id":"51000000-0000-0000-0000-000000000001","quantity":2}]',
      'manual-case-return');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Changed idempotency payload was accepted'; end if;
  denied := false;
  begin
    perform public.register_manual_service_case(
      '41000000-0000-0000-0000-000000000001','return','Retorno TEST',
      '[{"order_item_id":"51000000-0000-0000-0000-000000000002","quantity":1}]',
      'manual-case-other-order-line');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Foreign order line was accepted'; end if;
  denied := false;
  begin
    perform public.register_manual_service_case(
      '41000000-0000-0000-0000-000000000001','warranty','Garantía TEST',
      '[{"order_item_id":"51000000-0000-0000-0000-000000000001","quantity":1}]',
      'warranty-before-delivery');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Warranty was accepted after dispatch only'; end if;
  if (select count(*) from public.service_cases where intake_path='staff_manual') <> 1
     or (select count(*) from public.service_case_items) <> 1
     or (select count(*) from public.refunds) <> 0
     or (select count(*) from public.inventory_movements) <> 0 then
    raise exception 'Manual case created duplicate/refund/stock side effect';
  end if;
end $$;
reset role;
update public.shipments set status='delivered',delivered_at=now()
  where id='81000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000003',true);
select public.register_manual_service_case(
  '41000000-0000-0000-0000-000000000001','warranty','Garantía TEST',
  '[{"order_item_id":"51000000-0000-0000-0000-000000000001","quantity":1}]',
  'manual-case-warranty');
do $$ begin
  if (select count(*) from public.service_cases where intake_path='staff_manual') <> 2
     or (select count(*) from public.audit_events where action='manual_case_registered') <> 2 then
    raise exception 'Delivered warranty or audit missing';
  end if;
end $$;
do $$
declare
  return_case uuid;
  warranty_case uuid;
  first_refund uuid;
  again_refund uuid;
  denied boolean := false;
begin
  select id into return_case from public.service_cases
    where idempotency_key='manual-case-return';
  select id into warranty_case from public.service_cases
    where idempotency_key='manual-case-warranty';
  first_refund := public.register_refund_request(
    return_case,'Cliente solicita evaluación de reembolso TEST','refund-request-test');
  again_refund := public.register_refund_request(
    return_case,'Cliente solicita evaluación de reembolso TEST','refund-request-test');
  if first_refund is distinct from again_refund then
    raise exception 'Refund request replay duplicated row';
  end if;
  begin
    perform public.register_refund_request(
      return_case,'Motivo distinto TEST','refund-request-test');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Changed refund key payload was accepted'; end if;
  denied := false;
  begin
    perform public.register_refund_request(
      warranty_case,'Reembolso de garantía TEST','warranty-refund-test');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Warranty refund request was accepted'; end if;
  if (select count(*) from public.refunds where status='requested'
      and requested_amount is null and payment_id is null) <> 1
     or (select count(*) from public.audit_events where action='refund_request_registered') <> 1
     or (select count(*) from public.payments) <> 0
     or (select count(*) from public.inventory_movements) <> 0 then
    raise exception 'Refund request implied money, stock, or duplicate effect';
  end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.refunds where confirmed_at is null and handled_by is null) <> 1 then
    raise exception 'Refund request implied confirmation or assigned reviewer';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
do $$
declare denied boolean := false;
begin
  begin
    perform public.register_refund_request(
      (select id from public.service_cases where idempotency_key='manual-case-return'),
      'Operador TEST','operator-refund-test');
  exception when insufficient_privilege then denied := true; end;
  if not denied or (select count(*) from public.refunds) <> 0 then
    raise exception 'Operator registered or read refund';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
do $$
declare denied boolean := false;
begin
  begin
    perform public.register_manual_service_case(
      '41000000-0000-0000-0000-000000000001','return','Cliente TEST',
      '[{"order_item_id":"51000000-0000-0000-0000-000000000001","quantity":1}]',
      'customer-manual-case');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Customer registered staff-only case'; end if;
  denied := false;
  begin
    perform public.register_refund_request(
      (select id from public.service_cases where idempotency_key='manual-case-return'),
      'Cliente TEST','customer-refund-test');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Customer registered admin-only refund request'; end if;
end $$;
reset role;
set local role anon;
do $$
declare denied boolean := false;
begin
  begin
    perform public.register_manual_service_case(
      '41000000-0000-0000-0000-000000000001','return','Anónimo TEST',
      '[{"order_item_id":"51000000-0000-0000-0000-000000000001","quantity":1}]',
      'anonymous-manual-case');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Anonymous actor registered staff-only case'; end if;
  denied := false;
  begin
    perform public.register_refund_request(
      '00000000-0000-0000-0000-000000000001','Anónimo TEST','anonymous-refund-test');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Anonymous actor registered admin-only refund request'; end if;
end $$;
reset role;

select 'PASS manual cases/refund requests, Auth, lines, idempotency and no money/stock effects' as result;
rollback;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.orders'::regclass
      and conname='orders_checkout_gate_pending')
     or (select count(*) from public.service_cases) <> 0
     or (select count(*) from public.audit_events) <> 0 then
    raise exception 'Local test rollback left cases or opened checkout';
  end if;
end $$;
select 'PASS rollback restored checkout gate and removed synthetic cases' as result;

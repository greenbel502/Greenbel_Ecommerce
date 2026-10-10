/** Read-only DEV schema check before checkout migrations; prints no row data or secrets. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ref = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
const url = process.env.DEV_SUPABASE_URL?.trim();
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const linked = readFileSync(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").trim();
assert.ok(process.env.APP_ENV === "DEV" && ref && url && token && linked === ref,
  "Selector, enlace y token DEV requeridos");
assert.equal(new URL(url).hostname, `${ref}.supabase.co`, "URL fuera de DEV");

const query = `
  select
    (select count(*) from supabase_migrations.schema_migrations) as migration_count,
    (select count(*) from public.orders where stage in ('confirmed','completed')) as confirmed_orders,
    (select count(*) from pg_constraint where conrelid='public.orders'::regclass
      and conname='orders_checkout_gate_pending') as checkout_gate_count,
    (to_regclass('public.checkout_settings') is not null)::int as settings_present,
    (to_regclass('public.checkout_review_requests') is not null)::int as reviews_present,
    (to_regprocedure('public.review_checkout(jsonb,uuid,uuid)') is not null)::int as review_rpc_present,
    (to_regprocedure('public.confirm_checkout(uuid,jsonb,integer,numeric,uuid)') is not null)::int as confirm_rpc_present,
    (to_regclass('public.dev_payment_events') is not null)::int as dev_payment_events_present,
    (to_regprocedure('public.create_dev_online_payment_attempt(uuid,uuid)') is not null)::int as dev_attempt_rpc_present,
    (to_regprocedure('public.record_dev_online_payment_event(uuid,uuid,text,text)') is not null)::int as dev_event_rpc_present,
    (to_regclass('greenbel_private.staff_order_operations') is not null)::int as staff_ops_present,
    (to_regprocedure('public.record_staff_shipment_event(uuid,text,text,text,text,text)') is not null)::int as staff_shipment_rpc_present,
    (to_regprocedure('public.record_staff_test_payment(uuid,text,text,text,text)') is not null)::int as staff_payment_rpc_present,
    (to_regprocedure('public.cancel_unprepared_confirmed_order(uuid,text,text)') is not null)::int as confirmed_cancel_rpc_present,
    (to_regprocedure('greenbel_private.require_active_reviewer()') is not null)::int as active_reviewer_guard_present,
    (to_regprocedure('public.set_user_access(uuid,text,boolean,text,boolean)') is not null)::int as user_access_rpc_present,
    (to_regprocedure('greenbel_private.guard_online_shipment_preparation()') is not null)::int as online_preparation_guard_present,
    (select count(*) from pg_trigger where tgrelid='public.shipments'::regclass
      and tgname='shipments_online_preparation_guard' and not tgisinternal) as online_preparation_trigger_count,
    (select pg_get_userbyid(proowner) from pg_proc
      where oid=to_regprocedure('greenbel_private.guard_online_shipment_preparation()')) as online_preparation_guard_owner,
    (select prosecdef::int from pg_proc
      where oid=to_regprocedure('greenbel_private.guard_online_shipment_preparation()')) as online_preparation_guard_definer,
    (select pg_get_userbyid(proowner) from pg_proc
      where oid='greenbel_private.guard_review()'::regprocedure) as review_guard_owner,
    (select prosecdef::int from pg_proc
      where oid='greenbel_private.guard_review()'::regprocedure) as review_guard_definer,
    (select proconfig from pg_proc
      where oid='greenbel_private.guard_review()'::regprocedure) as review_guard_config,
    (select relrowsecurity::int from pg_class where oid='public.dev_payment_events'::regclass) as dev_events_rls,
    has_function_privilege('service_role','public.create_dev_online_payment_attempt(uuid,uuid)','EXECUTE')::int as service_dev_attempt_execute,
    has_function_privilege('authenticated','public.create_dev_online_payment_attempt(uuid,uuid)','EXECUTE')::int as customer_dev_attempt_execute,
    has_function_privilege('anon','public.record_dev_online_payment_event(uuid,uuid,text,text)','EXECUTE')::int as anon_dev_event_execute,
    has_table_privilege('service_role','public.dev_payment_events','INSERT')::int as service_dev_event_insert,
    (select relrowsecurity::int from pg_class where oid='public.checkout_settings'::regclass) as settings_rls,
    (select relrowsecurity::int from pg_class where oid='public.checkout_review_requests'::regclass) as reviews_rls,
    has_function_privilege('authenticated','public.review_checkout(jsonb,uuid,uuid)','EXECUTE')::int as authenticated_review_execute,
    has_function_privilege('anon','public.review_checkout(jsonb,uuid,uuid)','EXECUTE')::int as anon_review_execute,
    has_function_privilege('authenticated','public.confirm_checkout(uuid,jsonb,integer,numeric,uuid)','EXECUTE')::int as authenticated_confirm_execute,
    has_function_privilege('anon','public.confirm_checkout(uuid,jsonb,integer,numeric,uuid)','EXECUTE')::int as anon_confirm_execute,
    has_table_privilege('service_role','public.orders','INSERT')::int as service_order_insert,
    has_table_privilege('service_role','public.orders','UPDATE')::int as service_order_update,
    has_table_privilege('service_role','public.order_items','INSERT')::int as service_item_insert,
    has_table_privilege('service_role','public.payments','INSERT')::int as service_payment_insert,
    has_table_privilege('service_role','public.shipments','INSERT')::int as service_shipment_insert,
    (select count(*) from public.orders) as orders_total,
    (select count(*) from public.payments) as payments_total,
    (select count(*) from public.shipments) as shipments_total,
    (select count(*) from public.stock_reservations where status='active') as active_reservations`;

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query/read-only`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }), signal: AbortSignal.timeout(25_000)
});
if (response.status !== 201) throw new Error(`DEV read-only query HTTP ${response.status}`);
const rows = await response.json();
assert.ok(Array.isArray(rows) && rows.length === 1, "Schema response unexpectedly shaped");
const row = rows[0];
console.log(JSON.stringify(row));

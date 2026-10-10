-- REVIEW ONLY: 005 review trigger uses SELECT ... FOR SHARE OF order_items,
-- orders and shipments. After 010 revokes direct UPDATE on order_items and
-- orders from service_role, an otherwise eligible delivered review fails with
-- 42501. The trigger must run with its trusted SQL owner's privileges while
-- keeping its existing purchase/delivery/owner validation intact.
-- Apply only to linked DEV after reviewed 013 and after rechecking history.

do $preflight$
begin
  if to_regprocedure('greenbel_private.guard_review()') is null
     or to_regclass('public.reviews') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.shipments') is null then
    raise exception 'Review guard or its dependent tables are missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.reviews'::regclass and tgname='reviews_guard' and not tgisinternal
  ) then raise exception 'Expected reviews guard trigger is missing'; end if;
end
$preflight$;

alter function greenbel_private.guard_review() security definer;
revoke all on function greenbel_private.guard_review()
  from public,anon,authenticated,service_role;

comment on function greenbel_private.guard_review() is
  'Trusted trigger validates purchase ownership and recorded delivery under row locks. It requires definer privileges after direct order/order_item UPDATE was revoked from service_role.';

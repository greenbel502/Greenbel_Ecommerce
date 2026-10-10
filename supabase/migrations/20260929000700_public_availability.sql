-- GreenBel block 7: minimal public availability projection.
-- Inventory quantities remain private. A missing balance is unverified,
-- not sold out; no stock row or amount is seeded by this migration.

do $preflight$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'GreenBel availability projection requires PostgreSQL 15+';
  end if;
  if to_regclass('public.products') is null
     or to_regclass('public.categories') is null
     or to_regclass('public.brands') is null
     or to_regclass('public.inventory_balances') is null then
    raise exception 'Apply and verify GreenBel catalog and inventory blocks first';
  end if;
  if to_regclass('public.product_availability') is not null then
    raise exception 'Availability projection already exists; audit migration history';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.inventory_balances'::regclass
      and relrowsecurity and not relforcerowsecurity
      and relowner = (select oid from pg_roles where rolname = current_user)
  ) then
    raise exception 'Migration owner must own RLS-enabled inventory balances without FORCE RLS';
  end if;
end
$preflight$;

-- This intentionally reads private balances as the migration/view owner and
-- exposes only two booleans after explicit publication/category/brand checks.
-- security_barrier keeps caller predicates from inspecting rows before those
-- visibility checks. The public API role never receives stock table access.
create view public.product_availability
with (security_barrier = true, security_invoker = false)
as
select
  p.id as product_id,
  (ib.product_id is not null) as verified,
  coalesce(ib.stock_balance > ib.reserved, false) as available
from public.products p
join public.categories c on c.id = p.category_id and c.active
left join public.brands b on b.id = p.brand_id
left join public.inventory_balances ib on ib.product_id = p.id
where p.publication_status = 'published'
  and (p.brand_id is null or b.active);

revoke all on public.product_availability from public, anon, authenticated, service_role;
grant select on public.product_availability to anon, authenticated, service_role;

comment on view public.product_availability is
  'Boolean public projection only: verified=false means no initialized balance; available=true means stock_balance > reserved. No quantity is exposed.';

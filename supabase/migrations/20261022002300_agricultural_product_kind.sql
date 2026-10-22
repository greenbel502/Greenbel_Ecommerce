-- Approved by user on 2026-10-22: a separate agricultural product type in DEV.
-- Additive value only. No new tables, RLS changes, grants, inventory or pricing changes.
-- Versioned for a later explicitly authorized PROD release; do not apply to PROD by inference.
begin;
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_kind_check') then
    raise exception 'Expected products kind constraint missing; inspect schema before migration';
  end if;
end;
$$;
alter table public.products drop constraint products_kind_check;
alter table public.products add constraint products_kind_check
  check (kind in ('equipment','part','accessory','agricultural'));
comment on column public.products.kind is
  'Catalog classification: equipment, part, accessory or agricultural. Compatibility remains exclusive to equipment and part.';
commit;

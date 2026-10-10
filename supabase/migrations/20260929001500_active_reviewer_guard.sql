-- REVIEW ONLY: keep the 005/014 ownership and delivery guard unchanged.
-- An authenticated account with an inactive profile cannot create a review.
-- Apply only to linked DEV after reviewing history through 014.

do $preflight$
begin
  if to_regclass('public.reviews') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('greenbel_private.guard_review()') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid='public.reviews'::regclass
         and tgname='reviews_guard' and not tgisinternal
     ) then raise exception 'Reviewed review guard and profile table required'; end if;
  if to_regprocedure('greenbel_private.require_active_reviewer()') is not null
     or exists (
       select 1 from pg_trigger
       where tgrelid='public.reviews'::regclass
         and tgname='reviews_active_profile_guard' and not tgisinternal
     ) then raise exception 'Active reviewer guard already exists; audit DEV history'; end if;
end
$preflight$;

create function greenbel_private.require_active_reviewer()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
  if not exists (
    select 1 from public.profiles
    where id=new.customer_id and active
  ) then
    raise exception 'Active customer profile required for review'
      using errcode='42501';
  end if;
  return new;
end;
$$;

create trigger reviews_active_profile_guard
before insert on public.reviews
for each row execute function greenbel_private.require_active_reviewer();

revoke all on function greenbel_private.require_active_reviewer()
  from public,anon,authenticated,service_role;

comment on function greenbel_private.require_active_reviewer() is
  'Additional review INSERT guard: inactive profiles cannot submit; the existing review guard still verifies delivered purchase ownership and moderation.';

-- GreenBel block 8: atomically choose the primary image for one product.
-- Requires catalog/media path rules (001/006) and audit_events (005).
-- Call with the authenticated admin session, not a service_role client.

do $preflight$
begin
  if to_regclass('public.products') is null
     or to_regclass('public.product_images') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.user_roles') is null
     or to_regclass('public.audit_events') is null then
    raise exception 'Apply and verify catalog, media and audit blocks first';
  end if;
  if to_regclass('public.product_images_one_primary_uq') is null
     or to_regclass('public.product_images_storage_path_uq') is null then
    raise exception 'Product image uniqueness rules are missing';
  end if;
  if to_regprocedure('public.set_product_primary_image(uuid,uuid,uuid)') is not null then
    raise exception 'Primary image command already exists; audit migration history';
  end if;
end
$preflight$;

create function public.set_product_primary_image(
  p_product_id uuid,
  p_image_id uuid,
  p_expected_primary_id uuid default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_previous uuid;
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id
    where ur.user_id = v_actor and ur.role = 'admin' and pr.active
  ) then
    raise exception 'Active administrator required' using errcode = '42501';
  end if;
  if p_product_id is null or p_image_id is null then
    raise exception 'Product and image are required';
  end if;

  -- Every caller changing one product takes this lock first. The unique
  -- partial index remains a final invariant against any other write path.
  perform 1 from public.products where id = p_product_id for update;
  if not found then raise exception 'Product is unavailable'; end if;
  perform 1 from public.product_images
  where id = p_image_id and product_id = p_product_id;
  if not found then raise exception 'Image does not belong to this product'; end if;

  select id into v_previous from public.product_images
  where product_id = p_product_id and is_primary for update;
  if v_previous is not distinct from p_image_id then
    return p_image_id; -- replay after a successful change; no duplicate audit
  end if;
  if v_previous is distinct from p_expected_primary_id then
    raise exception 'Primary image changed; reload before retrying' using errcode = 'P4090';
  end if;

  -- Clearing first avoids the immediate partial-unique-index conflict. Both
  -- writes and the audit insert commit or roll back together.
  if v_previous is not null then
    update public.product_images set is_primary = false where id = v_previous;
  end if;
  update public.product_images set is_primary = true
  where id = p_image_id and product_id = p_product_id;
  if not found then raise exception 'Primary image disappeared during update'; end if;

  insert into public.audit_events (actor_id,entity_type,entity_id,action,changes)
  values (
    v_actor,'product',p_product_id,'primary_image_changed',
    jsonb_build_object('previous_image_id',v_previous,'new_image_id',p_image_id)
  );
  return p_image_id;
end;
$$;

revoke all on function public.set_product_primary_image(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.set_product_primary_image(uuid,uuid,uuid)
  to authenticated;

comment on function public.set_product_primary_image(uuid,uuid,uuid) is
  'Admin Auth RPC. Lock product, verify image ownership, compare expected primary, change atomically, audit once. NULL expected means no prior primary.';

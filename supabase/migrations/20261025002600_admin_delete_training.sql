-- DEV: completion requested by the user after reviewing the concrete deletion proposal.
-- Adds one atomic operation over the approved 025 model. No table, FK or RLS changes.
do $preflight$
begin
  if to_regclass('public.trainings') is null
     or to_regclass('public.training_ratings') is null
     or to_regclass('public.training_products') is null
     or to_regclass('public.training_categories') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.user_roles') is null
     or to_regprocedure('public.admin_delete_training(uuid,text,uuid)') is not null then
    raise exception 'Training deletion prerequisites or migration state require review';
  end if;
end
$preflight$;

-- service_role has the existing table permissions; SECURITY INVOKER adds no bypass.
-- The web action obtains p_actor_id from Auth and authorizes admin before this call.
create function public.admin_delete_training(
  p_training_id uuid,
  p_expected_title text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $$
declare
  current_training public.trainings%rowtype;
  ratings_deleted bigint;
  products_unlinked bigint;
  categories_unlinked bigint;
begin
  if p_training_id is null or p_actor_id is null
     or p_expected_title is null
     or char_length(btrim(p_expected_title)) not between 1 and 240 then
    raise exception 'Training, expected title and actor are required' using errcode = '22023';
  end if;

  -- Keep identity/role checks valid until the transaction commits.
  perform 1 from public.profiles where id = p_actor_id and active for share;
  if not found then
    raise exception 'Active administrator required' using errcode = '42501';
  end if;
  perform 1 from public.user_roles where user_id = p_actor_id and role = 'admin' for share;
  if not found then
    raise exception 'Active administrator required' using errcode = '42501';
  end if;

  -- Serializes parent updates and FK/rating writers while removing dependent rows.
  select * into current_training from public.trainings where id = p_training_id for update;
  if not found then
    raise exception 'Training no longer exists' using errcode = 'P0002';
  end if;
  if current_training.title is distinct from p_expected_title then
    raise exception 'Training title changed; refresh confirmation' using errcode = '40001';
  end if;

  delete from public.training_ratings where training_id = p_training_id;
  get diagnostics ratings_deleted = row_count;
  delete from public.training_products where training_id = p_training_id;
  get diagnostics products_unlinked = row_count;
  delete from public.training_categories where training_id = p_training_id;
  get diagnostics categories_unlinked = row_count;
  delete from public.trainings where id = p_training_id;

  -- No exception is swallowed: a failure rolls back every deletion in this call.
  -- Owned Storage objects are removed by the server only after this RPC commits.
  return jsonb_build_object(
    'id', current_training.id,
    'slug', current_training.slug,
    'cover_path', current_training.cover_path,
    'video_storage_path', current_training.video_storage_path,
    'ratings_deleted', ratings_deleted,
    'products_unlinked', products_unlinked,
    'categories_unlinked', categories_unlinked
  );
end;
$$;

revoke all on function public.admin_delete_training(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_delete_training(uuid,text,uuid) to service_role;
comment on function public.admin_delete_training(uuid,text,uuid) is
  'Service-only confirmed deletion of one training and its ratings/associations, with active admin and title checks. Returns owned media for post-commit Storage cleanup.';

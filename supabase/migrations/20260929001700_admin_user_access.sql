-- Admin-only user access changes. Auth credentials and email confirmation remain
-- exclusively under Supabase Auth; this RPC changes the GreenBel role and the
-- profile's ability to perform business operations. No user is deleted.
-- Apply only to the linked DEV project after schema/history preflight.

do $preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_roles') is null
     or to_regclass('public.audit_events') is null
     or to_regprocedure('public.set_user_access(uuid,text,boolean,text,boolean)') is not null then
    raise exception 'Reviewed profiles, roles and audit schema required; user access RPC must be absent';
  end if;
end
$preflight$;

create function public.set_user_access(
  p_user_id uuid,
  p_role text,
  p_active boolean,
  p_expected_role text,
  p_expected_active boolean
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_active boolean;
  v_actor_role text;
  v_target_active boolean;
  v_target_role text;
begin
  if p_user_id is null or p_role is null or p_role not in ('customer','operator','admin')
     or p_active is null or p_expected_role is null
     or p_expected_role not in ('customer','operator','admin')
     or p_expected_active is null then
    raise exception 'Invalid user access input';
  end if;

  -- Serializes role changes, including concurrent attempts to demote the last
  -- active administrator. Row locks also serialize against direct service writes.
  perform pg_advisory_xact_lock(194623,17);
  select pr.active, ur.role into v_actor_active, v_actor_role
  from public.profiles pr join public.user_roles ur on ur.user_id=pr.id
  where pr.id=v_actor_id for update of pr,ur;
  if not found or not v_actor_active or v_actor_role<>'admin' then
    raise exception 'Active administrator required' using errcode='42501';
  end if;
  select pr.active, ur.role into v_target_active, v_target_role
  from public.profiles pr join public.user_roles ur on ur.user_id=pr.id
  where pr.id=p_user_id for update of pr,ur;
  if not found then raise exception 'User profile or role unavailable'; end if;
  if v_target_role is distinct from p_expected_role
     or v_target_active is distinct from p_expected_active then
    raise exception 'User access changed; reload before saving';
  end if;
  if p_user_id=v_actor_id and (p_role<>'admin' or not p_active) then
    raise exception 'Administrator cannot remove own access' using errcode='42501';
  end if;
  if v_target_role='admin' and v_target_active
     and (p_role<>'admin' or not p_active)
     and (select count(*) from public.user_roles ur
       join public.profiles pr on pr.id=ur.user_id
       where ur.role='admin' and pr.active)<=1 then
    raise exception 'At least one active administrator is required';
  end if;
  if v_target_role=p_role and v_target_active=p_active then
    return jsonb_build_object('changed',false,'role',p_role,'active',p_active);
  end if;

  update public.user_roles set role=p_role where user_id=p_user_id;
  update public.profiles set active=p_active where id=p_user_id;
  insert into public.audit_events(actor_id,entity_type,entity_id,action,changes)
  values (v_actor_id,'user',p_user_id,'access_changed',jsonb_build_object(
    'oldRole',v_target_role,'newRole',p_role,
    'oldActive',v_target_active,'newActive',p_active));
  return jsonb_build_object('changed',true,'role',p_role,'active',p_active);
end;
$$;

revoke all on function public.set_user_access(uuid,text,boolean,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.set_user_access(uuid,text,boolean,text,boolean)
  to authenticated;

comment on function public.set_user_access(uuid,text,boolean,text,boolean) is
  'Active administrators set GreenBel user role and business-operation access with stale-write protection and audit; Auth credentials remain separate.';

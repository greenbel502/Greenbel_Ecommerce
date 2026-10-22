-- Approved 18/10/2026: bounded private user directory; no table/RLS/write-policy change.
-- Apply only to DEV after target/history preflight. Auth email is never duplicated.
create function public.admin_list_users(
  p_search text default '', p_role text default '', p_active boolean default null,
  p_sort text default 'created_at', p_direction text default 'desc',
  p_page integer default 1, p_size integer default 10
) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_count bigint;
  v_page integer;
  v_rows jsonb;
  v_search text := btrim(coalesce(p_search,''));
begin
  if not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id
    where p.id=auth.uid() and p.active and r.role='admin') then
    raise exception 'Active administrator required' using errcode='42501';
  end if;
  if length(v_search)>120 or p_role is null or p_role not in ('','customer','operator','admin')
    or p_sort is null or p_sort not in ('created_at','display_name','email','role')
    or p_direction is null or p_direction not in ('asc','desc')
    or p_size is null or p_size not in (10,25,50) or p_page is null or p_page<1 or p_page>100000 then
    raise exception 'Invalid directory input' using errcode='22023';
  end if;
  -- Escape LIKE wildcards: a user's literal input never becomes a filter expression.
  v_search := '%' || replace(replace(replace(v_search,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%';
  select count(*) into v_count
  from auth.users u join public.profiles p on p.id=u.id join public.user_roles r on r.user_id=u.id
  where (p.display_name ilike v_search or u.email ilike v_search or p.phone ilike v_search)
    and (p_role='' or r.role=p_role) and (p_active is null or p.active=p_active);
  v_page := least(p_page,greatest(1,ceil(v_count::numeric/p_size)::integer));
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_rows from (
    select u.id,p.display_name,u.email,p.phone,r.role,p.active,u.created_at
    from auth.users u join public.profiles p on p.id=u.id join public.user_roles r on r.user_id=u.id
    where (p.display_name ilike v_search or u.email ilike v_search or p.phone ilike v_search)
      and (p_role='' or r.role=p_role) and (p_active is null or p.active=p_active)
    order by
      case when p_sort='created_at' and p_direction='asc' then u.created_at end asc,
      case when p_sort='created_at' and p_direction='desc' then u.created_at end desc,
      case when p_sort='display_name' and p_direction='asc' then lower(p.display_name) end asc,
      case when p_sort='display_name' and p_direction='desc' then lower(p.display_name) end desc,
      case when p_sort='email' and p_direction='asc' then lower(u.email) end asc,
      case when p_sort='email' and p_direction='desc' then lower(u.email) end desc,
      case when p_sort='role' and p_direction='asc' then r.role end asc,
      case when p_sort='role' and p_direction='desc' then r.role end desc,
      u.id asc
    limit p_size offset (v_page-1)*p_size
  ) t;
  return jsonb_build_object('rows',v_rows,'total',v_count,'page',v_page);
end;
$$;
revoke all on function public.admin_list_users(text,text,boolean,text,text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_list_users(text,text,boolean,text,text,integer,integer) to authenticated;
comment on function public.admin_list_users(text,text,boolean,text,text,integer,integer) is
  'Admin-only bounded directory with server search, role/active filters, allowlisted ordering and clamped pagination. No credentials or Auth metadata returned.';

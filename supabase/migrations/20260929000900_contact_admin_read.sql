-- Approved DEV correction for /admin/consultas after 001-008.
-- Adds SELECT only for the server-side service role; no client read grant.
-- 003 granted service_role execution of record_contact_message, but not SELECT
-- on the stored messages. The administrator page reads them through the
-- server-side service client after a fresh administrator authorization check.

do $preflight$
begin
  if to_regclass('public.contact_messages') is null then
    raise exception 'GreenBel contact table is missing';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.contact_messages'::regclass and relrowsecurity
  ) then
    raise exception 'Contact table RLS must remain enabled';
  end if;
  if has_table_privilege('anon', 'public.contact_messages', 'SELECT')
     or has_table_privilege('authenticated', 'public.contact_messages', 'SELECT') then
    raise exception 'Client contact read privilege detected; audit before applying';
  end if;
end
$preflight$;

grant select on table public.contact_messages to service_role;

do $verify$
begin
  if not has_table_privilege('service_role', 'public.contact_messages', 'SELECT')
     or has_table_privilege('anon', 'public.contact_messages', 'SELECT')
     or has_table_privilege('authenticated', 'public.contact_messages', 'SELECT') then
    raise exception 'Contact message privileges do not match the reviewed server-only policy';
  end if;
end
$verify$;

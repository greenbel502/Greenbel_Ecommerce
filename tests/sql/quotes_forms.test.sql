-- Run only against a disposable PostgreSQL 15 database after migrations 001-003.
-- Uses fictional rows and rolls everything back. Never run against DEV or PROD.
begin;
do $qa$
declare
  v_category uuid;
  v_product uuid;
  v_unpriced uuid;
  v_quote uuid;
  v_bad_quote uuid;
  v_financing uuid;
  v_contact_key uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_contact_id uuid;
  v_contact_retry_id uuid;
  v_contact_repeated boolean;
  v_guest_quote uuid;
  v_guest_ref text;
  v_guest_stage text;
  v_guest_repeated boolean;
  v_guest_key uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_finance_key uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  v_finance_created_id uuid;
  v_finance_retry_id uuid;
  v_finance_repeated boolean;
  v_attempt integer;
  v_blocked boolean;
begin
  if has_table_privilege('anon', 'public.contact_messages', 'SELECT')
     or has_table_privilege('authenticated', 'public.contact_messages', 'SELECT')
     or has_table_privilege('anon', 'public.quotes', 'SELECT')
     or has_table_privilege('authenticated', 'public.quotes', 'SELECT')
     or has_table_privilege('anon', 'public.financing_requests', 'INSERT')
     or has_table_privilege('service_role', 'public.contact_messages', 'INSERT')
     or has_table_privilege('service_role', 'public.contact_rate_limits', 'SELECT')
     or has_table_privilege('service_role', 'public.quote_rate_limits', 'SELECT')
     or has_table_privilege('service_role', 'public.guest_access_grants', 'UPDATE')
     or has_function_privilege('anon',
       'public.record_contact_message(uuid,text,text,text,text,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.record_contact_message(uuid,text,text,text,text,text,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.record_contact_message(uuid,text,text,text,text,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.begin_guest_quote(uuid,text,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.begin_guest_quote(uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.consume_guest_access_grant(text,uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.consume_guest_access_grant(text,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.create_financing_draft(uuid,text,uuid,text,text,text,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.create_financing_draft(uuid,text,uuid,text,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'Private grants are not restricted as reviewed';
  end if;
  if exists (
    select 1 from pg_class where oid in (
      'public.quotes'::regclass, 'public.quote_items'::regclass,
      'public.quote_rate_limits'::regclass,
      'public.contact_messages'::regclass, 'public.contact_rate_limits'::regclass,
      'public.financing_requests'::regclass,
      'public.guest_access_grants'::regclass
    ) and not relrowsecurity
  ) then
    raise exception 'Private table has RLS disabled';
  end if;
  if not exists (select 1 from storage.buckets where id = 'quote-pdfs'
    and public = false and allowed_mime_types = array['application/pdf']::text[]) then
    raise exception 'Quote PDF bucket is not private and PDF-only';
  end if;

  insert into public.categories (name, slug, active)
  values ('Categoría ficticia de prueba', 'qa-quotes-category', true) returning id into v_category;
  insert into public.products (sku, slug, name, kind, category_id, regular_price, currency, publication_status)
  values ('QA-QUOTES-1', 'qa-quotes-product', 'Equipo ficticio de prueba', 'equipment', v_category, 100, 'GTQ', 'published')
  returning id into v_product;
  insert into public.products (sku, slug, name, kind, category_id, publication_status)
  values ('QA-QUOTES-2', 'qa-quotes-unpriced', 'Equipo sin precio de prueba', 'equipment', v_category, 'published')
  returning id into v_unpriced;

  select contact_id, repeated into v_contact_id, v_contact_repeated
  from public.record_contact_message(v_contact_key, repeat('a', 64), repeat('9', 64),
    'Persona Ficticia', 'prueba@example.invalid', null, null, null,
    'Consulta ficticia de prueba.');
  if v_contact_id is null or v_contact_repeated then
    raise exception 'Initial contact command did not persist a fresh receipt';
  end if;
  select contact_id, repeated into v_contact_retry_id, v_contact_repeated
  from public.record_contact_message(v_contact_key, repeat('a', 64), repeat('9', 64),
    'Persona Ficticia', 'prueba@example.invalid', null, null, null,
    'Consulta ficticia de prueba.');
  if v_contact_retry_id is distinct from v_contact_id or not v_contact_repeated then
    raise exception 'Identical retry did not reuse the original contact receipt';
  end if;
  v_blocked := false;
  begin
    perform * from public.record_contact_message(v_contact_key, repeat('b', 64), repeat('9', 64),
      'Persona Ficticia', 'prueba@example.invalid', null, null, null,
      'Consulta cambiada durante el reintento.');
  exception when sqlstate 'P4090' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Changed idempotency key was not rejected'; end if;
  for v_attempt in 2..20 loop
    perform * from public.record_contact_message(gen_random_uuid(), repeat('a', 64), repeat('9', 64),
      'Persona Ficticia', 'prueba@example.invalid', null, null, null,
      'Consulta ficticia de prueba.');
  end loop;
  v_blocked := false;
  begin
    perform * from public.record_contact_message(gen_random_uuid(), repeat('a', 64), repeat('9', 64),
      'Persona Ficticia', 'prueba@example.invalid', null, null, null,
      'Consulta ficticia de prueba.');
  exception when sqlstate 'P4290' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Twenty-one distinct contacts exceeded durable quota'; end if;
  if (select accepted_count from public.contact_rate_limits
      where source_hash = repeat('9', 64) and window_start = date_trunc('hour', now())) <> 20 then
    raise exception 'Retries or rejected contact changed the durable quota';
  end if;

  select quote_id, quote_reference, quote_stage, repeated
  into v_guest_quote, v_guest_ref, v_guest_stage, v_guest_repeated
  from public.begin_guest_quote(v_guest_key, repeat('a', 64), repeat('6', 64),
    'Persona Ficticia', 'prueba@example.invalid');
  if v_guest_quote is null or v_guest_stage <> 'generating' or v_guest_repeated then
    raise exception 'Guest quote did not start privately';
  end if;
  select quote_id, quote_reference, quote_stage, repeated
  into v_guest_quote, v_guest_ref, v_guest_stage, v_guest_repeated
  from public.begin_guest_quote(v_guest_key, repeat('a', 64), repeat('6', 64),
    'Persona Ficticia', 'prueba@example.invalid');
  if v_guest_quote is null or v_guest_stage <> 'generating' or not v_guest_repeated then
    raise exception 'Guest quote retry did not reuse its draft';
  end if;
  for v_attempt in 2..6 loop
    perform * from public.begin_guest_quote(gen_random_uuid(), repeat('a', 64), repeat('6', 64),
      'Persona Ficticia', 'prueba@example.invalid');
  end loop;
  v_blocked := false;
  begin
    perform * from public.begin_guest_quote(gen_random_uuid(), repeat('a', 64), repeat('6', 64),
      'Persona Ficticia', 'prueba@example.invalid');
  exception when sqlstate 'P4290' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Guest quote rate limit was not enforced'; end if;

  insert into public.quotes
    (reference, idempotency_key, request_fingerprint, customer_name, shipping_status)
  values ('QA-COT-1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', repeat('b', 64),
    'Persona Ficticia', 'pending') returning id into v_quote;
  insert into public.quote_items
    (quote_id, product_id, line_no, sku_snapshot, name_snapshot, quantity,
      regular_unit_price, discount_unit, final_unit_price, line_total)
  values (v_quote, v_product, 1, 'QA-QUOTES-1', 'Equipo ficticio de prueba', 1,
    100, 0, 100, 100);
  v_blocked := false;
  begin
    update public.quotes set stage = 'issued', subtotal = 100, discount_total = 0,
      merchandise_total = 100, issued_at = now() where id = v_quote;
  exception when raise_exception or check_violation then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Quote issued without private PDF metadata'; end if;

  v_blocked := false;
  begin
    update public.quotes set stage = 'issued', subtotal = 100, discount_total = 0,
      merchandise_total = 100, issued_at = now(), pdf_storage_bucket = 'quote-pdfs',
      pdf_storage_path = v_quote::text || '/qa.pdf', pdf_sha256 = repeat('c', 64), pdf_bytes = 100
    where id = v_quote;
  exception when raise_exception then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Quote issued without a Storage object'; end if;

  -- Structural metadata test only. This dummy object is never uploaded or committed.
  insert into storage.objects (bucket_id, name) values ('quote-pdfs', v_quote::text || '/qa.pdf');
  update public.quotes set stage = 'issued', subtotal = 100, discount_total = 0,
    merchandise_total = 100, issued_at = now(), pdf_storage_bucket = 'quote-pdfs',
    pdf_storage_path = v_quote::text || '/qa.pdf', pdf_sha256 = repeat('c', 64), pdf_bytes = 100
  where id = v_quote;
  v_blocked := false;
  begin
    update public.quotes set customer_name = 'Otro nombre' where id = v_quote;
  exception when raise_exception then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Issued quote mutated'; end if;
  v_blocked := false;
  begin
    update public.quote_items set quantity = 2 where quote_id = v_quote;
  exception when raise_exception then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Issued quote line mutated'; end if;

  insert into public.quotes
    (reference, idempotency_key, request_fingerprint, customer_name, shipping_status)
  values ('QA-COT-2', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', repeat('d', 64),
    'Persona Ficticia', 'pending') returning id into v_bad_quote;
  insert into public.quote_items
    (quote_id, product_id, line_no, sku_snapshot, name_snapshot, quantity,
      regular_unit_price, discount_unit, final_unit_price, line_total)
  values (v_bad_quote, v_unpriced, 1, 'QA-QUOTES-2', 'Equipo sin precio de prueba', 1,
    100, 0, 100, 100);
  insert into storage.objects (bucket_id, name) values ('quote-pdfs', v_bad_quote::text || '/unpriced.pdf');
  v_blocked := false;
  begin
    update public.quotes set stage = 'issued', subtotal = 100, discount_total = 0,
      merchandise_total = 100, issued_at = now(), pdf_storage_bucket = 'quote-pdfs',
      pdf_storage_path = v_bad_quote::text || '/unpriced.pdf', pdf_sha256 = repeat('e', 64), pdf_bytes = 100
    where id = v_bad_quote;
  exception when raise_exception then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Unpriced product entered monetary quote'; end if;

  insert into public.financing_requests
    (quote_id, idempotency_key, request_fingerprint, applicant_name, email)
  values (v_quote, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', repeat('f', 64),
    'Persona Ficticia', 'prueba@example.invalid') returning id into v_financing;
  v_blocked := false;
  begin
    update public.financing_requests set stage = 'sent' where id = v_financing;
  exception when check_violation then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Financing escaped draft gate'; end if;

  v_blocked := false;
  begin
    insert into public.guest_access_grants (quote_id, token_sha256, expires_at, max_uses)
    values (v_bad_quote, repeat('3', 64), now() + interval '1 hour', 1);
  exception when raise_exception then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Guest grant exposed a quote without an issued PDF'; end if;
  insert into public.guest_access_grants (quote_id, token_sha256, expires_at, max_uses)
  values (v_quote, repeat('1', 64), now() + interval '1 hour', 2);
  if public.consume_guest_access_grant(repeat('1', 64), v_bad_quote, null) then
    raise exception 'Guest token crossed to another quote';
  end if;
  if not public.consume_guest_access_grant(repeat('1', 64), v_quote, null)
     or not public.consume_guest_access_grant(repeat('1', 64), v_quote, null)
     or public.consume_guest_access_grant(repeat('1', 64), v_quote, null) then
    raise exception 'Guest token use count was not enforced atomically';
  end if;
  insert into public.guest_access_grants (quote_id, token_sha256, expires_at, max_uses)
  values (v_quote, repeat('4', 64), now() + interval '1 hour', 2);
  select financing_id, repeated into v_finance_created_id, v_finance_repeated
  from public.create_financing_draft(v_finance_key, repeat('a', 64), v_quote,
    repeat('4', 64), 'Persona Ficticia', 'prueba@example.invalid', null,
    'Solicitud ficticia.', 'draft-share-v1');
  if v_finance_created_id is null or v_finance_repeated then
    raise exception 'Financing draft was not persisted freshly';
  end if;
  if not public.consume_guest_access_grant(repeat('4', 64), v_quote, null) then
    raise exception 'Financing test could not exhaust remaining grant use';
  end if;
  select financing_id, repeated into v_finance_retry_id, v_finance_repeated
  from public.create_financing_draft(v_finance_key, repeat('a', 64), v_quote,
    repeat('4', 64), 'Persona Ficticia', 'prueba@example.invalid', null,
    'Solicitud ficticia.', 'draft-share-v1');
  if v_finance_retry_id is distinct from v_finance_created_id or not v_finance_repeated
     or (select use_count from public.guest_access_grants where token_sha256 = repeat('4', 64)) <> 2
     or (select stage from public.financing_requests where id = v_finance_created_id) <> 'draft' then
    raise exception 'Financing retry changed the draft or consumed another grant use';
  end if;
  v_blocked := false;
  begin
    perform * from public.create_financing_draft(v_finance_key, repeat('b', 64), v_quote,
      repeat('4', 64), 'Persona Ficticia', 'prueba@example.invalid', null,
      'Solicitud cambiada.', 'draft-share-v1');
  exception when sqlstate 'P4090' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Changed financing idempotency key was accepted'; end if;
  v_blocked := false;
  begin
    perform * from public.create_financing_draft(gen_random_uuid(), repeat('a', 64), v_quote,
      repeat('5', 64), 'Persona Ficticia', 'prueba@example.invalid', null,
      'Solicitud ficticia.', 'draft-share-v1');
  exception when sqlstate 'P4030' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Financing accepted an invalid quote token'; end if;
  v_blocked := false;
  begin
    insert into public.guest_access_grants
      (quote_id, financing_request_id, token_sha256, expires_at, max_uses)
    values (v_quote, v_financing, repeat('2', 64), now() + interval '1 hour', 2);
  exception when check_violation then v_blocked := true;
  end;
  if not v_blocked then raise exception 'Guest token grants more than one resource'; end if;
end
$qa$;
set local role service_role;
select contact_id is not null and not repeated as service_role_contact_pass
from public.record_contact_message(gen_random_uuid(), repeat('a', 64), repeat('8', 64),
  'Persona Ficticia', 'prueba@example.invalid', null, null, null,
  'Consulta ficticia de prueba.');
reset role;
rollback;

-- DEV only, all test writes are rolled back. No provider calls or historical dispatch.
begin;
set local statement_timeout='20s';
create temporary table qa_gmail_marker(id integer);
create function pg_temp.check_gmail(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
do $$
declare admin_id uuid; historical uuid; first_id uuid; second_id uuid; third_id uuid; fourth_id uuid;
  key_id uuid:=gen_random_uuid(); source text:=md5(random()::text)||md5(random()::text);
  claim jsonb; claim2 jsonb; revision_id uuid; n integer;
begin
  perform pg_temp.check_gmail(not has_function_privilege('anon','public.gmail_connection_read()','execute') and
    not has_function_privilege('authenticated','public.gmail_connection_read()','execute'),'Browser roles cannot read the token RPC');
  perform pg_temp.check_gmail(not has_table_privilege('anon','greenbel_private.gmail_connection','select') and
    not has_table_privilege('authenticated','greenbel_private.gmail_contact_notifications','select') and
    not has_table_privilege('service_role','greenbel_private.gmail_connection','select'),'Private tables have no direct browser or service table grants');
  perform pg_temp.check_gmail(has_function_privilege('service_role','public.gmail_notification_claim(uuid,boolean)','execute'),'Backend service alone can claim notifications');
  select u.user_id into admin_id from public.user_roles u join public.profiles p on p.id=u.user_id where u.role='admin' and p.active limit 1;
  if admin_id is null then raise exception 'QA requires an existing active administrator'; end if;
  delete from greenbel_private.gmail_connection;
  select contact_id into historical from public.record_contact_message(gen_random_uuid(),repeat('a',64),source,'QA Gmail historical','qa@example.invalid',null,'QA','QA','Mensaje histórico controlado de prueba');
  perform pg_temp.check_gmail(not exists(select 1 from greenbel_private.gmail_contact_notifications where contact_id=historical),'An unconnected contact is saved without queueing');
  revision_id:=public.gmail_connection_save('v1.'||repeat('x',80),'qa@example.invalid',repeat('f',64),admin_id,null);
  perform pg_temp.check_gmail(not exists(select 1 from greenbel_private.gmail_contact_notifications where contact_id=historical),'Connecting never enqueues historical contacts');
  begin
    perform public.gmail_connection_save('v1.'||repeat('x',80),'qa@example.invalid',repeat('f',64),admin_id,null);
    raise exception 'Connection concurrency check did not reject';
  exception when sqlstate 'PT409' then raise notice 'PASS: Stale OAuth callback cannot overwrite a newer connection'; end;
  select contact_id into first_id from public.record_contact_message(key_id,repeat('b',64),source,'QA Gmail first','qa@example.invalid','+50200000000','Asesoría','QA-1','Mensaje completo de prueba controlada');
  select count(*) into n from public.record_contact_message(key_id,repeat('b',64),source,'QA Gmail first','qa@example.invalid','+50200000000','Asesoría','QA-1','Mensaje completo de prueba controlada') where repeated;
  perform pg_temp.check_gmail(n=1 and (select count(*)=1 from greenbel_private.gmail_contact_notifications where contact_id=first_id),'Idempotent registration has exactly one notification');
  claim:=public.gmail_notification_claim(first_id,false);
  claim2:=public.gmail_notification_claim(first_id,false);
  perform pg_temp.check_gmail(claim is not null and claim2 is null,'Only one active claim is allowed');
  perform pg_temp.check_gmail(not public.gmail_notification_finish(first_id,gen_random_uuid(),'sent','fake_message',null),'A foreign attempt cannot acknowledge delivery');
  perform public.gmail_notification_finish(first_id,(claim->>'attempt_id')::uuid,'sent','qa_message_1',null);
  perform pg_temp.check_gmail(public.gmail_notification_finish(first_id,(claim->>'attempt_id')::uuid,'sent','qa_message_1',null),'Acknowledgement is idempotent');
  perform pg_temp.check_gmail(public.gmail_notification_claim(first_id,true) is null and
    (select notification_status='sent' from public.contact_messages where id=first_id),'A sent consultation cannot be resent');
  select contact_id into second_id from public.record_contact_message(gen_random_uuid(),repeat('c',64),source,'QA Gmail failed','qa@example.invalid',null,'QA','QA','Mensaje fallido de prueba controlada');
  claim:=public.gmail_notification_claim(second_id,false);
  perform public.gmail_notification_finish(second_id,(claim->>'attempt_id')::uuid,'failed',null,'quota_exceeded');
  perform pg_temp.check_gmail(exists(select 1 from public.contact_messages where id=second_id and notification_status='failed'),'Gmail rejection keeps the consultation');
  perform pg_temp.check_gmail(public.gmail_notification_claim(second_id,true) is null,'Retry delay is enforced');
  update greenbel_private.gmail_contact_notifications set next_retry_at=now()-interval '1 second' where contact_id=second_id;
  claim:=public.gmail_notification_claim(second_id,true);
  perform pg_temp.check_gmail(claim is not null,'Known rejection can be retried after its delay');
  perform public.gmail_notification_finish(second_id,(claim->>'attempt_id')::uuid,'unknown',null,'delivery_unconfirmed');
  perform pg_temp.check_gmail(public.gmail_notification_claim(second_id,true) is null,'Uncertain delivery is never automatically retried');
  select contact_id into third_id from public.record_contact_message(gen_random_uuid(),repeat('d',64),source,'QA Gmail pending','qa@example.invalid',null,'QA','QA','Mensaje pendiente de prueba controlada');
  perform pg_temp.check_gmail(public.gmail_notification_claim(third_id,true) is not null,'An unattempted pending job can be manually recovered');
  perform public.gmail_connection_require_reconnect(revision_id,'authorization_revoked');
  select contact_id into fourth_id from public.record_contact_message(gen_random_uuid(),repeat('e',64),source,'QA Gmail revoked','qa@example.invalid',null,'QA','QA','Mensaje con conexión revocada de prueba');
  perform pg_temp.check_gmail(exists(select 1 from greenbel_private.gmail_contact_notifications where contact_id=fourth_id and status='pending'),'New contacts remain recoverable during a known authorization outage');
  perform pg_temp.check_gmail(public.gmail_notification_claim(fourth_id,false) is null,'Known revoked authorization blocks sending');
  revision_id:=public.gmail_connection_save('v1.'||repeat('y',80),'qa@example.invalid',repeat('f',64),admin_id,revision_id);
  perform pg_temp.check_gmail(public.gmail_notification_claim(fourth_id,true) is not null,'Reconnection allows an explicit pending retry');
  perform pg_temp.check_gmail(not exists(select 1 from greenbel_private.gmail_contact_notifications where contact_id=historical),'Reconnection still does not send historical records');
end $$;
rollback;

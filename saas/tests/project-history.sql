-- Essai isolé : suppression d'un contact avec conservation des projets et cold calls.
insert into auth.users(id,email,email_confirmed_at) values ('00000000-0000-0000-0000-000000000401','test@example.invalid',now());
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000401',false);
select public.create_workspace('Historique') as w \gset
select set_config('test.workspace',:'w',false);
insert into public.companies(id,workspace_id,name,data) values ('40000000-0000-0000-0000-000000000001',:'w','Société fictive','{"name":"Société fictive"}');
insert into public.contacts(id,workspace_id,name,company_id,data) values ('40000000-0000-0000-0000-000000000002',:'w','Contact fictif','40000000-0000-0000-0000-000000000001','{"id":"ancien-contact","name":"Contact fictif"}');
insert into public.projects(id,workspace_id,contact_id,company_id,data) values ('40000000-0000-0000-0000-000000000003',:'w','40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','{"contactId":"ancien-contact","contactName":"Contact fictif","title":"Projet fictif"}');
insert into public.cold_calls(id,workspace_id,contact_id,data) values ('40000000-0000-0000-0000-000000000004',:'w','40000000-0000-0000-0000-000000000002','{"contactId":"ancien-contact"}');
select public.apply_workspace_changes(:'w','[{"table":"projects","action":"update","id":"40000000-0000-0000-0000-000000000003","expected_version":1,"row":{"contact_id":null,"company_id":"40000000-0000-0000-0000-000000000001","data":{"contactId":"ancien-contact","contactName":"Contact fictif","title":"Projet fictif"}}},{"table":"cold_calls","action":"update","id":"40000000-0000-0000-0000-000000000004","expected_version":1,"row":{"contact_id":null,"data":{"contactId":"ancien-contact"}}},{"table":"contacts","action":"delete","id":"40000000-0000-0000-0000-000000000002","expected_version":1}]');
do $$ begin
 if exists(select 1 from public.contacts where workspace_id=current_setting('test.workspace')::uuid) then raise exception 'Contact non supprimé'; end if;
 if not exists(select 1 from public.projects where workspace_id=current_setting('test.workspace')::uuid and contact_id is null and data->>'contactId'='ancien-contact') then raise exception 'Projet historique perdu'; end if;
 if not exists(select 1 from public.cold_calls where workspace_id=current_setting('test.workspace')::uuid and contact_id is null and data->>'contactId'='ancien-contact') then raise exception 'Cold call perdu'; end if;
end $$;
reset role;

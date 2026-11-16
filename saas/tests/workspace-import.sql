-- À exécuter uniquement avec PostgreSQL de test et le faux schéma Auth.
insert into auth.users(id,email,email_confirmed_at) values ('00000000-0000-0000-0000-000000000101','owner@example.invalid',now()),('00000000-0000-0000-0000-000000000102','other@example.invalid',now());
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',false);
select public.create_workspace('Import test') as id \gset
select public.import_workspace_backup(:'id', '{"companies":[{"id":"10000000-0000-0000-0000-000000000001","name":"Test","legacy_id":"co","data":{"name":"Test"}}],"contacts":[{"id":"10000000-0000-0000-0000-000000000002","name":"Alice","legacy_id":"c","company_id":"10000000-0000-0000-0000-000000000001","data":{"name":"Alice"}}],"interactions":[],"cold_calls":[],"reminders":[],"projects":[],"settings":{"legacy_extra":{}}}'::jsonb);
do $$ begin
 begin
  perform public.import_workspace_backup((select id from public.workspaces limit 1),'{"companies":[],"contacts":[],"interactions":[],"cold_calls":[],"reminders":[],"projects":[],"settings":{"legacy_extra":{}}}'::jsonb);
  raise exception 'Un deuxième import aurait dû être refusé';
 exception when others then if sqlerrm not like 'Import refusé%' then raise; end if; end;
end $$;
select public.create_workspace('Rollback test') as id \gset
-- L'échec sur une clé étrangère ne doit laisser aucune entreprise en base.
do $$ declare w uuid := (select id from public.workspaces where name='Rollback test'); begin
 begin
  perform public.import_workspace_backup(w,'{"companies":[{"id":"20000000-0000-0000-0000-000000000001","name":"Test","data":{}}],"contacts":[{"id":"20000000-0000-0000-0000-000000000002","name":"Test","company_id":"20000000-0000-0000-0000-000000000099","data":{}}],"interactions":[],"cold_calls":[],"reminders":[],"projects":[],"settings":{"legacy_extra":{}}}'::jsonb);
  raise exception 'Import invalide accepté';
 exception when foreign_key_violation then null; end;
 if exists(select 1 from public.companies where workspace_id=w) then raise exception 'Import partiel non annulé'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',false);
do $$ begin
 begin
  perform public.import_workspace_backup('00000000-0000-0000-0000-000000000999','{}'::jsonb);
  raise exception 'Import non autorisé accepté';
 exception when others then if sqlerrm <> 'Accès refusé' then raise; end if; end;
end $$;
reset role;

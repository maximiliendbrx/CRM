-- Essai local uniquement : aucun compte ou e-mail réel.
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000501','owner@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000502','member@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000503','outside@example.invalid',now());
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000501',false);
select public.create_workspace('CRM Membres') as w \gset
select set_config('test.workspace',:'w',false);
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values (:'w','00000000-0000-0000-0000-000000000502','member');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000502',false);
do $$ begin
 if (select count(*) from public.list_workspace_members(current_setting('test.workspace')::uuid))<>2 then raise exception 'Liste des membres incorrecte'; end if;
 if exists(select 1 from public.list_workspace_members(current_setting('test.workspace')::uuid) where email='outside@example.invalid') then raise exception 'Membre extérieur exposé'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000503',false);
do $$ begin
 begin perform public.list_workspace_members(current_setting('test.workspace')::uuid);raise exception 'Accès extérieur autorisé';
 exception when others then if sqlerrm<>'Accès refusé' then raise; end if; end;
end $$;
reset role;
do $$ begin if has_function_privilege('anon','public.list_workspace_members(uuid)','EXECUTE') then raise exception 'Liste anonyme autorisée'; end if; end $$;

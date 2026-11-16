-- Test local uniquement. Deux membres de CRM distincts et un tiers non membre.
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000201','a@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000202','b@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000203','c@example.invalid',now());
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000201',false);
select public.create_workspace('CRM A') as workspace_a \gset
insert into public.companies(workspace_id,name,data) values (:'workspace_a','Entreprise A','{"name":"Entreprise A"}');
update public.workspace_settings set data='{"legacy_extra":{"catalogs":{"roles":["Direction"]}}}' where workspace_id=:'workspace_a';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000202',false);
select public.create_workspace('CRM B') as workspace_b \gset
insert into public.companies(workspace_id,name,data) values (:'workspace_b','Entreprise B','{"name":"Entreprise B"}');
do $$ declare w uuid; snapshot jsonb; begin
 select id into w from public.workspaces where name='CRM B';
 snapshot:=public.get_workspace_snapshot(w);
 if jsonb_array_length(snapshot->'companies')<>1 or snapshot->'companies'->0->>'name'<>'Entreprise B' then raise exception 'Espace ou contenu incorrect'; end if;
 if jsonb_array_length(snapshot->'contacts')<>0 then raise exception 'Collection vide incorrecte'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',false);
-- L'utilisateur tiers ne peut pas lire les espaces même en connaissant leur ID.
select set_config('test.workspace_a',:'workspace_a',false);
do $$ begin
 begin
  perform public.get_workspace_snapshot(current_setting('test.workspace_a')::uuid);
  raise exception 'Accès non autorisé accepté';
 exception when others then if sqlerrm <> 'Accès refusé' then raise; end if; end;
end $$;
reset role;
-- Le rôle anonyme ne peut pas appeler la fonction.
do $$ begin
 if has_function_privilege('anon','public.get_workspace_snapshot(uuid)','EXECUTE') then raise exception 'Exécution anonyme autorisée'; end if;
end $$;

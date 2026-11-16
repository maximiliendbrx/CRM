\set ON_ERROR_STOP on
-- Données fictives exclusivement, sur base jetable après 001_workspace_core.sql.
insert into auth.users(id,email_confirmed_at) values ('11111111-1111-4111-8111-111111111111',now()),('22222222-2222-4222-8222-222222222222',now()),('33333333-3333-4333-8333-333333333333',null);
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.create_workspace('CRM A') as workspace_a \gset
select public.create_workspace('CRM B') as workspace_b \gset
insert into public.companies(id,workspace_id,name) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',:'workspace_a','Entreprise A');
insert into public.contacts(id,workspace_id,company_id,name) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',:'workspace_a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Contact A');
select set_config('test.workspace_a',:'workspace_a',false),set_config('test.workspace_b',:'workspace_b',false);
do $$ begin
 begin
  insert into public.contacts(workspace_id,company_id,name) values(current_setting('test.workspace_b')::uuid,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Liaison interdite');
  raise exception 'ÉCHEC : relation inter-CRM acceptée';
 exception when foreign_key_violation then null; end;
 begin
  insert into public.workspace_members(workspace_id,user_id,role) values(current_setting('test.workspace_b')::uuid,'22222222-2222-4222-8222-222222222222','admin');
  raise exception 'ÉCHEC : modification directe des membres acceptée';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.workspace_members(workspace_id,user_id,role) values (:'workspace_a','22222222-2222-4222-8222-222222222222','member');
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$ begin
 if (select count(*) from public.workspaces)<>1 then raise exception 'ÉCHEC : espaces non isolés'; end if;
 if (select count(*) from public.contacts)<>1 then raise exception 'ÉCHEC : contact partagé inaccessible'; end if;
 begin
  insert into public.companies(workspace_id,name) values(current_setting('test.workspace_b')::uuid,'Injection');
  raise exception 'ÉCHEC : écriture hors CRM autorisée';
 exception when insufficient_privilege then null; end;
 begin
  perform public.rename_workspace(current_setting('test.workspace_a')::uuid,'Renommage interdit');
  raise exception 'ÉCHEC : collaborateur autorisé à renommer';
 exception when raise_exception then if sqlerrm<>'Accès refusé' then raise; end if; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.change_workspace_member_role(:'workspace_a','22222222-2222-4222-8222-222222222222','admin');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.rename_workspace(:'workspace_a','CRM A renommé');
do $$ begin
 begin
  perform public.remove_workspace_member(current_setting('test.workspace_a')::uuid,'11111111-1111-4111-8111-111111111111');
  raise exception 'ÉCHEC : propriétaire retiré';
 exception when raise_exception then if sqlerrm<>'Membre introuvable ou propriétaire protégé' then raise; end if; end;
 begin
  perform public.delete_workspace(current_setting('test.workspace_a')::uuid);
  raise exception 'ÉCHEC : suppression par administrateur';
 exception when raise_exception then if sqlerrm<>'Accès refusé' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.remove_workspace_member(:'workspace_a','22222222-2222-4222-8222-222222222222');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
reset role;
set role authenticated;
do $$ begin
 if (select count(*) from public.contacts)<>0 then raise exception 'ÉCHEC : accès conservé après retrait'; end if;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$ begin
 begin
  perform public.create_workspace('E-mail non confirmé');
  raise exception 'ÉCHEC : création sans e-mail confirmé';
 exception when raise_exception then if sqlerrm<>'Adresse e-mail confirmée requise' then raise; end if; end;
end $$;
reset role;
select 'Tests locaux de base réussis' as resultat;

-- Tests locaux sur données fictives uniquement.
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000301','a@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000302','b@example.invalid',now());
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',false);
select public.create_workspace('CRM Modifications A') as w \gset
select set_config('test.workspace',:'w',false);
select public.apply_workspace_changes(:'w','[{"table":"companies","action":"insert","id":"30000000-0000-0000-0000-000000000001","row":{"name":"Fictif","legacy_id":"old-1","data":{"name":"Fictif"}}}]');
do $$ declare w uuid:=current_setting('test.workspace')::uuid; rows jsonb; begin
 rows:=public.get_workspace_records(w);
 if rows->'companies'->0->>'version'<>'1' then raise exception 'Version initiale incorrecte'; end if;
 perform public.apply_workspace_changes(w,'[{"table":"companies","action":"update","id":"30000000-0000-0000-0000-000000000001","expected_version":1,"row":{"name":"Modifié","data":{"name":"Modifié"}}}]');
 if (select version from public.companies where workspace_id=w)<>2 then raise exception 'Version non incrémentée'; end if;
 begin
  perform public.apply_workspace_changes(w,'[{"table":"companies","action":"update","id":"30000000-0000-0000-0000-000000000001","expected_version":1,"row":{"name":"Perdu","data":{"name":"Perdu"}}}]');
  raise exception 'Ancienne version acceptée';
 exception when others then if sqlerrm not like 'Conflit%' then raise; end if; end;
 if (select name from public.companies where workspace_id=w)<>'Modifié' then raise exception 'Écrasement incorrect'; end if;
 -- La seconde modification échoue et annule également la première.
 begin
  perform public.apply_workspace_changes(w,'[{"table":"companies","action":"insert","id":"30000000-0000-0000-0000-000000000002","row":{"name":"Transitoire","data":{}}},{"table":"companies","action":"delete","id":"30000000-0000-0000-0000-000000000001","expected_version":1}]');
  raise exception 'Lot non annulé';
 exception when others then if sqlerrm not like 'Conflit%' then raise; end if; end;
 if exists(select 1 from public.companies where id='30000000-0000-0000-0000-000000000002') then raise exception 'Écriture partielle'; end if;
end $$;
-- Composite foreign keys refuse linking a contact to another workspace's company.
select public.create_workspace('CRM Modifications B') as w2 \gset
select set_config('test.workspace_b',:'w2',false);
do $$ declare other uuid:=current_setting('test.workspace_b')::uuid; begin
 begin
  perform public.apply_workspace_changes(other,'[{"table":"contacts","action":"insert","id":"30000000-0000-0000-0000-000000000003","row":{"name":"Fictif","company_id":"30000000-0000-0000-0000-000000000001","data":{}}}]');
  raise exception 'Lien entre espaces accepté';
 exception when foreign_key_violation then null; end;
 if exists(select 1 from public.contacts where workspace_id=other) then raise exception 'Contact invalide présent'; end if;
 begin
  perform public.apply_workspace_changes(other,'[{"table":"workspaces","action":"insert","id":"30000000-0000-0000-0000-000000000004","row":{"data":{}}}]');
  raise exception 'Table non autorisée acceptée';
 exception when others then if sqlerrm<>'Table invalide' then raise; end if; end;
end $$;
-- Direct API writes must advance the same version.
update public.companies set name='Modifié directement',version=999 where id='30000000-0000-0000-0000-000000000001';
do $$ begin if (select version from public.companies where id='30000000-0000-0000-0000-000000000001')<>3 then raise exception 'Version directe incorrecte'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000302',false);
do $$ declare w uuid:=current_setting('test.workspace')::uuid; begin
 begin
  perform public.get_workspace_records(w); raise exception 'Lecture non autorisée';
 exception when others then if sqlerrm<>'Accès refusé' then raise; end if; end;
 begin
  perform public.apply_workspace_changes(w,'[{"table":"companies","action":"delete","id":"30000000-0000-0000-0000-000000000001","expected_version":3}]'); raise exception 'Écriture non autorisée';
 exception when others then if sqlerrm<>'Accès refusé' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.apply_workspace_changes(uuid,jsonb)','EXECUTE') then raise exception 'Écriture anonyme autorisée'; end if;
end $$;

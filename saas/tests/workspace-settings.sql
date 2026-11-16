-- Après workspace-changes.sql, sur une base PostgreSQL locale jetable.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',false);
do $$ declare w uuid; snapshot jsonb; begin
 select id into w from public.workspaces where name='CRM Modifications A';
 snapshot:=public.get_workspace_records(w);
 if snapshot->'settings'->>'version'<>'1' then raise exception 'Version initiale de paramètres incorrecte'; end if;
 perform public.apply_workspace_changes(w,jsonb_build_array(jsonb_build_object('table','workspace_settings','action','update','id',w,'expected_version',1,'row',jsonb_build_object('data','{"legacy_extra":{"catalogs":{"roles":["Commercial"]}}}'::jsonb))));
 if (select version from public.workspace_settings where workspace_id=w)<>2 then raise exception 'Version de paramètres incorrecte'; end if;
 begin
  perform public.apply_workspace_changes(w,jsonb_build_array(
   jsonb_build_object('table','companies','action','update','id','30000000-0000-0000-0000-000000000001','expected_version',3,'row',jsonb_build_object('name','Modification annulée','data','{}'::jsonb)),
   jsonb_build_object('table','workspace_settings','action','update','id',w,'expected_version',1,'row',jsonb_build_object('data','{}'::jsonb))));
  raise exception 'Ancienne version acceptée';
 exception when others then if sqlerrm not like 'Conflit%' then raise; end if; end;
 if (select name from public.companies where id='30000000-0000-0000-0000-000000000001')='Modification annulée' then raise exception 'Écriture partielle'; end if;
end $$;
reset role;

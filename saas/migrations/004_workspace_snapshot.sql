-- Lecture cohérente d'un espace, pour le développement uniquement.
begin;
do $$ begin
 if current_setting('crm.allow_dev_migration',true) is distinct from 'yes' then
  raise exception 'Migration bloquée : confirmer le projet de développement';
 end if;
end $$;

-- SECURITY INVOKER : les politiques RLS des tables métier restent actives.
-- Une seule instruction SELECT fournit une vue cohérente des différentes collections.
create function public.get_workspace_snapshot(p_workspace uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not crm_private.has_role(p_workspace,array['owner','admin','member']) then
  raise exception 'Accès refusé';
 end if;
 select coalesce((select case when jsonb_typeof(s.data->'legacy_extra')='object' then s.data->'legacy_extra' else '{}'::jsonb end from public.workspace_settings s where s.workspace_id=p_workspace),'{}'::jsonb)
 || jsonb_build_object(
  'companies',coalesce((select jsonb_agg(c.data order by c.id) from public.companies c where c.workspace_id=p_workspace),'[]'::jsonb),
  'contacts',coalesce((select jsonb_agg(c.data order by c.id) from public.contacts c where c.workspace_id=p_workspace),'[]'::jsonb),
  'interactions',coalesce((select jsonb_agg(i.data order by i.id) from public.interactions i where i.workspace_id=p_workspace),'[]'::jsonb),
  'coldCalls',coalesce((select jsonb_agg(c.data order by c.id) from public.cold_calls c where c.workspace_id=p_workspace),'[]'::jsonb),
  'followups',coalesce((select jsonb_agg(r.data order by r.id) from public.reminders r where r.workspace_id=p_workspace),'[]'::jsonb),
  'projects',coalesce((select jsonb_agg(p.data order by p.id) from public.projects p where p.workspace_id=p_workspace),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.get_workspace_snapshot(uuid) from public,anon;
grant execute on function public.get_workspace_snapshot(uuid) to authenticated;
commit;

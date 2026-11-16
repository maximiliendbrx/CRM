-- UNIQUEMENT pour le projet Supabase crm-dev : migrations 007 et 008 réunies.
-- Ne modifie pas l'ancien CRM ni ses données. Une erreur annule toute l'opération.
begin;
set local crm.allow_dev_migration = 'yes';
do $$ begin
 if to_regprocedure('public.get_workspace_snapshot(uuid)') is null or to_regprocedure('public.apply_workspace_changes(uuid,jsonb)') is null then raise exception 'Les migrations précédentes 004 et 005 sont requises'; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='workspace_settings' and column_name='version') then raise exception 'La migration 006 est requise'; end if;
 if to_regprocedure('public.list_workspace_members(uuid)') is not null then raise exception 'La liste des membres existe déjà ; ne relancez pas cet installateur'; end if;
end $$;
-- Développement : conserver les projets historiques après suppression du contact.
do $$ begin
 if current_setting('crm.allow_dev_migration',true) is distinct from 'yes' then
  raise exception 'Migration bloquée : confirmer le projet de développement';
 end if;
end $$;
-- Le payload historique conserve le nom et l'identifiant du contact supprimé.
-- La clé étrangère composite reste active lorsque contact_id est renseigné.
alter table public.projects alter column contact_id drop not null;
-- Développement : liste limitée aux membres confirmés de l'espace courant.
do $$ begin
 if current_setting('crm.allow_dev_migration',true) is distinct from 'yes' then raise exception 'Migration bloquée : confirmer le projet de développement'; end if;
end $$;
create function public.list_workspace_members(p_workspace uuid)
returns table(user_id uuid,email text,display_name text,role text,joined_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not crm_private.has_role(p_workspace,array['owner','admin','member']) then raise exception 'Accès refusé'; end if;
 return query select m.user_id,u.email::text,coalesce(p.display_name,''),m.role,m.created_at
 from public.workspace_members m join auth.users u on u.id=m.user_id
 left join public.profiles p on p.id=m.user_id
 where m.workspace_id=p_workspace order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,m.created_at;
end $$;
revoke all on function public.list_workspace_members(uuid) from public,anon;
grant execute on function public.list_workspace_members(uuid) to authenticated;
commit;

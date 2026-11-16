-- Développement : liste limitée aux membres confirmés de l'espace courant.
begin;
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

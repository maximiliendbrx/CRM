-- Développement uniquement : import atomique d'une sauvegarde préalablement vérifiée.
begin;
do $$ begin
 if current_setting('crm.allow_dev_migration',true) is distinct from 'yes' then
  raise exception 'Migration bloquée : confirmer le projet de développement';
 end if;
end $$;
create table public.workspace_imports (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 imported_by uuid not null references auth.users(id), imported_at timestamptz not null default now(),
 counts jsonb not null
);
alter table public.workspace_imports enable row level security;
revoke all on public.workspace_imports from public,anon,authenticated;
grant select on public.workspace_imports to authenticated;
create policy workspace_import_owner_read on public.workspace_imports for select to authenticated using (crm_private.has_role(workspace_id,array['owner']));

create function public.import_workspace_backup(p_workspace uuid,p_plan jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; name text;
begin
 perform 1 from public.workspaces where id=p_workspace for update;
 if not crm_private.has_role(p_workspace,array['owner']) then raise exception 'Accès refusé'; end if;
 if jsonb_typeof(p_plan) is distinct from 'object' then raise exception 'Plan invalide'; end if;
 foreach name in array array['companies','contacts','interactions','cold_calls','reminders','projects'] loop
  if jsonb_typeof(p_plan->name) is distinct from 'array' then raise exception 'Collection invalide : %',name; end if;
 end loop;
 if jsonb_typeof(p_plan->'settings'->'legacy_extra') is distinct from 'object' then raise exception 'Paramètres invalides'; end if;
 if exists(select 1 from public.workspace_imports where workspace_id=p_workspace)
  or exists(select 1 from public.companies where workspace_id=p_workspace)
  or exists(select 1 from public.contacts where workspace_id=p_workspace)
  or exists(select 1 from public.interactions where workspace_id=p_workspace)
  or exists(select 1 from public.cold_calls where workspace_id=p_workspace)
  or exists(select 1 from public.reminders where workspace_id=p_workspace)
  or exists(select 1 from public.projects where workspace_id=p_workspace)
  or exists(select 1 from public.workspace_settings where workspace_id=p_workspace and data <> '{}'::jsonb)
 then raise exception 'Import refusé : ce CRM contient déjà des données ou a déjà été importé'; end if;
 insert into public.companies(id,workspace_id,name,legacy_id,data)
 select x.id,p_workspace,x.name,x.legacy_id,x.data from jsonb_to_recordset(p_plan->'companies') as x(id uuid,name text,legacy_id text,data jsonb);
 insert into public.contacts(id,workspace_id,name,legacy_id,company_id,data)
 select x.id,p_workspace,x.name,x.legacy_id,x.company_id,x.data from jsonb_to_recordset(p_plan->'contacts') as x(id uuid,name text,legacy_id text,company_id uuid,data jsonb);
 insert into public.interactions(id,workspace_id,legacy_id,contact_id,data)
 select x.id,p_workspace,x.legacy_id,x.contact_id,x.data from jsonb_to_recordset(p_plan->'interactions') as x(id uuid,legacy_id text,contact_id uuid,data jsonb);
 insert into public.cold_calls(id,workspace_id,legacy_id,contact_id,data)
 select x.id,p_workspace,x.legacy_id,x.contact_id,x.data from jsonb_to_recordset(p_plan->'cold_calls') as x(id uuid,legacy_id text,contact_id uuid,data jsonb);
 insert into public.reminders(id,workspace_id,legacy_id,contact_id,data)
 select x.id,p_workspace,x.legacy_id,x.contact_id,x.data from jsonb_to_recordset(p_plan->'reminders') as x(id uuid,legacy_id text,contact_id uuid,data jsonb);
 insert into public.projects(id,workspace_id,legacy_id,contact_id,company_id,data)
 select x.id,p_workspace,x.legacy_id,x.contact_id,x.company_id,x.data from jsonb_to_recordset(p_plan->'projects') as x(id uuid,legacy_id text,contact_id uuid,company_id uuid,data jsonb);
 update public.workspace_settings set data=p_plan->'settings' where workspace_id=p_workspace;
 select jsonb_object_agg(n,jsonb_array_length(p_plan->n)) into result from unnest(array['companies','contacts','interactions','cold_calls','reminders','projects']) n;
 insert into public.workspace_imports(workspace_id,imported_by,counts) values(p_workspace,auth.uid(),result);
 return result;
end $$;
revoke all on function public.import_workspace_backup(uuid,jsonb) from public,anon;
grant execute on function public.import_workspace_backup(uuid,jsonb) to authenticated;
commit;

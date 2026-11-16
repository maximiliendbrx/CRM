-- DÉVELOPPEMENT UNIQUEMENT. Non approuvé pour production ni pour données réelles.
-- Supabase fournit auth.users, auth.uid(), les rôles authenticated/anon et pgcrypto.
begin;
do $$ begin
 if current_setting('crm.allow_dev_migration',true) is distinct from 'yes' then
  raise exception 'Migration bloquée : projet de développement confirmé et autorisation de test requis';
 end if;
end $$;
create extension if not exists pgcrypto;
create schema if not exists crm_private;
revoke all on schema crm_private from public, anon, authenticated;
grant usage on schema crm_private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '', created_at timestamptz not null default now()
);
create table public.workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120),
 owner_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.workspace_members (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','admin','member')), created_at timestamptz not null default now(),
 primary key(workspace_id,user_id)
);
create unique index workspace_one_owner on public.workspace_members(workspace_id) where role='owner';

-- Ces fonctions ne retournent qu'un booléen et évitent la récursion RLS sur les membres.
create function crm_private.has_role(p_workspace uuid, p_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace and m.user_id=(select auth.uid()) and u.email_confirmed_at is not null and m.role=any(p_roles))
$$;
revoke all on function crm_private.has_role(uuid,text[]) from public,anon;
grant execute on function crm_private.has_role(uuid,text[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
create policy profile_self_read on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy profile_self_insert on public.profiles for insert to authenticated with check (id=(select auth.uid()));
create policy profile_self_update on public.profiles for update to authenticated using (id=(select auth.uid())) with check(id=(select auth.uid()));
create policy workspace_read on public.workspaces for select to authenticated using (crm_private.has_role(id,array['owner','admin','member']));
create policy members_read on public.workspace_members for select to authenticated using (crm_private.has_role(workspace_id,array['owner','admin','member']));
revoke all on public.profiles,public.workspaces,public.workspace_members from public,anon,authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select on public.workspaces,public.workspace_members to authenticated;

-- La création est atomique et attribue le rôle de propriétaire à l'utilisateur courant.
create function public.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_workspace uuid;
begin
 if v_user is null or not exists(select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null) then raise exception 'Adresse e-mail confirmée requise'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 120 then raise exception 'Nom invalide'; end if;
 insert into public.workspaces(name,owner_id) values(trim(p_name),v_user) returning id into v_workspace;
 insert into public.workspace_members(workspace_id,user_id,role) values(v_workspace,v_user,'owner');
 insert into public.workspace_settings(workspace_id) values(v_workspace);
 insert into public.billing_accounts(workspace_id) values(v_workspace);
 return v_workspace;
end $$;
revoke all on function public.create_workspace(text) from public,anon;
grant execute on function public.create_workspace(text) to authenticated;

create function public.rename_workspace(p_workspace uuid,p_name text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_name is null or length(trim(p_name)) not between 1 and 120 then raise exception 'Nom invalide'; end if;
 perform 1 from public.workspaces where id=p_workspace for update;
 if not crm_private.has_role(p_workspace,array['owner','admin']) then raise exception 'Accès refusé'; end if;
 update public.workspaces set name=trim(p_name),updated_at=now() where id=p_workspace;
end $$;
create function public.change_workspace_member_role(p_workspace uuid,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_role is null or p_role not in ('admin','member') then raise exception 'Rôle invalide'; end if;
 perform 1 from public.workspaces where id=p_workspace for update;
 if not crm_private.has_role(p_workspace,array['owner','admin']) then raise exception 'Accès refusé'; end if;
 update public.workspace_members set role=p_role where workspace_id=p_workspace and user_id=p_user and role<>'owner';
 if not found then raise exception 'Membre introuvable ou propriétaire protégé'; end if;
end $$;
create function public.remove_workspace_member(p_workspace uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.workspaces where id=p_workspace for update;
 if not crm_private.has_role(p_workspace,array['owner','admin']) then raise exception 'Accès refusé'; end if;
 delete from public.workspace_members where workspace_id=p_workspace and user_id=p_user and role<>'owner';
 if not found then raise exception 'Membre introuvable ou propriétaire protégé'; end if;
end $$;
create function public.delete_workspace(p_workspace uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.workspaces where id=p_workspace for update;
 if not crm_private.has_role(p_workspace,array['owner']) then raise exception 'Accès refusé'; end if;
 delete from public.workspaces where id=p_workspace;
end $$;
revoke all on function public.rename_workspace(uuid,text),public.change_workspace_member_role(uuid,uuid,text),public.remove_workspace_member(uuid,uuid),public.delete_workspace(uuid) from public,anon;
grant execute on function public.rename_workspace(uuid,text),public.change_workspace_member_role(uuid,uuid,text),public.remove_workspace_member(uuid,uuid),public.delete_workspace(uuid) to authenticated;

-- Les structures métier gardent les champs d'origine dans data pendant la migration.
-- Les clés étrangères composites empêchent de lier des objets de CRM différents.
create table public.companies (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(trim(name))>0), legacy_id text, data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object'),
 unique(workspace_id,id), unique(workspace_id,legacy_id)
);
create table public.contacts (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 company_id uuid, name text not null check(length(trim(name))>0), legacy_id text,
 data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object'),
 unique(workspace_id,id), unique(workspace_id,legacy_id),
 foreign key(workspace_id,company_id) references public.companies(workspace_id,id)
);
create table public.interactions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 contact_id uuid not null, legacy_id text, data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object'),
 unique(workspace_id,id), unique(workspace_id,legacy_id),
 foreign key(workspace_id,contact_id) references public.contacts(workspace_id,id)
);
create table public.cold_calls (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 contact_id uuid, legacy_id text, data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object'),
 unique(workspace_id,id), unique(workspace_id,legacy_id),
 foreign key(workspace_id,contact_id) references public.contacts(workspace_id,id)
);
create table public.reminders (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 contact_id uuid not null, legacy_id text, data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object'),
 unique(workspace_id,id), unique(workspace_id,legacy_id),
 foreign key(workspace_id,contact_id) references public.contacts(workspace_id,id)
);
create table public.projects (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 contact_id uuid not null, company_id uuid not null, legacy_id text,
 data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object'),
 unique(workspace_id,id), unique(workspace_id,legacy_id),
 foreign key(workspace_id,contact_id) references public.contacts(workspace_id,id),
 foreign key(workspace_id,company_id) references public.companies(workspace_id,id)
);
create table public.workspace_settings (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object')
);
create table public.billing_accounts (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 plan_code text not null default 'free', stripe_customer_id text, stripe_subscription_id text
);

do $$
declare table_name text;
begin
 foreach table_name in array array['companies','contacts','interactions','cold_calls','reminders','projects','workspace_settings'] loop
  execute format('alter table public.%I enable row level security',table_name);
  execute format('revoke all on public.%I from public,anon,authenticated',table_name);
  execute format('grant select,insert,update,delete on public.%I to authenticated',table_name);
  execute format('create policy workspace_access on public.%I for all to authenticated using (crm_private.has_role(workspace_id,array[''owner'',''admin'',''member''])) with check (crm_private.has_role(workspace_id,array[''owner'',''admin'',''member'']))',table_name);
 end loop;
end $$;
alter table public.billing_accounts enable row level security;
revoke all on public.billing_accounts from public,anon,authenticated;
grant select on public.billing_accounts to authenticated;
create policy billing_owner_read on public.billing_accounts for select to authenticated using (crm_private.has_role(workspace_id,array['owner']));
commit;

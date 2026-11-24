-- Exécuter dans Supabase > SQL Editor (projet approuvé par l'entreprise). Script répétable.
-- Modèle : un CRM partagé par les membres autorisés (table crm_members). Une seule ligne de données (crm_data).

-- 1) Membres autorisés : un administrateur et des membres.
create table if not exists public.crm_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 role text not null default 'member' check (role in ('admin','member')),
 created_at timestamptz not null default now()
);
create unique index if not exists crm_members_single_admin on public.crm_members (role) where role = 'admin';
alter table public.crm_members enable row level security;
revoke all on public.crm_members from anon, authenticated;
grant select on public.crm_members to authenticated;
drop policy if exists "members_read_own" on public.crm_members;
create policy "members_read_own" on public.crm_members for select to authenticated using ((select auth.uid()) = user_id);

-- 2) Données du CRM (une ligne partagée).
create table if not exists public.crm_data (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null default '{"contacts":[],"interactions":[],"followups":[]}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.crm_data enable row level security;
-- Aucun droit pour anon ; pas de DELETE ni de TRUNCATE (TRUNCATE ignore la RLS) ; owner_id non modifiable.
revoke all on public.crm_data from anon, authenticated;
grant select, insert on public.crm_data to authenticated;
grant update (payload, updated_at) on public.crm_data to authenticated;
drop policy if exists "crm_read_own" on public.crm_data;
drop policy if exists "crm_insert_own" on public.crm_data;
drop policy if exists "crm_update_own" on public.crm_data;
drop policy if exists "crm_members_read" on public.crm_data;
drop policy if exists "crm_members_update" on public.crm_data;
drop policy if exists "crm_admin_insert" on public.crm_data;
create policy "crm_members_read" on public.crm_data for select to authenticated
 using (exists (select 1 from public.crm_members m where m.user_id = (select auth.uid())));
create policy "crm_members_update" on public.crm_data for update to authenticated
 using (exists (select 1 from public.crm_members m where m.user_id = (select auth.uid())))
 with check (exists (select 1 from public.crm_members m where m.user_id = (select auth.uid())));
create policy "crm_admin_insert" on public.crm_data for insert to authenticated
 with check (owner_id = (select auth.uid()) and exists (select 1 from public.crm_members m where m.user_id = (select auth.uid()) and m.role = 'admin'));

-- 3) Premier administrateur : remplacez l'adresse par celle d'un compte créé dans Authentication > Users.
-- insert into public.crm_members (user_id, email, role)
--  select id, email, 'admin' from auth.users where email = 'VOTRE_ADRESSE@exemple.fr'
--  on conflict (user_id) do update set role = 'admin';

-- 4) Dans Authentication > Sign In / Providers : désactiver « Allow new users to sign up ».
--    Les accès sont créés uniquement par l'administrateur (fonction manage-members, dossier supabase/functions).

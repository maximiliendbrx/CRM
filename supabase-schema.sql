-- Exécuter dans Supabase > SQL Editor sur un projet approuvé par l'entreprise.
create table if not exists public.crm_data (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null default '{"contacts":[],"interactions":[],"followups":[]}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.crm_data enable row level security;
revoke all on public.crm_data from anon;
grant select, insert, update on public.crm_data to authenticated;
drop policy if exists "crm_read_own" on public.crm_data;
drop policy if exists "crm_insert_own" on public.crm_data;
drop policy if exists "crm_update_own" on public.crm_data;
create policy "crm_read_own" on public.crm_data for select to authenticated using ((select auth.uid()) = owner_id);
create policy "crm_insert_own" on public.crm_data for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "crm_update_own" on public.crm_data for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
-- Version initiale mono-compte. Ne partagez PAS le mot de passe avec l'employeur.

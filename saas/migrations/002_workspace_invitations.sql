-- DÉVELOPPEMENT UNIQUEMENT. À ne pas exécuter en production.
-- Nécessite 001_workspace_core.sql. Aucun envoi automatique d'e-mail.
begin;
do $$ begin
 if current_setting('crm.allow_dev_migration',true) is distinct from 'yes' then
  raise exception 'Migration bloquée : projet de développement confirmé et autorisation de test requis';
 end if;
end $$;

create table public.workspace_invitations (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 email text not null check(email=lower(btrim(email)) and length(email) between 3 and 254),
 role text not null check(role in ('admin','member')),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 accepted_at timestamptz, accepted_by uuid references auth.users(id), revoked_at timestamptz,
 check(expires_at>created_at),
 check((accepted_at is null)=(accepted_by is null)),
 check(not (accepted_at is not null and revoked_at is not null))
);
alter table public.workspace_invitations enable row level security;
revoke all on public.workspace_invitations from public,anon,authenticated;

-- Jeton 244 bits aléatoires (deux UUID v4) ; seul son SHA-256 est enregistré.
-- L'appelant doit traiter la valeur renvoyée comme un secret temporaire.
create function public.create_workspace_invitation(p_workspace uuid,p_email text,p_role text)
returns table(invitation_id uuid,invitation_token text,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_email text:=lower(btrim(p_email));v_token text;v_id uuid;v_expires timestamptz;
begin
 perform 1 from public.workspaces w where w.id=p_workspace for update;
 if not crm_private.has_role(p_workspace,array['owner','admin']) then raise exception 'Accès refusé'; end if;
 if p_role is null or p_role not in ('admin','member') then raise exception 'Rôle invalide'; end if;
 if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Adresse e-mail invalide'; end if;
 v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 v_expires:=now()+interval '7 days';
 insert into public.workspace_invitations(workspace_id,email,role,token_hash,created_by,expires_at)
 values(p_workspace,v_email,p_role,encode(sha256(convert_to(v_token,'UTF8')),'hex'),auth.uid(),v_expires)
 returning id into v_id;
 return query select v_id,v_token,v_expires;
end $$;

-- Utilise uniquement l'identité et l'adresse confirmée de Supabase Auth.
-- La ligne est verrouillée pour empêcher deux acceptations simultanées.
create function public.accept_workspace_invitation(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_email text;v_inv public.workspace_invitations%rowtype;v_workspace uuid;
begin
 if v_user is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Invitation invalide ou inaccessible'; end if;
 select lower(btrim(u.email)) into v_email from auth.users u where u.id=v_user and u.email_confirmed_at is not null;
 if v_email is null then raise exception 'Adresse e-mail confirmée requise'; end if;
 select i.workspace_id into v_workspace from public.workspace_invitations i where i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if v_workspace is null then raise exception 'Invitation invalide ou inaccessible'; end if;
 perform 1 from public.workspaces w where w.id=v_workspace for update;
 select * into v_inv from public.workspace_invitations i where i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or v_inv.email<>v_email or v_inv.expires_at<=now() or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
  raise exception 'Invitation invalide ou inaccessible';
 end if;
 if exists(select 1 from public.workspace_members m where m.workspace_id=v_inv.workspace_id and m.user_id=v_user) then raise exception 'Compte déjà membre de ce CRM'; end if;
 insert into public.workspace_members(workspace_id,user_id,role) values(v_inv.workspace_id,v_user,v_inv.role);
 update public.workspace_invitations set accepted_at=now(),accepted_by=v_user where id=v_inv.id;
 return v_inv.workspace_id;
end $$;

create function public.revoke_workspace_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_workspace uuid;
begin
 select i.workspace_id into v_workspace from public.workspace_invitations i where i.id=p_invitation;
 if v_workspace is null then raise exception 'Invitation introuvable ou accès refusé'; end if;
 perform 1 from public.workspaces w where w.id=v_workspace for update;
 if not crm_private.has_role(v_workspace,array['owner','admin']) then raise exception 'Invitation introuvable ou accès refusé'; end if;
 update public.workspace_invitations set revoked_at=now() where id=p_invitation and accepted_at is null and revoked_at is null;
 if not found then raise exception 'Invitation déjà utilisée ou révoquée'; end if;
end $$;

create function public.list_workspace_invitations(p_workspace uuid)
returns table(invitation_id uuid,email text,role text,created_at timestamptz,expires_at timestamptz,state text)
language plpgsql security definer set search_path='' as $$
begin
 if not crm_private.has_role(p_workspace,array['owner','admin']) then raise exception 'Accès refusé'; end if;
 return query select i.id,i.email,i.role,i.created_at,i.expires_at,
  case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked' when i.expires_at<=now() then 'expired' else 'pending' end
 from public.workspace_invitations i where i.workspace_id=p_workspace order by i.created_at desc;
end $$;
revoke all on function public.create_workspace_invitation(uuid,text,text),public.accept_workspace_invitation(text),public.revoke_workspace_invitation(uuid),public.list_workspace_invitations(uuid) from public,anon;
grant execute on function public.create_workspace_invitation(uuid,text,text),public.accept_workspace_invitation(text),public.revoke_workspace_invitation(uuid),public.list_workspace_invitations(uuid) to authenticated;
commit;

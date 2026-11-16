-- Développement uniquement. Aucun compte maître n'est automatiquement attribué.
begin;
do $$ begin if current_setting('crm.allow_dev_migration',true) is distinct from 'yes' then raise exception 'Confirmer le projet de développement'; end if; end $$;
create table crm_private.platform_admins(user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());
alter table crm_private.platform_admins enable row level security;
revoke all on crm_private.platform_admins from public,anon,authenticated;
create function public.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from crm_private.platform_admins a join auth.users u on u.id=a.user_id where a.user_id=auth.uid() and u.email_confirmed_at is not null)
$$;
revoke all on function public.is_platform_admin() from public,anon;
grant execute on function public.is_platform_admin() to authenticated;
create function public.list_platform_accounts(p_limit integer default 50,p_offset integer default 0)
returns table(account_id uuid,email text,first_name text,last_name text,company text,created_at timestamptz,confirmed_at timestamptz,last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Accès refusé'; end if;
 if p_limit is null or p_limit<1 or p_limit>100 or p_offset is null or p_offset<0 then raise exception 'Pagination invalide'; end if;
 return query select u.id,u.email::text,coalesce(u.raw_user_meta_data->>'first_name',''),coalesce(u.raw_user_meta_data->>'last_name',''),coalesce(u.raw_user_meta_data->>'company_name',''),u.created_at,u.email_confirmed_at,u.last_sign_in_at from auth.users u order by u.created_at desc,u.id limit p_limit offset p_offset;
end $$;
revoke all on function public.list_platform_accounts(integer,integer) from public,anon;
grant execute on function public.list_platform_accounts(integer,integer) to authenticated;
commit;

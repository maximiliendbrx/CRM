-- Développement uniquement : versions et écriture atomique des paramètres de l'espace.
begin;
do $$ begin
 if current_setting('crm.allow_dev_migration',true) is distinct from 'yes' then raise exception 'Migration bloquée : confirmer le projet de développement'; end if;
end $$;
alter table public.workspace_settings add column version bigint not null default 1 check(version>0);
create trigger bump_record_version before update on public.workspace_settings for each row execute function crm_private.bump_record_version();

create or replace function public.get_workspace_records(p_workspace uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not crm_private.has_role(p_workspace,array['owner','admin','member']) then raise exception 'Accès refusé'; end if;
 select jsonb_build_object(
  'settings',(select to_jsonb(t) from public.workspace_settings t where t.workspace_id=p_workspace),
  'companies',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.companies t where t.workspace_id=p_workspace),'[]'::jsonb),
  'contacts',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.contacts t where t.workspace_id=p_workspace),'[]'::jsonb),
  'interactions',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.interactions t where t.workspace_id=p_workspace),'[]'::jsonb),
  'cold_calls',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.cold_calls t where t.workspace_id=p_workspace),'[]'::jsonb),
  'reminders',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.reminders t where t.workspace_id=p_workspace),'[]'::jsonb),
  'projects',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.projects t where t.workspace_id=p_workspace),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.apply_workspace_changes(p_workspace uuid,p_changes jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare change jsonb; payload jsonb; tab text; op text; record_id uuid; expected bigint;
 columns_sql text; values_sql text; updates_sql text; result jsonb:='[]'::jsonb; saved jsonb;
begin
 if not crm_private.has_role(p_workspace,array['owner','admin','member']) then raise exception 'Accès refusé'; end if;
 if jsonb_typeof(p_changes) is distinct from 'array' then raise exception 'Liste de modifications invalide'; end if;
 if jsonb_array_length(p_changes) not between 1 and 500 then raise exception 'Nombre de modifications invalide'; end if;
 for change in select value from jsonb_array_elements(p_changes) loop
  if jsonb_typeof(change) is distinct from 'object' then raise exception 'Modification invalide'; end if;
  tab:=change->>'table'; op:=change->>'action'; record_id:=(change->>'id')::uuid;
  payload:=change->'row'; saved:=null;
  if record_id is null or op is null or op not in ('insert','update','delete') then raise exception 'Modification invalide'; end if;
  if tab='workspace_settings' then
   if op<>'update' or record_id<>p_workspace or jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(payload->'data') is distinct from 'object' then raise exception 'Modification des paramètres invalide'; end if;
   expected:=(change->>'expected_version')::bigint;
   if expected is null or expected<1 then raise exception 'Version attendue requise'; end if;
   update public.workspace_settings as t set data=payload->'data' where workspace_id=p_workspace and version=expected returning to_jsonb(t) into saved;
   if saved is null then raise exception 'Conflit : paramètres modifiés ou inaccessibles'; end if;
   result:=result||jsonb_build_array(jsonb_build_object('table',tab,'action',op,'record',saved));
   continue;
  end if;
  case tab
   when 'companies' then columns_sql:='name'; values_sql:='$4->>''name'''; updates_sql:='name=$4->>''name''';
   when 'contacts' then columns_sql:='name,company_id'; values_sql:='$4->>''name'',nullif($4->>''company_id'','''')::uuid'; updates_sql:='name=$4->>''name'',company_id=nullif($4->>''company_id'','''')::uuid';
   when 'interactions' then columns_sql:='contact_id'; values_sql:='nullif($4->>''contact_id'','''')::uuid'; updates_sql:='contact_id=nullif($4->>''contact_id'','''')::uuid';
   when 'cold_calls' then columns_sql:='contact_id'; values_sql:='nullif($4->>''contact_id'','''')::uuid'; updates_sql:='contact_id=nullif($4->>''contact_id'','''')::uuid';
   when 'reminders' then columns_sql:='contact_id'; values_sql:='nullif($4->>''contact_id'','''')::uuid'; updates_sql:='contact_id=nullif($4->>''contact_id'','''')::uuid';
   when 'projects' then columns_sql:='contact_id,company_id'; values_sql:='nullif($4->>''contact_id'','''')::uuid,nullif($4->>''company_id'','''')::uuid'; updates_sql:='contact_id=nullif($4->>''contact_id'','''')::uuid,company_id=nullif($4->>''company_id'','''')::uuid';
   else raise exception 'Table invalide';
  end case;
  if op<>'delete' and (jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(payload->'data') is distinct from 'object') then raise exception 'Données invalides'; end if;
  if op='insert' then
   execute format('insert into public.%I as t(id,workspace_id,legacy_id,data,%s) values($1,$2,$4->>''legacy_id'',$4->''data'',%s) returning to_jsonb(t)',tab,columns_sql,values_sql)
    into saved using record_id,p_workspace,null::bigint,payload;
  else
   expected:=(change->>'expected_version')::bigint;
   if expected is null or expected<1 then raise exception 'Version attendue requise'; end if;
   if op='update' then
    execute format('update public.%I as t set data=$4->''data'',%s where id=$1 and workspace_id=$2 and version=$3 returning to_jsonb(t)',tab,updates_sql)
     into saved using record_id,p_workspace,expected,payload;
   else
    execute format('delete from public.%I as t where id=$1 and workspace_id=$2 and version=$3 returning to_jsonb(t)',tab)
     into saved using record_id,p_workspace,expected;
   end if;
   if saved is null then raise exception 'Conflit : enregistrement modifié, supprimé ou inaccessible'; end if;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('table',tab,'action',op,'record',saved));
 end loop;
 return result;
end $$;

commit;

\set ON_ERROR_STOP on
-- Utilisateurs fictifs uniquement ; ne pas exécuter en production.
insert into auth.users(id,email,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000001','owner@example.test',now()),
 ('20000000-0000-4000-8000-000000000002','wrong@example.test',now()),
 ('30000000-0000-4000-8000-000000000003','invite@example.test',now()),
 ('40000000-0000-4000-8000-000000000004','invite@example.test',null);
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false) \gset
select public.create_workspace('CRM invitations') as workspace_id \gset
select * from public.create_workspace_invitation(:'workspace_id','INVITE@example.test','member') \gset inv_
select set_config('test.token',:'inv_invitation_token',false) as token_set,set_config('test.workspace',:'workspace_id',false) as workspace_set \gset
do $$ begin
 begin
  perform count(*) from public.workspace_invitations;
  raise exception 'ÉCHEC : lecture directe des invitations';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false) \gset
do $$ begin
 begin
  perform public.accept_workspace_invitation(current_setting('test.token'));
  raise exception 'ÉCHEC : mauvaise adresse acceptée';
 exception when raise_exception then if sqlerrm<>'Invitation invalide ou inaccessible' then raise; end if; end;
 begin
  perform public.create_workspace_invitation(current_setting('test.workspace')::uuid,'x@example.test','admin');
  raise exception 'ÉCHEC : invitation par non-membre';
 exception when raise_exception then if sqlerrm<>'Accès refusé' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000004',false) \gset
do $$ begin
 begin
  perform public.accept_workspace_invitation(current_setting('test.token'));
  raise exception 'ÉCHEC : adresse non confirmée acceptée';
 exception when raise_exception then if sqlerrm<>'Adresse e-mail confirmée requise' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',false) \gset
select public.accept_workspace_invitation(:'inv_invitation_token') \gset
do $$ begin
 if (select count(*) from public.workspaces)<>1 then raise exception 'ÉCHEC : espace invité inaccessible'; end if;
 begin
  perform public.accept_workspace_invitation(current_setting('test.token'));
  raise exception 'ÉCHEC : jeton réutilisé';
 exception when raise_exception then if sqlerrm<>'Invitation invalide ou inaccessible' then raise; end if; end;
 begin
  perform public.list_workspace_invitations(current_setting('test.workspace')::uuid);
  raise exception 'ÉCHEC : invitations visibles par collaborateur';
 exception when raise_exception then if sqlerrm<>'Accès refusé' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false) \gset
select * from public.create_workspace_invitation(:'workspace_id','wrong@example.test','admin') \gset revoked_
select public.revoke_workspace_invitation(:'revoked_invitation_id');
select set_config('test.revoked',:'revoked_invitation_token',false) \gset
select * from public.create_workspace_invitation(:'workspace_id','wrong@example.test','member') \gset expired_
select set_config('test.expired',:'expired_invitation_token',false) as token_set,set_config('test.expired_id',:'expired_invitation_id',false) as id_set \gset
reset role;
update public.workspace_invitations set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=:'expired_invitation_id';
do $$ begin
 if exists(select 1 from public.workspace_invitations where token_hash=current_setting('test.token')) then raise exception 'ÉCHEC : jeton brut enregistré'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false) \gset
do $$ begin
 begin
  perform public.accept_workspace_invitation(current_setting('test.revoked'));
  raise exception 'ÉCHEC : invitation révoquée acceptée';
 exception when raise_exception then if sqlerrm<>'Invitation invalide ou inaccessible' then raise; end if; end;
 begin
  perform public.accept_workspace_invitation(current_setting('test.expired'));
  raise exception 'ÉCHEC : invitation expirée acceptée';
 exception when raise_exception then if sqlerrm<>'Invitation invalide ou inaccessible' then raise; end if; end;
end $$;
reset role;
select 'Tests locaux des invitations réussis' as resultat;

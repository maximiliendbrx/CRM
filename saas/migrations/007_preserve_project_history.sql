-- Développement : conserver les projets historiques après suppression du contact.
begin;
do $$ begin
 if current_setting('crm.allow_dev_migration',true) is distinct from 'yes' then
  raise exception 'Migration bloquée : confirmer le projet de développement';
 end if;
end $$;
-- Le payload historique conserve le nom et l'identifiant du contact supprimé.
-- La clé étrangère composite reste active lorsque contact_id est renseigné.
alter table public.projects alter column contact_id drop not null;
commit;

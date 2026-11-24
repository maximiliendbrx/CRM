# B&B CRM

Un CRM minimaliste et autonome pour suivre :

- les contacts et leurs entreprises ;
- les interactions (appel, e-mail, réunion, note) ;
- les relances, affichées chronologiquement et marquées comme terminées.

## Démarrer

Le site peut être servi par un hébergement statique HTTPS, ou lancé localement :

```bash
cd crm-prototype
python3 -m http.server 8000
```

Puis consulter `http://localhost:8000`.

## Stockage et confidentialité

Les données sont stockées uniquement dans le `localStorage` du navigateur, sous la clé `pulse-crm-v2`. Le CRM démarre vide : aucune donnée commerciale personnelle ni aucun secret n'est inclus.

Dans Paramètres, le téléchargement d'une sauvegarde produit un ZIP contenant le code actuel dans `site/`, les données de la sauvegarde dans `donnees-privees/` et un guide de réinstallation. Publiez uniquement `site/` : ne publiez jamais le dossier de données privées. Après publication, importez le fichier JSON privé dans Paramètres > Sauvegardes. Le ZIP n'inclut ni identifiants Supabase, ni sauvegarde du projet Supabase lui-même. La liste `SITE_FILES` dans `backup-bundle.js` doit être mise à jour lorsqu'un fichier nécessaire au site est ajouté.

Avec la connexion Supabase, la copie locale n'est qu'un cache de travail : la source de vérité est la base partagée.

## Publication GitHub

Le dossier est prêt à être initialisé et poussé dans un dépôt GitHub. Aucune clé, jeton, fichier `.env` ou donnée réelle ne doit être ajouté au dépôt.

## Connexion et synchronisation (Supabase)

L'accès au CRM exige une connexion : aucune donnée n'est chargée avant l'authentification et le site ne propose **aucune inscription**. La protection réelle des données repose sur la base : les règles Row Level Security (RLS) de `supabase-schema.sql` limitent le CRM aux membres autorisés (table `crm_members`). Le code du site, lui, reste public (GitHub Pages) : n'y mettez jamais de secret.

Mise en place :

1. Exécuter `supabase-schema.sql` dans Supabase > SQL Editor, puis créer le compte administrateur dans Authentication > Users et l'enregistrer comme administrateur (étape 3 du script).
2. Dans Authentication > Sign In / Providers, **désactiver « Allow new users to sign up »** : seules les invitations de l'administrateur créent des comptes.
3. Déployer la fonction `supabase/functions/manage-members` (Edge Function). Elle utilise la clé secrète côté serveur uniquement ; l'administrateur crée ainsi des accès depuis Paramètres > Utilisateurs.
4. `supabase-config.js` contient l'URL du projet et la clé **publishable** (publique par conception). Ne jamais y placer la clé secrète ou `service_role`.

Fonctionnement :

- Tous les comptes partagent le même CRM. Chaque enregistrement est envoyé à Supabase ; si deux personnes modifient en même temps, les changements sont fusionnés fiche par fiche (en cas de modification de la même fiche, la version de la personne qui enregistre l'emporte).
- Invitation : Paramètres > Utilisateurs > e-mail de la personne. Un mot de passe temporaire est affiché une seule fois et doit être transmis par l'administrateur ; la personne le change à sa première connexion. L'administrateur peut aussi générer un nouveau mot de passe temporaire ou supprimer un accès.
- Chacun peut changer son mot de passe dans Paramètres > Mon compte. La réinitialisation et l'import de sauvegarde sont réservés à l'administrateur.
- À la déconnexion, les copies locales (données et sauvegardes automatiques) de l'appareil sont effacées.

Limites : pas de journal d'audit, pas de droits fins par fiche, pas de « mot de passe oublié » en libre-service (l'administrateur génère un nouveau mot de passe temporaire ; pour le compte administrateur, utiliser le tableau de bord Supabase). La bibliothèque Supabase est chargée depuis un CDN public : l'héberger dans `vendor/` réduirait cette dépendance. N'utiliser avec de vraies données professionnelles qu'après validation juridique, sécurité et RGPD.

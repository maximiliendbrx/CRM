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

Ce choix convient à un prototype mono-utilisateur. Pour un usage partagé ou de production, remplacer ce stockage par une API authentifiée, une base de données avec contrôle d'accès et une politique de rétention.

## Publication GitHub

Le dossier est prêt à être initialisé et poussé dans un dépôt GitHub. Aucune clé, jeton, fichier `.env` ou donnée réelle ne doit être ajouté au dépôt.

## Synchronisation Supabase (optionnelle)

Le CRM fonctionne toujours en local sans Supabase. Pour activer la synchronisation après validation de l'employeur :

1. Créer un projet Supabase dont l'organisation maîtrise les accès et l'hébergement, puis exécuter `supabase-schema.sql` dans SQL Editor.
2. Dans Supabase Authentication > Users, créer un utilisateur autorisé (ou configurer une invitation sécurisée). Ne pas mettre le mot de passe dans GitHub.
3. Ouvrir le CRM > Paramètres > Synchronisation et renseigner **Project URL** et **publishable key** (ou `anon` key). La clé `service_role` et les autres clés secrètes ne doivent **jamais** être placées dans un navigateur.
4. Se connecter avec le compte créé. **Depuis l'ordinateur qui contient les contacts**, cliquer sur « Importer les contacts locaux » avant de commencer à travailler sur un second appareil.
5. Sur l'autre appareil, configurer le même projet et se connecter avec le même compte pour récupérer les données.

Les règles Row Level Security limitent chaque enregistrement à son propriétaire `owner_id`. Ce prototype n'offre pas encore de gestion multi-utilisateurs distincts, de journal d'audit ou de résolution de conflits d'édition simultanée. Ne pas partager un compte/mot de passe pour donner accès à l'employeur. Les sauvegardes locales restent indispensables et les modifications concurrentes peuvent se remplacer. N'utiliser avec de vraies données professionnelles qu'après validation juridique, sécurité et RGPD.

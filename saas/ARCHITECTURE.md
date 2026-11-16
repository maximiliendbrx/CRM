# Transformation SaaS — audit et plan de développement

État : préparation sur `dev/saas-multi-utilisateur`. Ce document ne constitue pas une validation de sécurité ou de migration. Ne pas déployer la branche sur GitHub Pages ni appliquer les migrations envisagées en production sans autorisation explicite et validation des tests.

## Audit du dépôt existant

- Site statique HTML/CSS/JavaScript, branche de production `main`, GitHub Pages. Les modifications de `main` peuvent déclencher une publication : toute expérimentation reste sur la branche de développement.
- `app.js` conserve l'état dans `localStorage` (`pulse-crm-v2`) : contacts, interactions, relances (`followups`), entreprises, cold calls, projets et catalogues. Les objets ont été enrichis progressivement ; certaines collections et dates manquent dans les anciennes données.
- `cloud.js` synchronise une copie complète JSON dans `public.crm_data`, une ligne par `owner_id`, avec authentification Supabase et un contrôle de version sur `updated_at`. Le schéma fourni (`supabase-schema.sql`) limite les lignes à leur propriétaire via RLS. Il ne modélise ni CRM multiples ni collaboration. Les suppressions et modifications du navigateur connecté peuvent se répercuter sur le cloud.
- Paramètres et objectifs sont séparés dans `bb-crm-settings-v1` et `bb-crm-goals-v1`. Les sauvegardes `bb-crm-backups-v1` contiennent principalement l'objet de données ; les coordonnées de connexion, objectifs et paramètres ne sont pas nécessairement couverts. Les archives ZIP téléchargées contiennent le code actuel et une copie JSON séparée. `bb-crm-precloud-data-v1` peut contenir une ancienne copie locale ; `bb-crm-cloud-pending-v1` indique des changements non synchronisés. Ne pas écraser ces clés.
- Le dépôt décrit une table Supabase, mais ne prouve pas l'état réel du projet en production, la présence d'autres tables ou extensions, les utilisateurs, les politiques effectives, la configuration Auth ou l'exhaustivité des données. Aucun accès au projet Supabase réel ni aux données du navigateur n'a été fourni à cet environnement ; aucun inventaire des données distantes et aucune sauvegarde réelle ne peuvent être certifiés ici.
- Les entreprises historiques sont regroupées par nom normalisé ; leurs identifiants ne sont pas toujours présents. Les projets conservent aussi un nom d'entreprise historique. Les champs facultatifs, anciennes variantes de libellés et références orphelines devront être conservés ou signalés, jamais écartés silencieusement.

## 1. Architecture retenue

Frontend statique conservant le design actuel, séparé en deux états : Auth + galerie, puis CRM sélectionné. Supabase Auth gère inscription, vérification de l'adresse, connexion, récupération de mot de passe et session persistante. La seule clé embarquée est la clé publique du projet de développement. La protection visuelle du frontend ne remplace jamais RLS.

Un compte Auth identifie un utilisateur. Un `workspace` représente un CRM. La sélection d'un CRM fixe le contexte de toutes les lectures, mutations et exports ; un changement d'espace annule les requêtes en cours, vide les vues et isole les caches locaux par identifiant d'utilisateur et d'espace. Les réponses arrivées après changement de contexte sont ignorées. Les réglages commerciaux et objectifs deviennent propres au CRM ; les réglages purement locaux restent sur l'appareil. Pas de synchronisation de l'ancien blob global vers un espace sans migration explicite.

La source de vérité commerciale devient relationnelle, avec accès direct limité par RLS et opérations administratives sensibles via fonctions serveur. Éviter le modèle « télécharger tout le CRM, puis écraser le blob » pour les écritures collaboratives : des mutations par enregistrement, des versions et la détection de conflits sont nécessaires. Les sauvegardes/exportations sont limitées au CRM autorisé ; ne jamais placer de données privées ou clés secrètes dans le dépôt ou dans l'archive de code publique.

## 2. Schéma relationnel cible

| Entité | Contenu et contraintes principales |
| --- | --- |
| `profiles` | `id` lié à `auth.users`, nom affiché ; e-mail vérifié vérifié côté Auth, jamais considéré comme fiable depuis une colonne modifiable par le client. |
| `workspaces` | UUID, nom, propriétaire et dates ; création et suppression contrôlées côté serveur. Un propriétaire ne peut pas être retiré ou rétrogradé sans procédure explicite de transfert. |
| `workspace_members` | `(workspace_id,user_id)` unique, rôle `owner`, `admin` ou `member` ; accès aux membres borné à l'espace autorisé. |
| `workspace_invitations` | espace, e-mail normalisé, rôle autorisé, **hash** du jeton, expiration, état, créateur et timestamps ; jamais de jeton brut en base. |
| `companies`, `contacts` | UUID + `workspace_id`, champs existants, date et identifiant historique ; au plus une entreprise par contact. Les noms historiques nécessitent un rapprochement explicite en cas d'ambiguïté. |
| `interactions`, `cold_calls`, `reminders`, `projects` | UUID + `workspace_id`, champs métier existants et liens éventuels vers contact et entreprise ; dates et statut préservés. Les cold calls sans contact restent valides. |
| `workspace_settings` | objectifs, catalogues de secteurs/fonctions et paramètres partagés, propres à l'espace. |
| `billing_accounts`, `plans` | facturation par espace, identifiants Stripe futurs et métadonnées de plan ; aucune activation, limite ou opération de paiement. |

Chaque relation métier entre deux lignes d'un même espace utilise une clé étrangère composite incluant `workspace_id` (et une contrainte unique correspondante), y compris interactions/contact, relances/contact, projets/contact et cold calls/contact. Les valeurs supprimées ou orphelines sont traitées par une politique explicite et un rapport de migration ; pas de `CASCADE` aveugle sur les données à préserver. Champs `legacy_id`/`legacy_payload` et journal d'import permettent de conserver les extensions et de réconcilier les éléments.

## 3. Migrations SQL à préparer puis tester

1. Dans un projet Supabase **distinct**, créer tables, index, contraintes composites et fonctions dédiées avec `search_path` verrouillé, privilèges minimaux et RLS activée et forcée lorsque pertinent. Ne pas modifier `crm_data` en production.
2. Accorder l'accès aux seules lignes d'espaces dont `auth.uid()` est membre ; vérifier `USING` **et** `WITH CHECK` pour SELECT/INSERT/UPDATE/DELETE. Vérifier séparément les tables Auth, facturation et invitations. Les vues et fonctions ne doivent pas contourner involontairement RLS.
3. Encadrer les mutations de membres et rôles par des fonctions serveur transactionnelles ; interdire la promotion arbitraire, les modifications croisées et le retrait du propriétaire. Un administrateur gère uniquement les rôles autorisés, sans supprimer le CRM ou modifier le propriétaire.
4. Préparer un import transactionnel idempotent de l'export validé : espace initial créé pour l'utilisateur confirmé, mapping des identifiants, rapprochement entreprises, contrôles de comptage et intégrité, conservation des champs inconnus. Les paramètres et objectifs locaux font l'objet d'un export séparé et d'un choix de migration explicite.
5. Une première migration de fondation (`migrations/001_workspace_core.sql`) est préparée pour les espaces, membres et données métier ; elle n'est pas appliquée à Supabase. Elle a été vérifiée uniquement sur PostgreSQL local avec un substitut d'Auth, ce qui ne valide pas l'environnement Supabase réel. Elle ne met pas encore en place les invitations, l'import ni l'interface. Sa sécurité et sa compatibilité doivent être vérifiées sur une instance Supabase distincte avant toute utilisation et les scripts doivent être accompagnés d'un plan inverse.

## 4. Frontend et fonctionnalités

Créer des écrans d'inscription/connexion, confirmation d'e-mail, récupération et galerie « Mes CRM » ; gérer les liens d'invitation dans tous les états de session. Ajouter création/renommage/suppression contrôlés et retour à la galerie. Dans Paramètres, afficher membres, rôles et invitations, selon les permissions réelles retournées par le serveur.

Un premier prototype isolé d'authentification et de galerie est disponible dans `saas/dev/`. Il est limité à l'URL du projet de développement, utilise une clé publique saisie localement et charge une version locale du SDK Supabase. Le jeton d'invitation est retiré de l'URL avant le chargement des autres scripts. Il propose un aperçu expérimental en lecture seule ; les écrans complets du CRM, leurs modifications et la gestion des collaborateurs ne sont pas encore raccordés. Les migrations ne sont pas appliquées au projet de développement ; ne pas confondre le test simulé du prototype avec une validation réelle d'Auth ou de la synchronisation.

Adapter progressivement contacts, entreprises, interactions, notes, cold calls, relances, projets, graphiques, rapports Excel et sauvegardes à des requêtes bornées au workspace. Préserver les fonctionnalités actuelles, y compris les anciennes données et les rapports. Une validation par écran et un test de changement rapide d'espace sont requis ; ne pas considérer l'interface actuelle comme déjà multi-utilisateur.

## 5. Invitations par lien

Fonctions serveur authentifiées : création par propriétaire/admin, rôle limité à `admin` ou `member`, adresse normalisée, génération cryptographique d'un jeton aléatoire, stockage du hash uniquement et expiration de sept jours. Le jeton brut est retourné une seule fois pour être copié ; ne pas le journaliser. Pas d'envoi automatique d'invitation. Une première version SQL de ces fonctions existe dans `migrations/002_workspace_invitations.sql` et a été testée uniquement sur PostgreSQL local simulant Auth ; elle n'est pas déployée ni validée sur Supabase, et le lien utilisable dans le frontend reste à réaliser.

À l'ouverture du lien, conserver temporairement le jeton côté navigateur, puis demander connexion ou inscription et vérification de l'adresse. Après authentification, une fonction serveur vérifie le JWT et l'adresse **confirmée** issue d'Auth, le hash, l'expiration, l'absence de révocation et le rôle ; elle verrouille la ligne d'invitation et réalise consommation unique + création du membre dans une transaction. Éviter la fuite du jeton via journaux, référents et ressources tierces. L'annulation, la révocation et deux acceptations concurrentes doivent être testées. Les e-mails de confirmation et récupération restent ceux de Supabase Auth.

## 6. Étapes et tests

1. Obtenir un projet Supabase de développement et sa configuration publique via un canal approprié, jamais de clé secrète dans le chat. Préparer une sauvegarde réelle et distincte de la production, ainsi que l'export du navigateur source et des paramètres/objectif locaux. Ne pas importer de données réelles dans le développement sans accord et protection appropriée ; utiliser d'abord des données fictives.
2. Implémenter SQL et fonctions d'administration dans la branche, avec tests directs sur l'instance de développement. Tester tous les rôles, tous les CRUD, clés étrangères croisées, changements de rôle, accès révoqué, contournements RLS, propriétaire et isolation entre espaces. Tester aussi les invitations mauvaise adresse, jeton réutilisé, expiré, révoqué et concurrence.
3. Implémenter Auth, galerie et collaborations ; tester inscription avec confirmation, récupération, session et utilisateur invité avec et sans compte, et vérifier tous les accès réseau directs indépendamment de l'interface.
4. Migrer les écrans métier un par un, avec tests de non-régression : contacts, entreprises, historiques, cold calls, relances, projets, tableau de bord, rapports et sauvegardes. Tester deux sessions collaboratrices et changement d'espace en cours de requête.
5. Répéter une migration sur une copie de test, vérifier comptes, champs, références, éléments orphelins, comptages, sommes, dates et export/restauration. Comparer à la source sans journaliser de données personnelles. Une simple vérification de format ou un export ZIP ne prouve pas une restauration complète.

## 7. Migration de production et retour arrière

Avant toute bascule : accord explicite, gel temporaire des écritures, sauvegardes vérifiées de la base et des navigateurs concernés, mesures de référence et répétition complète sur développement. Prévoir une fenêtre de maintenance et ne pas mélanger modifications anciennes/nouvelles pendant la migration. Importer vers un espace initial, vérifier données, accès et rapports, puis seulement déployer après validation explicite.

En cas d'échec avant ouverture aux utilisateurs, garder `main` et l'ancienne base inchangées. Après bascule, figer les écritures, sauvegarder l'état nouveau, comparer les modifications intervenues et décider explicitement comment les réconcilier avant retour vers l'ancienne version. Ne pas restaurer aveuglément une ancienne sauvegarde sur des données nouvelles. Conserver les sauvegardes de façon chiffrée et contrôlée selon la politique de l'organisation.

## Outil de précontrôle local

`node saas/verify-backup.mjs CHEMIN` accepte un JSON de sauvegarde ou le ZIP actuel, calcule son SHA-256, vérifie la structure de base et signale les identifiants dupliqués et références orphelines, sans imprimer les données. Il ne modifie aucun fichier ni aucune base. Il ne vérifie ni les données Supabase non exportées, ni la restauration dans une base isolée : une répétition de restauration complète reste obligatoire.

## Préparation de l'import de sauvegarde

`import-plan.mjs` prépare localement les lignes sans effectuer de connexion ni modifier la sauvegarde. Il conserve les objets d'origine dans `data`, résout les entreprises par nom normalisé, garde les cold calls indépendants, et refuse les références absentes et les noms d'entreprise ambigus. Les éléments non reconnus, dont les catalogues, sont gardés dans `settings.legacy_extra`. Les objectifs et paramètres absents du ZIP ne peuvent pas être reconstitués.

`003_workspace_import.sql` ajoute une fonction transactionnelle réservée au propriétaire d'un CRM vide : insertion des collections et des paramètres ou annulation intégrale en cas d'erreur, avec refus d'un second import. Ne pas l'exécuter en production avant intégration, audit et essais Supabase. Le plan n'est pas encore connecté à une interface d'import, et cette fonction ne résout pas la synchronisation collaborative des écrans existants.

Le 16 novembre 2026, un essai isolé dans un conteneur PostgreSQL jetable a comparé les six collections et les catalogues de la sauvegarde fournie aux données importées. Le conteneur a ensuite été supprimé. Ceci ne prouve ni l'exhaustivité d'autres appareils ou du cloud, ni la compatibilité avec Supabase réel.

L'interface de test comporte désormais un sélecteur ZIP/JSON et une prévisualisation des comptes, suivis d'un import explicite dans un CRM vide. Le fichier est préparé dans le navigateur, puis transmis au projet de développement par la session de l'utilisateur ; il n'est pas envoyé à GitHub. Le parcours a été testé avec des données fictives et un Supabase simulé, pas encore avec Supabase réel. Le CRM complet ne s'ouvre toujours pas depuis cette interface : ne pas la présenter comme un produit prêt à l'emploi.

## Lecture isolée en développement

`004_workspace_snapshot.sql` fournit un instantané de lecture de chaque espace, en conservant les RLS et en vérifiant l’appartenance. `workspace-reader.mjs` annule les lectures dont le contexte ou le compte change et ne conserve aucun cache. Un aperçu séparé en lecture seule n’expose que les totaux et noms de contacts/entreprises. Les contrôles incluent l’isolation de deux espaces avec un tiers non membre, et une comparaison des six collections et catalogues d’une sauvegarde dans PostgreSQL jetable. Les sauvegardes utilisées dans ce test ont été détruites avec le conteneur. La migration 004 n’a pas été appliquée sur Supabase ; aucune écriture collaborative ni intégration du CRM complet ne sont encore disponibles.

## Modifications concurrentes préparées

La migration de développement `005_workspace_changes.sql` ajoute une version à chaque ligne métier. Une fonction transactionnelle applique des modifications bornées à un espace et refuse les versions périmées ; les déclencheurs font aussi avancer la version lors des mises à jour directes. Les clés étrangères composites continuent d'interdire les liens entre espaces. L'adaptateur `workspace-writer.mjs` ne rejoue pas automatiquement une transaction dont le résultat est incertain et détecte les changements de session. Les essais sur PostgreSQL jetable ont couvert deux écritures concurrentes, les annulations de lots, les liens entre espaces et un utilisateur non membre ; ils ne remplacent pas les essais contre le service Supabase. Le SQL Editor de crm-dev a affiché Success pour cette migration ; ses fonctions restent à tester sur Supabase réel. Le CRM existant n'utilise pas encore l'adaptateur. Les paramètres et objectifs ne sont pas encore traités par ces opérations.

## Adaptation du modèle métier

La migration 006 versionne les paramètres et inclut leur modification dans le même lot transactionnel que les fiches. `workspace-changes.mjs` construit les modifications à partir des lignes et de l’état chargé, en conservant les liens et champs historiques, et refuse les données ambiguës. `workspace-model.mjs` coordonne lecture, modification et relecture sans cache, et impose un rechargement après conflit ou résultat incertain. Les tests couvrent aussi un aller-retour isolé avec la sauvegarde fournie ; le conteneur jetable a été supprimé. Ces composants ne sont pas encore raccordés aux écrans de production ; la migration 006 et le comportement réel Supabase restent à vérifier. Les objectifs et réglages historiques non inclus dans le ZIP restent absents.

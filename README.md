# B&B CRM

Un CRM minimaliste et autonome pour suivre :

- les contacts et leurs entreprises ;
- les interactions (appel, e-mail, réunion, note) ;
- les relances, affichées chronologiquement et marquées comme terminées.

## Démarrer

Ce prototype n'a aucune dépendance. Ouvrir `index.html` dans un navigateur, ou lancer :

```bash
cd crm-prototype
python3 -m http.server 8000
```

Puis consulter `http://localhost:8000`.

## Stockage et confidentialité

Les données sont stockées uniquement dans le `localStorage` du navigateur, sous la clé `pulse-crm-v2`. Le CRM démarre vide : aucune donnée commerciale personnelle ni aucun secret n'est inclus.

Ce choix convient à un prototype mono-utilisateur. Pour un usage partagé ou de production, remplacer ce stockage par une API authentifiée, une base de données avec contrôle d'accès et une politique de rétention.

## Publication GitHub

Le dossier est prêt à être initialisé et poussé dans un dépôt GitHub. Aucune clé, jeton, fichier `.env` ou donnée réelle ne doit être ajouté au dépôt.

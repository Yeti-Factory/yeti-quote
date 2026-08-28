# Déploiement Coolify — Yeti Quote Builder

Ce dépôt contient désormais l’application et son backend PostgreSQL natif. Aucun service externe de base de données ou d’authentification n’est requis.

## Application

1. Créer une ressource Docker Compose dans Coolify à partir de ce dépôt.
2. Utiliser `compose.ovh.yaml`.
3. Associer le domaine `yeti-quote.yeti-factory.com` au service `app`, port `3000`.
4. Le point de contrôle est `GET /`.

## Variables obligatoires

Coolify génère automatiquement les secrets techniques grâce aux variables magiques présentes dans `compose.ovh.yaml` :

- `SERVICE_PASSWORD_64_POSTGRES`
- `SERVICE_BASE64_64_BETTERAUTH`

La variable suivante est à saisir :

- `APP_BASE_URL`, avec l’URL exacte de l’environnement (temporaire pendant la recette, puis domaine Yeti Factory lors de la bascule)

Yeti Quote n’envoie aucun e-mail. Les créations et réinitialisations d’accès sont administrées localement sur le VPS.

## Import initial

L’import se fait une seule fois, sur l’environnement isolé, avant la bascule DNS :

```sh
node server/import-export.mjs /chemin/vers/yeti-quote-2026-08-28
```

Le script vérifie le manifeste, importe les données métier et crée les comptes natifs. Les anciens mots de passe ne sont pas récupérables.

## Réinitialisation locale d’un accès

Dans le terminal du conteneur `app`, saisir soi-même le nouveau mot de passe lorsqu’il est demandé par le shell :

```sh
read -s -p "Nouveau mot de passe : " YETI_QUOTE_NEW_PASSWORD; echo
export YETI_QUOTE_NEW_PASSWORD
YETI_QUOTE_ADMIN_EMAIL="utilisateur@yeti-factory.com" npm run set-password
unset YETI_QUOTE_NEW_PASSWORD
```

Le mot de passe n’est ni affiché ni envoyé à un service tiers. Toutes les sessions existantes du compte sont révoquées.

## Ordre de bascule

1. Déployer sur une URL temporaire.
2. Importer et comparer les compteurs attendus : 4 réglages, 7 clients, 17 dossiers, 2 profils et 3 rôles.
3. Définir localement le mot de passe administrateur, puis tester connexion, consultation et création d’un devis.
4. Basculer le domaine public seulement après validation.
5. Conserver l’ancien service intact pendant la période de retour arrière.

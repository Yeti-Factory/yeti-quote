# Yeti Quote

Application interne Yeti Factory de calcul de prix et de gestion des dossiers clients.

## Hébergement

L'application est construite depuis GitHub par Coolify, puis exécutée sur le VPS OVH dans un conteneur Node.js. Elle utilise encore Supabase pour l'authentification et les données, et Resend pour les invitations par email.

Le projet utilise uniquement des outils standards et peut être construit sans plateforme propriétaire.

## Développement local

1. Copier `.env.example` vers `.env` et renseigner les variables nécessaires.
2. Installer les dépendances avec `npm ci`.
3. Lancer l'application avec `npm run dev`.
4. Vérifier une version de production avec `npm run build`.

Ne jamais enregistrer de véritables secrets dans Git. Les variables de production doivent être configurées dans Coolify.

Voir `COOLIFY.md` pour la configuration du déploiement.

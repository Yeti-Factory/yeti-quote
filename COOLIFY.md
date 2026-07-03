# ---- Coolify ----

# Backend / calcul de prix Yeti Factory — repo prêt Docker.

#

# 1. Créer une application "Dockerfile" dans Coolify, source = ce repo Git.

# 2. Renseigner les variables d'environnement (voir .env.example).

# - VITE\_\* doivent être passées AUSSI en Build Arg (docker build --build-arg)

# car Vite les inline dans le bundle client au moment du build.

# - Les autres SUPABASE\_\* / SUPABASE_SERVICE_ROLE_KEY sont uniquement runtime.

# 3. Port exposé : 3000 (voir Dockerfile / package.json > "start").

# 4. Domaine : mapper www.yeti-lab.fr vers l'app dans Coolify.

# 5. Health check : GET / (retourne la page de connexion).

#

# Rebuild automatique : activer le webhook GitHub dans Coolify.

#

# NOTE : le script `npm run build:node` utilise la syntaxe shell POSIX

# (`NITRO_PRESET=node-server vite build`) et ne fonctionne donc que sous

# Linux/macOS ou dans le conteneur Docker. Sous Windows, utiliser WSL,

# Docker Desktop, ou exécuter `set NITRO_PRESET=node-server && vite build`

# (cmd) / `$env:NITRO_PRESET="node-server"; vite build` (PowerShell).

# ---- Emails / invitations d'installation PWA ----

# Variables runtime supplémentaires (à renseigner dans Coolify → Environment):

# - RESEND_API_KEY : clé API Resend (https://resend.com), server-only.

# - EMAIL_FROM : "Yeti Factory <no-reply@yeti-lab.fr>" (le domaine doit être vérifié dans Resend).

# - APP_PUBLIC_URL : "https://yeti-quote.yeti-lab.fr" (URL publique utilisée dans les liens d'installation).

# Sans ces trois variables, la fonction serveur d'envoi d'invitation retourne une erreur explicite.

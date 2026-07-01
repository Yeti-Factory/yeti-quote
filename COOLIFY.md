# ---- Coolify ----
# Backend / calcul de prix Yeti Factory — repo prêt Docker.
#
# 1. Créer une application "Dockerfile" dans Coolify, source = ce repo Git.
# 2. Renseigner les variables d'environnement (voir .env.example).
#    - VITE_* doivent être passées AUSSI en Build Arg (docker build --build-arg)
#      car Vite les inline dans le bundle client au moment du build.
#    - Les autres SUPABASE_* / SUPABASE_SERVICE_ROLE_KEY sont uniquement runtime.
# 3. Port exposé : 3000 (voir Dockerfile / package.json > "start").
# 4. Domaine : mapper www.yeti-lab.fr vers l'app dans Coolify.
# 5. Health check : GET / (retourne la page de connexion).
#
# Rebuild automatique : activer le webhook GitHub dans Coolify.

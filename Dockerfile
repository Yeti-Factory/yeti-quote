# --- Yeti Factory — calcul prix ---
# Dockerfile prêt pour Coolify (ou tout hébergeur Docker).
# Build TanStack Start avec le preset Nitro "node-server" puis exécute
# .output/server/index.mjs avec Node.
#
# Variables d'environnement à définir dans Coolify :
#   DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, TRUSTED_ORIGINS
#   RESEND_API_KEY, EMAIL_FROM, APP_PUBLIC_URL
#   NITRO_PRESET=node-server   (déjà positionné ci-dessous à la build)
#   PORT=3000                  (port d'écoute Node runtime)

# ---------- Stage 1 : build ----------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Force Nitro à produire une sortie Node standalone
ENV NITRO_PRESET=node-server
RUN npm run build
RUN npm prune --omit=dev

# ---------- Stage 2 : runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server

EXPOSE 3000
CMD ["sh", "-c", "npm run migrate && node .output/server/index.mjs"]

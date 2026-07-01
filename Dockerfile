# --- Yeti Factory — calcul prix ---
# Dockerfile prêt pour Coolify (ou tout hébergeur Docker).
# Build TanStack Start avec le preset Nitro "node-server" puis exécute
# .output/server/index.mjs avec Node.
#
# Variables d'environnement à définir dans Coolify :
#   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID
#   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_PROJECT_ID
#   SUPABASE_SERVICE_ROLE_KEY  (server-only, requis si code admin s'en sert)
#   NITRO_PRESET=node-server   (déjà positionné ci-dessous à la build)
#   PORT=3000                  (port d'écoute Node runtime)

# ---------- Stage 1 : build ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Installe bun (aligné avec la stack Lovable)
RUN apk add --no-cache bash curl unzip \
    && curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

# Force Nitro à produire une sortie Node standalone
ENV NITRO_PRESET=node-server
# Les VITE_* doivent être présentes au moment du build (inlinées côté client)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

RUN bun run build

# ---------- Stage 2 : runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

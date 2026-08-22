# ============================================================
# DELIS — single image: frontend (built) + API + Telegram bot
# ============================================================

# ---- Stage 1: build the frontend (single-file bundle) ----
FROM node:20-bookworm AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# "/" → same-origin: Fastify serves BOTH the API (/v1/*) and this frontend
ARG VITE_API_URL=/
RUN VITE_API_URL=${VITE_API_URL} npm run build

# ---- Stage 2: backend + static hosting ----
FROM node:20-bookworm
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./server/
RUN cd server && npm ci

COPY server/ ./server/
RUN cd server && npx tsc

# Static frontend served by Fastify
COPY --from=frontend /app/dist /app/server/public

ENV NODE_ENV=production
ENV PORT=3001
ENV SEED_ON_START=true
ENV ENABLE_SEEDED_PROMOS=false
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

WORKDIR /app/server
CMD ["node", "dist/index.js"]

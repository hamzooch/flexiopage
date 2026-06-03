# FlexioPage Backend - Production Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
# Seed / CLI scripts (seed:admin, seed:test-store, dispatch:test-order…).
# They stay in scripts/ as TypeScript files; tsx is now a prod dep and
# executes them on the fly via `npm run seed:*`.
COPY scripts ./scripts
# Les scripts importent depuis '../src/...' (config, models, services).
# tsx résout les chemins relatifs à partir du fichier source — on copie
# donc src/ aussi pour que les `npm run seed:*` fonctionnent en prod
# sans avoir à pré-builder les scripts ou bricoler les imports.
COPY src ./src

EXPOSE 5000

CMD ["node", "dist/index.js"]

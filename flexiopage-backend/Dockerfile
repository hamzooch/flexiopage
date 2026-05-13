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

EXPOSE 5000

CMD ["node", "dist/index.js"]

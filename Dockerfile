# Multi-stage production build for Brand Digital Twin OS
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# Compile TypeScript files (fails the build on type errors)
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
# If running compiled JS:
# CMD ["node", "dist/server.js"]
# For development/simulations:
CMD ["node", "dist/server.js"]

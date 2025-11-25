# syntax=docker/dockerfile:1.7

# Base image with Node 20 (multi-arch: supports amd64 + arm64)
FROM node:20-alpine AS base
WORKDIR /app

# --- Builder stage: install deps + build TypeScript ---
FROM base AS builder

# If native deps are added later, uncomment:
# RUN apk add --no-cache python3 make g++

# Copy manifests
COPY package.json package-lock.json tsconfig.json ./

# Install all dependencies (prod + dev) deterministically
RUN npm ci

# Copy source and build
COPY src ./src
RUN npm run build

# --- Runtime stage: minimal image with only prod deps + dist ---
FROM base AS runner

ENV NODE_ENV=production
WORKDIR /app

# Copy manifests
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Run as non-root user provided by base image
USER node

# Container listens on PORT (default 3000)
EXPOSE 3000
ENV PORT=3000

# Start the MCP HTTP server
CMD ["node", "dist/server.js"]


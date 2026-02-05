# =============================================================================
# Multi-stage Dockerfile for Agent Rupert
#
# Build command:
#   docker build -t cr.vetra.io/rupert/agent-rupert:<tag> .
# =============================================================================

# -----------------------------------------------------------------------------
# Base stage: Common setup for building
# -----------------------------------------------------------------------------
FROM node:24-alpine AS base

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git bash \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Setup pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# Configure JSR registry
RUN pnpm config set @jsr:registry https://npm.jsr.io

# -----------------------------------------------------------------------------
# Build stage
# -----------------------------------------------------------------------------
FROM base AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies (--ignore-scripts to skip broken postinstall in @powerhousedao/agent-manager)
RUN pnpm install --ignore-scripts

# Copy source code
COPY . .

# Build the project
RUN pnpm build

# -----------------------------------------------------------------------------
# Production stage
# -----------------------------------------------------------------------------
FROM node:24-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache curl

# Setup pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built application from builder
COPY --from=builder /app /app

# Environment variables
ENV NODE_ENV=production
ENV PORT=3100

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Start the server
CMD ["node", "dist/server.js"]

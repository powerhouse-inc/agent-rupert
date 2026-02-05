# =============================================================================
# Multi-stage Dockerfile for Agent Rupert
#
# This requires agent-drive to be available in the build context.
# The GitHub workflow will checkout both repos and build with proper context.
#
# Build command (from parent directory containing both repos):
#   docker build -f agent-rupert/Dockerfile -t cr.vetra.io/rupert/agent-rupert:<tag> .
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

# Copy agent-drive (the library dependency) first
COPY agent-drive /app/library

# Copy agent-rupert
COPY agent-rupert /app/agent-rupert

WORKDIR /app/agent-rupert

# Install dependencies (this will resolve the file:../library reference)
RUN pnpm install

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
COPY --from=builder /app/agent-rupert /app/agent-rupert
COPY --from=builder /app/library /app/library

WORKDIR /app/agent-rupert

# Environment variables
ENV NODE_ENV=production
ENV PORT=3100

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Start the server
CMD ["node", "dist/server.js"]

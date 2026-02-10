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
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
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
# - git: needed by ph init
# - lsof: for port availability checks
# - bash: needed by Claude Agent SDK's Bash tool
RUN apk add --no-cache curl git lsof bash

# Setup pnpm (COREPACK_ENABLE_DOWNLOAD_PROMPT=0 to skip interactive confirmation)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install ph-cmd globally for ph init / ph dev commands
RUN pnpm add -g ph-cmd@latest

# Install @prisma/client globally (peer dep of document-drive, not auto-installed by ph init)
RUN pnpm add -g @prisma/client

# Copy built application from builder
COPY --from=builder /app /app

# Environment variables
ENV NODE_ENV=production
ENV PORT=3100
ENV SHELL=/bin/bash

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Start the server
CMD ["node", "dist/server.js"]

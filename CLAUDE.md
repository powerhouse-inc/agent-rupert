# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Powerhouse Agent - a Node.js/TypeScript application that serves as a document management and collaboration server built on the Powerhouse framework. It provides REST APIs for document operations, connects to remote drives for real-time collaboration, and manages document storage using the Reactor pattern.

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development server with auto-reload (port 3100)
pnpm dev

# Build TypeScript to JavaScript
pnpm build

# Start production server
pnpm start

# Clean build artifacts
pnpm clean
```

## Architecture

The application follows a modular architecture with these key components:

- **src/server.ts**: Express server with REST API endpoints (/health, /models, /drives)
- **src/reactor-setup.ts**: Initializes the Reactor, handles remote drive connections and document operations
- **src/config.ts**: Configuration management using environment variables
- **src/types.ts**: TypeScript type definitions

The system uses the Reactor pattern from @powerhousedao/reactor for managing document drives and operations. Documents are stored in `.ph/file-storage/` by default.

## Environment Configuration

Key environment variables (defined in `.env`):
- `PORT`: Server port (default: 3100)
- `STORAGE_TYPE`: 'filesystem' or 'memory'
- `REMOTE_DRIVE_URL`: URL of remote Powerhouse drive to connect to
- `AGENT_NAME`: Unique identifier for this agent instance

## Working with Powerhouse Documents

The agent uses the Powerhouse document model system. When adding new document types:
1. Import document models from the local `powerhouse-agent` library
2. Register them with the Reactor in `src/reactor-setup.ts`
3. Document operations are handled through the Reactor's event system

## API Endpoints

- `GET /`: Service info and available endpoints
- `GET /health`: Health check with reactor status and drive stats
- `GET /models`: List registered document models
- `GET /drives`: List connected drives with details

## Testing Approach

Currently, the project doesn't have a test suite configured. When implementing tests, consider:
- Unit tests for individual components
- Integration tests for API endpoints
- Testing document operations through the Reactor
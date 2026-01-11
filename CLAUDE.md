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

# Testing commands
pnpm test              # Run unit tests only (fast)
pnpm test:unit         # Explicitly run unit tests
pnpm test:integration  # Run integration tests (slower, uses real CLI tools)
pnpm test:coverage     # Run tests with coverage report
```

## Architecture

The application follows a modular architecture with these key components:

### Core Application
- **src/server.ts**: Express server with REST API endpoints (/health, /models, /drives)
- **src/reactor-setup.ts**: Initializes the Reactor, handles remote drive connections and document operations
- **src/config.ts**: Configuration management using environment variables
- **src/types.ts**: TypeScript type definitions

### Task Framework
- **src/tasks/types.ts**: Task type definitions (BaseTask, CLITask, ClaudeCodeTask)
- **src/tasks/executors/cli-executor.ts**: Executes CLI commands with streaming, retry logic, and error handling
- **src/tasks/executors/errors.ts**: Custom error types for task execution

### Powerhouse Integration
- **src/powerhouse/ReactorPackagesManager.ts**: Manages Powerhouse projects (init, run, shutdown)
  - Supports single project execution with `ph dev`
  - Handles project initialization with `ph init`
  - Manages project lifecycle and logs

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

The project uses Jest for testing with a clear separation between unit and integration tests:

### Test Organization
- **tests/unit/**: Fast unit tests with mocked dependencies
  - Run with `pnpm test` or `pnpm test:unit`
  - Includes test helper scripts in `tests/unit/test-scripts/`
- **tests/integration/**: Slower integration tests using real CLI tools and services
  - Run with `pnpm test:integration`
  - Creates test artifacts in `../test-projects/` for easy inspection

### Test Coverage
- Task framework components have comprehensive unit tests
- ReactorPackagesManager has both unit tests (mocked) and integration tests (real `ph` CLI)
- Use `pnpm test:coverage` to generate coverage reports in `tmp/coverage/`

### Writing Tests
- Unit tests should mock all external dependencies
- Integration tests can use real tools but should clean up after themselves
- Test files should be named `*.test.ts` and placed in the appropriate directory
- **IMPORTANT**: Always run `pnpm test --detectOpenHandles` to identify and fix any handle leaks
  - All timers must be properly cleared
  - Child processes must be fully terminated
  - No "worker process failed to exit gracefully" warnings should appear
  - Tests should exit cleanly without forcing Jest to terminate
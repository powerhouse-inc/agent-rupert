# Powerhouse Agent System

A multi-agent system built on the Powerhouse framework for autonomous document management, task execution, and collaborative development workflows.

## Overview

This project implements an agent-based architecture where specialized agents work together to manage documents, execute tasks, and develop Powerhouse-based applications. Each agent has its own responsibilities and can communicate through shared documents (inbox and WBS - Work Breakdown Structure).

### Key Agents

- **ReactorPackageDevAgent**: Manages Powerhouse Reactor packages, runs development environments, and executes technical tasks
- **PowerhouseArchitectAgent**: Handles architecture decisions, blueprint generation, and coordinates high-level system design

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Agent Server                    │
│                 (Express + API)                  │
└───────────────────┬─────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
┌───────▼────────┐    ┌────────▼────────┐
│ ReactorPackage │    │  Powerhouse     │
│   DevAgent     │    │ ArchitectAgent  │
├────────────────┤    ├─────────────────┤
│ - Vetra Runner │    │ - Architecture  │
│ - Task Exec    │    │ - Blueprints    │
│ - Project Mgmt │    │ - Coordination  │
└───────┬────────┘    └────────┬────────┘
        │                       │
        └───────────┬───────────┘
                    │
            ┌───────▼────────┐
            │ Document Drive │
            │  (Reactor)     │
            ├────────────────┤
            │ - Inbox Docs   │
            │ - WBS Docs     │
            │ - Shared State │
            └────────────────┘
```

## Features

- **Multi-Agent System**: Specialized agents for different domains working collaboratively
- **Document-Driven Workflow**: Agents communicate and track work through Powerhouse documents
- **Event-Driven Architecture**: Real-time reactions to document changes via DocumentDrive events
- **Task Execution Framework**: Robust task execution with retry logic and error handling
- **Project Management**: Automated Powerhouse project initialization and lifecycle management
- **REST API**: HTTP endpoints for health checks, agent status, and project management

## Prerequisites

- Node.js 18+ 
- pnpm package manager
- Powerhouse CLI (`ph`) - Optional, for project management features
- Claude CLI - Optional, for AI-assisted development features

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd agent
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Build the project:
```bash
pnpm build
```

## Configuration

Create a `.env` file based on `.env.example`:

### Essential Configuration

- `API_PORT`: Server port (default: 3100)
- `AGENT_MANAGER_DRIVE`: URL of the Powerhouse drive for agent documents

### Agent Configuration

Each agent can be configured with:
- Custom name via environment variables
- Document IDs for inbox and WBS documents
- Agent-specific settings (e.g., Vetra ports for ReactorPackageDevAgent)

Example configuration:
```env
# Server
API_PORT=3100

# Drive connection
AGENT_MANAGER_DRIVE=http://localhost:4001/d/preview-10e97b52

# ReactorPackageDevAgent
REACTOR_PACKAGES_DEV_NAME=Agent Rupert
REACTOR_PACKAGES_DEV_WBS=0bcfaac4-025a-4443-a39d-830a1ec62f06
VETRA_CONNECT_PORT=5000
VETRA_SWITCHBOARD_PORT=6100

# PowerhouseArchitectAgent  
POWERHOUSE_ARCHITECT_NAME=Agent Pat
POWERHOUSE_ARCHITECT_WBS=46f65c19-1465-4a63-95d0-4905d1a7a947
```

## Running the Application

### Development Mode
```bash
pnpm dev
```
This starts the server with hot-reload enabled via nodemon.

### Production Mode
```bash
pnpm start
```
Runs the compiled JavaScript from the `dist` directory.

### Testing
```bash
# Run unit tests
pnpm test

# Run integration tests
pnpm test:integration

# Generate coverage report
pnpm test:coverage
```

## API Endpoints

- `GET /` - Service information and available endpoints
- `GET /health` - Health check with agent status and drive information
- `GET /models` - List registered document models
- `GET /drives` - Connected drive details
- `GET /projects` - Powerhouse project management endpoints
- `GET /info` - API information and agent details

## Project Structure

```
agent/
├── src/
│   ├── agents/              # Agent implementations
│   │   ├── AgentBase.ts     # Base class for all agents
│   │   ├── AgentsManager.ts # Agent lifecycle management
│   │   ├── ReactorPackageDevAgent/
│   │   └── PowerhouseArchitectAgent/
│   ├── tasks/               # Task execution framework
│   │   ├── types.ts         # Task type definitions
│   │   └── executors/       # Task execution strategies
│   ├── routes/              # Express route handlers
│   ├── server.ts            # Main server entry point
│   └── config.ts            # Configuration management
├── tests/
│   ├── unit/                # Unit tests with mocked dependencies
│   └── integration/         # Integration tests with real services
├── .env.example             # Environment configuration template
├── package.json
└── tsconfig.json
```

## Document Types

The agents work with these Powerhouse document types:
- **Agent Inbox**: Receives new tasks and requests from stakeholders
- **Work Breakdown Structure (WBS)**: Tracks goals, tasks, and progress
- **Claude Chat**: Interactive chat sessions for task execution

## Development Guide

### Adding a New Agent

1. Create a new agent class extending `AgentBase`
2. Implement required abstract methods (`handleInboxUpdate`, `handleWbsUpdate`)
3. Register in `AgentsManager`
4. Add configuration in `config.ts` and `.env.example`

### Task Execution

Tasks follow a structured format with executors for different types:
- `CLITask`: Command-line tool execution
- `ServiceTask`: Long-running service management
- `ClaudeCodeTask`: AI-assisted development tasks

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure configured ports are available and not blocked by browser security policies
2. **Drive connection failures**: Verify the AGENT_MANAGER_DRIVE URL is accessible
3. **Missing document IDs**: Agents need valid WBS document IDs to function properly

### Debug Mode

Enable detailed logging by examining the console output during `pnpm dev`.

## Contributing

See CLAUDE.md for AI-assisted development guidelines.

## License

[License information here]
# Phase 3: ReactorPackagesManager MCP Exposure

## Overview
Expose ReactorPackagesManager functionality as tools through the Claude Agent SDK's MCP server mechanism using `tool()` and `createSdkMcpServer()`. This enables agents to manage Powerhouse projects programmatically through the SDK's required MCP interface.

## Status: 🔴 Not Started

## Prerequisites
- [x] Phase 1 completed (Generic AgentBase refactor)
- [x] Phase 2 completed (Tool Infrastructure)

## Tasks

### 1. Create MCP Adapter for Tool Infrastructure
- [ ] Create `mcpAdapter.ts` to convert ClaudeAgentTool to MCP format
- [ ] Implement `adaptToolToMcp()` function
- [ ] Handle schema conversion from Zod to MCP format
- [ ] Map tool execution to MCP handlers
- [ ] Create helper to build MCP server from tool registry

**File to create:**
- `src/tools/mcpAdapter.ts`

### 2. Implement ReactorPackagesManager Tool Definitions
- [ ] Create `reactorPackagesTools.ts` with tool definitions using SDK's `tool()` function
- [ ] Implement `init_project` tool
- [ ] Implement `list_projects` tool
- [ ] Implement `run_project` tool
- [ ] Implement `shutdown_project` tool
- [ ] Implement `get_project_logs` tool
- [ ] Implement `get_project_status` tool
- [ ] Implement `is_project_ready` tool
- [ ] Implement `get_projects_dir` tool

**File to create:**
- `src/tools/reactorPackagesTools.ts`

```typescript
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// Example tool definition
export function createInitProjectTool(manager: ReactorPackagesManager) {
  return tool(
    'init_project',
    'Initialize a new Powerhouse project',
    {
      projectName: z.string()
        .regex(/^[a-zA-Z0-9-_]+$/)
        .describe('Project name (alphanumeric, hyphens, underscores)')
    },
    async (args) => {
      const result = await manager.init(args.projectName);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result)
        }]
      };
    }
  );
}
```

### 3. Create ReactorPackagesManager MCP Server Factory
- [ ] Create `createReactorProjectsManagerMcpServer()` function
- [ ] Use `createSdkMcpServer()` from Claude SDK
- [ ] Register all reactor tools with manager instance
- [ ] Add error handling and logging
- [ ] Return configured MCP server

**File to create:**
- `src/tools/reactorMcpServer.ts`

```typescript
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { ReactorPackagesManager } from '../agents/ReactorPackageDevAgent/ReactorPackagesManager.js';

export function createReactorMcpServer(
  manager: ReactorPackagesManager,
  logger?: ILogger
) {
  return createSdkMcpServer({
    name: 'reactor',
    version: '1.0.0',
    tools: [
      createInitProjectTool(manager),
      createListProjectsTool(manager),
      createRunProjectTool(manager),
      createShutdownProjectTool(manager),
      createGetProjectLogsTool(manager),
      createGetProjectStatusTool(manager),
      createIsProjectReadyTool(manager),
      createGetProjectsDirTool(manager)
    ]
  });
}
```

### 4. Update AgentClaudeBrain for SDK MCP Server Support
- [ ] Modify `addMcpServer()` to accept SDK MCP server objects
- [ ] Update type definitions for MCP server config
- [ ] Ensure MCP servers are properly passed to query
- [ ] Add helper method to register SDK MCP servers

**File to update:**
- `src/agents/AgentClaudeBrain.ts`

```typescript
// Add support for SDK MCP servers
public addSdkMcpServer(name: string, server: any): void {
  // Store SDK server directly for query options
  this.mcpServers.set(name, server);
  this.logger?.info(`Added SDK MCP server: ${name}`);
}
```

### 5. Integrate MCP Server with ReactorPackageDevAgent
- [ ] Create MCP server during initialization
- [ ] Register server with AgentClaudeBrain
- [ ] Update brain configuration with allowed tools
- [ ] Ensure manager is initialized before server creation

**File to update:**
- `src/agents/ReactorPackageDevAgent/ReactorPackageDevAgent.ts`

```typescript
public async initialize(): Promise<void> {
  await super.initialize();
  
  // Initialize packages manager
  this.packagesManager = new ReactorPackagesManager(/*...*/);
  
  // Create and register MCP server
  if (this.brain) {
    const reactorServer = createReactorMcpServer(this.packagesManager, this.logger);
    (this.brain as AgentClaudeBrain).addSdkMcpServer('reactor', reactorServer);
    
    // Update allowed tools
    const reactorTools = [
      'mcp__reactor_prjmgr__init_project',
      'mcp__reactor_prjmgr__list_projects',
      'mcp__reactor_prjmgr__run_project',
      // ... other tools
    ];
    // Add to brain's allowed tools configuration
  }
}
```

### 6. Create Integration Tests
- [ ] Test MCP server creation
- [ ] Test tool execution through MCP
- [ ] Test error handling
- [ ] Test manager lifecycle
- [ ] Test concurrent operations

**File to create:**
- `tests/unit/tools/reactor-mcp.test.ts`

## Testing Checklist
- [ ] Can initialize project via `mcp__reactor__init_project`
- [ ] Can list projects via `mcp__reactor__list_projects`
- [ ] Can run project with custom ports
- [ ] Can shutdown running project
- [ ] Can retrieve project logs
- [ ] Can check project status and readiness
- [ ] Error handling works correctly
- [ ] Tools appear in SDK's allowed tools list
- [ ] MCP server properly registered with brain

## Example Usage
```typescript
// In AgentClaudeBrain's query
const q = query({
  prompt: 'Initialize a new Powerhouse project called my-app',
  options: {
    mcpServers: {
      'reactor': reactorMcpServer  // Automatically registered
    },
    allowedTools: [
      'mcp__reactor__init_project',
      'mcp__reactor__run_project',
      'mcp__reactor__get_project_logs'
    ]
  }
});

// Natural language usage by agent:
// "Initialize a project called my-app"
// "Run the my-app project on port 3000"
// "Show me the logs for the running project"
// "Shutdown the current project"
```

## Integration Points
- `ReactorPackagesManager` instance methods
- Claude SDK's `tool()` function for tool definition
- Claude SDK's `createSdkMcpServer()` for server creation
- `AgentClaudeBrain.addSdkMcpServer()` for registration
- SDK's `query()` function with mcpServers option

## Dependencies
- Phase 1: Generic AgentBase refactor
- Phase 2: Tool infrastructure (for patterns and types)
- `@anthropic-ai/claude-agent-sdk` (already installed)
- `ReactorPackagesManager` class
- `zod` for schema validation

## Risks
- **Risk**: Manager instance lifecycle management
  - **Mitigation**: Ensure manager is initialized before MCP server creation
- **Risk**: Port conflicts when running projects
  - **Mitigation**: Port availability checking already in ReactorPackagesManager
- **Risk**: Tool return format compatibility
  - **Mitigation**: Follow SDK's expected return format with content array

## Success Criteria
- [ ] ReactorPackagesManager fully exposed via MCP server
- [ ] All project management tools functional through SDK
- [ ] Tools accessible via natural language prompts
- [ ] Error handling comprehensive
- [ ] Integration with Phase 2 tool infrastructure maintained
- [ ] Tests pass with MCP tools

## Notes
- MCP is required by the Claude Agent SDK for custom tools
- Tools will be namespaced as `mcp__reactor__[tool_name]`
- The SDK handles tool routing and execution
- Our Phase 2 infrastructure can be adapted for MCP compatibility

---
**Last Updated**: 2024-01-14
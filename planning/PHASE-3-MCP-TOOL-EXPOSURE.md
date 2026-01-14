# Phase 3: MCP Tool Exposure

## Overview
Expose AgentClaudeBrain's MCP server management functionality as tools, allowing agents to dynamically add, remove, and manage MCP servers at runtime.

## Status: 🔴 Not Started

## Prerequisites
- [ ] Phase 1 completed (Generic AgentBase refactor)
- [ ] Phase 2 completed (Tool Infrastructure)

## Tasks

### 1. Implement AgentMcpCtl Tool Collection
- [ ] Create `agentMcpCtl.ts` implementation
- [ ] Define MCP server configuration schemas
- [ ] Implement tool execution logic
- [ ] Add validation for MCP server configs

**File to implement:**
- `src/tools/agentMcpCtl.ts`

### 2. Create AddMcpServerTool
- [ ] Tool name: `mcp_add_server`
- [ ] Define Zod schema for server configuration
- [ ] Implement server addition logic
- [ ] Handle different server types (http, stdio, sse)
- [ ] Add duplicate server name checking

```typescript
class AddMcpServerTool extends ClaudeAgentToolBase {
  name = 'mcp_add_server';
  description = 'Add an MCP server to the agent brain';
  schema = z.object({
    name: z.string().describe('Unique server name'),
    type: z.enum(['http', 'stdio', 'sse']),
    url: z.string().optional().describe('Server URL for http/sse types'),
    command: z.string().optional().describe('Command for stdio type'),
    args: z.array(z.string()).optional(),
    headers: z.record(z.string()).optional()
  });
}
```

### 3. Create RemoveMcpServerTool
- [ ] Tool name: `mcp_remove_server`
- [ ] Define schema with server name
- [ ] Implement removal logic
- [ ] Return success/failure status
- [ ] Handle non-existent server gracefully

### 4. Create ListMcpServersTool
- [ ] Tool name: `mcp_list_servers`
- [ ] No input schema required
- [ ] Return list of configured servers
- [ ] Include server status information
- [ ] Format output for readability

### 5. Create UpdateMcpServerTool
- [ ] Tool name: `mcp_update_server`
- [ ] Schema for partial updates
- [ ] Implement update logic
- [ ] Validate new configuration
- [ ] Handle server restart if needed

### 6. Create GetMcpServerStatusTool
- [ ] Tool name: `mcp_server_status`
- [ ] Check server connectivity
- [ ] Return detailed status info
- [ ] Include available tools from server
- [ ] Add health check functionality

### 7. Integrate MCP Tools with ClaudeAgentBase
- [ ] Auto-register MCP tools in `registerTools()`
- [ ] Add MCP tool permission checks
- [ ] Ensure brain instance is available
- [ ] Add MCP-specific error handling

**File to update:**
- `src/agents/ClaudeAgentBase.ts`

```typescript
protected registerTools(): void {
  // Register MCP control tools
  this.registerTool(new AddMcpServerTool());
  this.registerTool(new RemoveMcpServerTool());
  this.registerTool(new ListMcpServersTool());
  // ...
}
```

### 8. Create MCP Server Manager Service
- [ ] Centralized MCP server management
- [ ] Server lifecycle management
- [ ] Connection pooling for http servers
- [ ] Server health monitoring

**File to create:**
- `src/services/McpServerManager.ts`

## Testing Checklist
- [ ] Can add http MCP server
- [ ] Can add stdio MCP server
- [ ] Can remove MCP server
- [ ] Can list all servers
- [ ] Can update server configuration
- [ ] Server status check works
- [ ] Duplicate names are rejected
- [ ] Invalid configs are rejected

## Example Usage
```typescript
// Add an MCP server
await agent.executeTool('mcp_add_server', {
  name: 'custom-api',
  type: 'http',
  url: 'http://localhost:8080/mcp',
  headers: { 'Authorization': 'Bearer token' }
});

// List servers
const servers = await agent.executeTool('mcp_list_servers', {});

// Check status
const status = await agent.executeTool('mcp_server_status', {
  name: 'custom-api'
});
```

## Integration Points
- `AgentClaudeBrain.addMcpServer()`
- `AgentClaudeBrain.removeMcpServer()`
- `AgentClaudeBrain.getMcpServers()`
- SDK's `createSdkMcpServer()`

## Dependencies
- Phase 1: ClaudeAgentBase class
- Phase 2: Tool infrastructure
- `@anthropic-ai/claude-agent-sdk`

## Risks
- **Risk**: MCP server connection failures
  - **Mitigation**: Implement retry logic and health checks
- **Risk**: Security concerns with arbitrary server URLs
  - **Mitigation**: Add URL validation and allowlist

## Success Criteria
- [ ] All MCP tools are functional
- [ ] Tools integrate with AgentClaudeBrain
- [ ] Server management is reliable
- [ ] Error handling is comprehensive
- [ ] Tools are properly documented

## Notes
_Add implementation notes here as work progresses_

---
**Last Updated**: 2024-01-14
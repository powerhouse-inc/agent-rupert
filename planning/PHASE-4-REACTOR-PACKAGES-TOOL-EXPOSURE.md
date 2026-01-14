# Phase 4: ReactorPackagesManager Tool Exposure

## Overview
Expose ReactorPackagesManager functionality as Claude SDK tools, enabling agents to manage Powerhouse projects programmatically through tool calls.

## Status: 🔴 Not Started

## Prerequisites
- [ ] Phase 1 completed (Generic AgentBase refactor)
- [ ] Phase 2 completed (Tool Infrastructure)
- [ ] Phase 3 completed (MCP Tool Exposure)

## Tasks

### 1. Implement ReactorPackagesCtl Tool Collection
- [ ] Create `reactorPackagesCtl.ts` implementation
- [ ] Define project configuration schemas
- [ ] Add manager instance reference
- [ ] Implement error handling for project operations

**File to implement:**
- `src/tools/reactorPackagesCtl.ts`

### 2. Create InitProjectTool
- [ ] Tool name: `reactor_init_project`
- [ ] Define schema with project name validation
- [ ] Call `ReactorPackagesManager.init()`
- [ ] Return project path and status
- [ ] Handle duplicate project names

```typescript
class InitProjectTool extends ClaudeAgentToolBase {
  name = 'reactor_init_project';
  description = 'Initialize a new Powerhouse project';
  schema = z.object({
    projectName: z.string()
      .regex(/^[a-zA-Z0-9-_]+$/)
      .describe('Project name (alphanumeric, hyphens, underscores)')
  });
  
  protected async executeInternal(args, context) {
    const manager = context.agent.getPackagesManager();
    return await manager.init(args.projectName);
  }
}
```

### 3. Create ListProjectsTool
- [ ] Tool name: `reactor_list_projects`
- [ ] No input required
- [ ] Call `ReactorPackagesManager.listProjects()`
- [ ] Format project list with details
- [ ] Include project status information

### 4. Create RunProjectTool
- [ ] Tool name: `reactor_run_project`
- [ ] Schema with project name and port options
- [ ] Call `ReactorPackagesManager.runProject()`
- [ ] Return running project details
- [ ] Handle port conflicts

```typescript
schema = z.object({
  projectName: z.string(),
  connectPort: z.number().optional().default(3000),
  switchboardPort: z.number().optional().default(4001),
  startupTimeout: z.number().optional().default(240000)
});
```

### 5. Create ShutdownProjectTool
- [ ] Tool name: `reactor_shutdown_project`
- [ ] No input required (shuts down current)
- [ ] Call `ReactorPackagesManager.shutdownProject()`
- [ ] Handle graceful shutdown
- [ ] Return shutdown status

### 6. Create GetProjectLogsTool
- [ ] Tool name: `reactor_get_logs`
- [ ] Optional line limit parameter
- [ ] Call `ReactorPackagesManager.getProjectLogs()`
- [ ] Format logs for readability
- [ ] Add timestamp information

### 7. Create GetProjectStatusTool
- [ ] Tool name: `reactor_project_status`
- [ ] Return detailed project information
- [ ] Include running status
- [ ] Show Drive URL if available
- [ ] Display port assignments

### 8. Create GetProjectsDirectoryTool
- [ ] Tool name: `reactor_get_projects_dir`
- [ ] Return projects directory path
- [ ] Include directory stats
- [ ] Check directory permissions

### 9. Create IsProjectReadyTool
- [ ] Tool name: `reactor_is_ready`
- [ ] Check if project fully started
- [ ] Return readiness status
- [ ] Include Drive URL availability
- [ ] Show startup progress

### 10. Integrate Tools with ReactorPackageDevAgent
- [ ] Override `registerTools()` method
- [ ] Register all Reactor tools
- [ ] Ensure manager instance exists
- [ ] Add project-specific permissions

**File to update:**
- `src/agents/ReactorPackageDevAgent/ReactorPackageDevAgent.ts`

```typescript
protected registerTools(): void {
  super.registerTools(); // Register base tools
  
  // Register Reactor-specific tools
  this.registerTool(new InitProjectTool());
  this.registerTool(new ListProjectsTool());
  this.registerTool(new RunProjectTool());
  // ...
}
```

## Testing Checklist
- [ ] Can initialize new project
- [ ] Can list all projects
- [ ] Can run a project
- [ ] Can shutdown running project
- [ ] Can retrieve project logs
- [ ] Can check project status
- [ ] Port conflicts are handled
- [ ] Timeout settings work

## Example Usage
```typescript
// Initialize a new project
await agent.executeTool('reactor_init_project', {
  projectName: 'my-powerhouse-app'
});

// List available projects
const projects = await agent.executeTool('reactor_list_projects', {});

// Run a project
await agent.executeTool('reactor_run_project', {
  projectName: 'my-powerhouse-app',
  connectPort: 3000,
  switchboardPort: 4001
});

// Get project logs
const logs = await agent.executeTool('reactor_get_logs', {
  limit: 100
});

// Check status
const status = await agent.executeTool('reactor_project_status', {});

// Shutdown
await agent.executeTool('reactor_shutdown_project', {});
```

## Integration Points
- `ReactorPackagesManager` instance
- `CLIExecutor` for ph commands
- `ServiceExecutor` for long-running processes
- Project file system operations

## Dependencies
- Phase 1-3 completed
- `ReactorPackagesManager` class
- `ph` CLI tool available
- File system permissions

## Risks
- **Risk**: Long-running project processes
  - **Mitigation**: Implement proper lifecycle management
- **Risk**: Port conflicts with multiple projects
  - **Mitigation**: Port availability checking
- **Risk**: Project initialization failures
  - **Mitigation**: Comprehensive error handling

## Success Criteria
- [ ] All Reactor tools functional
- [ ] Project lifecycle managed properly
- [ ] Error handling comprehensive
- [ ] Logs accessible and formatted
- [ ] Status tracking accurate

## Notes
_Add implementation notes here as work progresses_

---
**Last Updated**: 2024-01-14
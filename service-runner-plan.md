# Service Runner Implementation Plan

## Overview
This document tracks the implementation of a ServiceExecutor class to handle long-running services (like `ph vetra --watch`) separately from finite CLI tasks, solving the timeout issue while maintaining clean separation of concerns.

## Phase 1: Create BaseExecutor
**Status:** ✅ Completed

### Objectives
- Extract common functionality from CLIExecutor into a new BaseExecutor abstract class
- Maintain backward compatibility with existing CLIExecutor
- Ensure all tests continue to pass

### Tasks
- [x] Create `src/tasks/executors/base-executor.ts`
  - [x] Define BaseExecutorConfig interface
  - [x] Implement BaseExecutor abstract class extending EventEmitter
  - [x] Extract common methods:
    - `validateCommand()` - Basic command validation
    - `spawnProcess()` - Process spawning with options
    - `handleOutputStream()` - Stream handling for stdout/stderr
    - `killProcessGracefully()` - Graceful process termination
    - `delay()` - Utility delay method
  - [x] Added additional helper methods:
    - `validateBaseTask()` - Base task validation
    - `isProcessRunning()` - Check if process is alive
    - `createEnvironment()` - Environment variable management

- [x] Refactor `src/tasks/executors/cli-executor.ts`
  - [x] Extend from BaseExecutor instead of EventEmitter
  - [x] Remove duplicated methods now in BaseExecutor
  - [x] Adjust method calls to use inherited methods
  - [x] Keep all CLIExecutor-specific logic (timeout, retry, etc.)
  - [x] Maintain original stream handling for compatibility

- [x] Update tests
  - [x] Ensure all existing CLIExecutor tests pass (87 unit tests passing)
  - [x] Verify integration tests still work (101 total tests passing)

### Implementation Summary

Successfully created `BaseExecutor` abstract class with:
- Clean separation of common functionality from CLIExecutor
- Shared process management utilities
- Stream handling capabilities (though CLIExecutor keeps its own for now)
- Validation utilities for both commands and tasks
- Process lifecycle management helpers

**Key Decisions Made:**
- Kept stream handling simple in BaseExecutor but CLIExecutor maintains its original implementation for full backward compatibility
- Added more helper methods than originally planned (isProcessRunning, createEnvironment) for better utility
- Used composition pattern for config (BaseExecutorConfig extended by CLIExecutorOptions)
- All tests passing without any breaking changes

## Phase 2: Implement ServiceExecutor
**Status:** 🔴 Not Started

### Objectives
- Create ServiceExecutor class for managing long-running services
- Implement service lifecycle management (start, stop, restart)
- Add service registry for managing multiple services

### Tasks
- [ ] Create new types in `src/tasks/types.ts`
  - [ ] Define ServiceTask interface
  - [ ] Define ServiceHandle interface
  - [ ] Define ServiceStatus type
  - [ ] Add createServiceTask factory function

- [ ] Create `src/tasks/executors/service-executor.ts`
  - [ ] Define ServiceExecutorOptions interface
  - [ ] Implement ServiceExecutor class extending BaseExecutor
  - [ ] Core methods:
    - `start(task: ServiceTask): Promise<ServiceHandle>`
    - `stop(serviceId: string, options?: StopOptions): Promise<void>`
    - `restart(serviceId: string): Promise<void>`
    - `getStatus(serviceId: string): ServiceStatus`
    - `getLogs(serviceId: string, limit?: number): string[]`
    - `getAllServices(): ServiceHandle[]`
  - [ ] Internal management:
    - Service registry using Map<string, RunningService>
    - Log management with size limits
    - Process lifecycle tracking

- [ ] Add comprehensive tests
  - [ ] Unit tests for ServiceExecutor
  - [ ] Integration tests with real processes
  - [ ] Test service lifecycle scenarios
  - [ ] Test error handling and recovery

### Implementation Details

```typescript
// src/tasks/types.ts additions
export interface ServiceTask extends BaseTask {
  type: 'service';
  command: string;
  args: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  gracefulShutdown?: {
    signal?: NodeJS.Signals;
    timeout?: number;
  };
}

// src/tasks/executors/service-executor.ts
export class ServiceExecutor extends BaseExecutor {
  private services = new Map<string, RunningService>();
  
  async start(task: ServiceTask): Promise<ServiceHandle> {
    // No timeout for services
    // Register in services map
    // Return handle for management
  }
  
  async stop(serviceId: string): Promise<void> {
    // Graceful shutdown
    // Clean up from registry
  }
}
```

## Phase 3: Integrate with PowerhouseProjectsManager
**Status:** 🔴 Not Started

### Objectives
- Replace CLIExecutor with ServiceExecutor for long-running ph commands
- Update PowerhouseProjectsManager to use ServiceTask
- Ensure proper lifecycle management and cleanup

### Tasks
- [ ] Update `src/powerhouse/PowerhouseProjectsManager.ts`
  - [ ] Add ServiceExecutor instance alongside CLIExecutor
  - [ ] Modify `runProject()` method:
    - [ ] Create ServiceTask instead of CLITask for `ph vetra --watch`
    - [ ] Use ServiceExecutor.start() instead of CLIExecutor.executeWithStream()
    - [ ] Store ServiceHandle for lifecycle management
  - [ ] Update `shutdownProject()` method:
    - [ ] Use ServiceExecutor.stop() for graceful shutdown
    - [ ] Ensure proper cleanup of service registry
  - [ ] Adjust log handling to work with ServiceExecutor events

- [ ] Update integration tests
  - [ ] Test PowerhouseProjectsManager with new ServiceExecutor
  - [ ] Verify long-running services don't timeout
  - [ ] Test project shutdown and cleanup
  - [ ] Test port release after service stop

- [ ] Update documentation
  - [ ] Document new ServiceExecutor usage
  - [ ] Update CLAUDE.md with service management info
  - [ ] Add examples for service task usage

### Implementation Example

```typescript
// In PowerhouseProjectsManager
private serviceExecutor: ServiceExecutor;

async runProject(projectName: string, options?: RunOptions): Promise<RunResult> {
  const serviceTask = createServiceTask({
    title: `Run Powerhouse project: ${projectName}`,
    instructions: `Start Powerhouse Vetra development server`,
    command: 'ph',
    args: ['vetra', '--watch', '--connect-port', String(connectPort)],
    workingDirectory: project.path,
    environment: { NODE_ENV: 'development' }
  });
  
  const handle = await this.serviceExecutor.start(serviceTask);
  this.runningProject = {
    ...projectInfo,
    serviceHandle: handle
  };
}

async shutdownProject(): Promise<ShutdownResult> {
  if (this.runningProject?.serviceHandle) {
    await this.serviceExecutor.stop(this.runningProject.serviceHandle.id);
  }
}
```

## Testing Strategy

### Unit Tests
- BaseExecutor: Test all protected methods via a concrete test implementation
- ServiceExecutor: Test service lifecycle, registry management, log handling
- Integration: Test real process management, signal handling, cleanup

### Integration Tests
- Start/stop real services
- Verify no timeout on long-running services
- Test graceful shutdown
- Verify port cleanup
- Test error recovery scenarios

## Success Criteria
- ✅ CLIExecutor continues to work exactly as before
- ✅ Long-running services (like `ph vetra --watch`) no longer timeout
- ✅ Clean separation between finite tasks and services
- ✅ All existing tests pass
- ✅ New tests cover service management scenarios
- ✅ PowerhouseProjectsManager successfully uses ServiceExecutor

## Notes
- Maintain backward compatibility throughout
- Keep CLIExecutor unchanged in behavior
- Focus on minimal viable implementation first
- Advanced features (health checks, auto-restart) deferred to Phase 4

# Definition of Done
The definition of done must be checked before committing work: 

- Implementation is finished
- All unit tests are passing 
- All integration tests are passing
- TypeScript compiles without errors
- pnpm build shows no issues
- Planning document is updated with latest status
# Task Framework Implementation Plan

## Overview

The task framework is an event-driven system integrated into the Powerhouse Agent that executes tasks based on document and operation events. It supports three initial categories of tasks with a modular design for future extensibility.

## Task Categories

1. **CLI Command Tasks**: Execute shell commands with input prompts and capture output
2. **Claude Code CLI Tasks**: Specialized CLI tasks that run Claude Code commands
3. **Claude Agent MCP Tasks**: Use Claude Agent with MCP to manipulate Powerhouse drives and documents

## Architecture Components

### 1. Task Type System (`src/tasks/types.ts`)

Define the core task interfaces and types:

```typescript
interface BaseTask {
  id: string;
  type: 'cli' | 'claude-code' | 'claude-agent';
  title: string;
  instructions: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  result?: any;
  error?: string;
}

interface CLITask extends BaseTask {
  type: 'cli';
  command: string;
  args: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
}

interface ClaudeCodeTask extends BaseTask {
  type: 'claude-code';
  prompt: string;
  projectPath?: string;
  additionalFlags?: string[];
}

interface ClaudeAgentTask extends BaseTask {
  type: 'claude-agent';
  prompt: string;
  mcpConfig: {
    serverUrl: string;
    credentials?: any;
  };
}
```

### 2. Task Executors (`src/tasks/executors/`)

Each executor handles a specific task type:

#### CLI Executor (`cli-executor.ts`)
- Spawn child processes using Node.js `child_process`
- Capture stdout/stderr streams
- Handle process timeouts and errors
- Return structured output

#### Claude Code Executor (`claude-code-executor.ts`)
- Wrapper around claude CLI command
- Format prompts with document context
- Parse and structure claude output
- Handle API errors and rate limits

#### Claude Agent Executor (`claude-agent-executor.ts`)
- Establish MCP connection to Powerhouse server
- Execute prompts with full document access
- Perform document operations via MCP protocol
- Return operation results

### 3. Task Manager (`src/tasks/task-manager.ts`)

Central coordination point for all tasks:

```typescript
class TaskManager {
  private queue: Queue<BaseTask>;
  private executors: Map<string, TaskExecutor>;
  private runningTasks: Map<string, BaseTask>;
  
  async enqueueTask(task: BaseTask): Promise<void>;
  async processQueue(): Promise<void>;
  async executeTask(task: BaseTask): Promise<TaskResult>;
  async getTaskStatus(taskId: string): Promise<TaskStatus>;
  async cancelTask(taskId: string): Promise<boolean>;
}
```

Features:
- Priority queue based on task type and age
- Concurrent execution limits (configurable)
- Task retry logic with exponential backoff
- Result caching and cleanup

### 4. Event Handler (`src/tasks/event-handler.ts`)

Bridge between Powerhouse events and task creation:

```typescript
class TaskEventHandler {
  constructor(
    private taskManager: TaskManager,
    private reactor: Reactor
  ) {}
  
  async processOperations(operations: Operation[]): Promise<BaseTask[]> {
    // Analyze operations for task triggers
    // Create appropriate task types based on operation metadata
  }
  
  async processDocument(document: Document): Promise<BaseTask[]> {
    // Check document model for task configuration
    // Extract task parameters from document content
  }
  
  async handleTaskResult(task: BaseTask, result: any): Promise<void> {
    // Create new operations with task results
    // Update document state
  }
}
```

## Integration with Existing System

### Event Integration in `reactor-setup.ts`

Add task handling to existing event listeners:

```typescript
// After line 75-80 in reactor-setup.ts
driveServer.on('operationsAdded', async (operations) => {
  console.log(`${operations.length} operations added`);
  
  // Task framework integration
  const tasks = await taskEventHandler.processOperations(operations);
  for (const task of tasks) {
    await taskManager.enqueueTask(task);
  }
});

driveServer.on('documentAdded', async (document) => {
  console.log('Document added:', document.id);
  
  // Task framework integration
  const tasks = await taskEventHandler.processDocument(document);
  for (const task of tasks) {
    await taskManager.enqueueTask(task);
  }
});
```

## Implementation Phases

### Phase 1: CLI Task Implementation
- [x] Create BaseTask interface and CLITask class
- [x] Implement CLIExecutor with child process spawning
- [x] Handle stdout/stderr capture and streaming
- [x] Implement timeout and error handling
- [x] Write unit tests for CLITask and CLIExecutor

### Phase 2: Claude Code Task Implementation
- [ ] Create ClaudeCodeTask class extending BaseTask
- [ ] Implement ClaudeCodeExecutor with claude CLI wrapper
- [ ] Handle prompt formatting and response parsing
- [ ] Implement rate limiting and API error handling
- [ ] Write unit tests for ClaudeCodeTask and ClaudeCodeExecutor

### Phase 3: Claude Agent MCP Task Implementation
- [ ] Create ClaudeAgentTask class extending BaseTask
- [ ] Implement ClaudeAgentExecutor with MCP client
- [ ] Handle MCP connection establishment and authentication
- [ ] Implement prompt execution with Powerhouse context
- [ ] Write unit tests for ClaudeAgentTask and ClaudeAgentExecutor

### Phase 4: Task Queue Implementation
- [ ] Create TaskManager class with priority queue
- [ ] Implement concurrent task execution with limits
- [ ] Add task lifecycle management (pending → running → completed/failed)
- [ ] Implement event-driven task creation from document/operation events
- [ ] Write integration tests for complete task flow

## Configuration

Environment variables for task framework:

```env
# Task Framework Configuration
TASK_MAX_CONCURRENT=5
TASK_TIMEOUT_MS=300000
TASK_RETRY_ATTEMPTS=3
CLAUDE_CLI_PATH=/usr/local/bin/claude
MCP_SERVER_URL=http://localhost:4001
```

## Error Handling

- **Executor Failures**: Retry with exponential backoff
- **Timeout Handling**: Kill long-running processes, mark as failed
- **Result Validation**: Validate executor outputs before document updates
- **Event Loop Protection**: Prevent infinite task creation loops

## Monitoring and Logging

- Log all task state transitions
- Emit events for task lifecycle (created, started, completed, failed)
- Track metrics: execution time, success rate, queue depth

## Security Considerations

- Sanitize all CLI command inputs
- Restrict working directories for CLI tasks
- Validate MCP credentials and permissions
- Limit concurrent executions per document/drive

## Future Extensibility

The framework is designed to support:
- Additional task executor types via plugin system
- Task dependencies and workflows
- Scheduled tasks with cron expressions
- Webhooks for external task triggers
- Task templates for common operations

## Testing Strategy

1. **Unit Tests**: Test each executor in isolation
2. **Integration Tests**: Test event handling and task flow
3. **End-to-End Tests**: Test complete document → task → result cycle
4. **Load Tests**: Verify queue performance under load

## Success Criteria

- Tasks execute reliably based on document events
- Results properly update source documents
- System remains stable under concurrent task load
- Clear logging and error reporting
- Minimal performance impact on existing operations
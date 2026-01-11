/**
 * Base interface for all task types in the task framework
 */
export interface BaseTask {
    id: string;
    type: 'cli' | 'claude-code' | 'claude-agent' | 'service';
    title: string;
    instructions: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
    createdAt: Date;
    updatedAt: Date;
    result?: any;
    error?: string;
}

/**
 * Task that executes shell commands with input prompts and captures output
 */
export interface CLITask extends BaseTask {
    type: 'cli';
    command: string;
    args: string[];
    workingDirectory?: string;
    environment?: Record<string, string>;
}

/**
 * Task that runs Claude Code commands with prompts and project context
 */
export interface ClaudeCodeTask extends BaseTask {
    type: 'claude-code';
    prompt: string;
    projectPath?: string;
    additionalFlags?: string[];
}

/**
 * Type guard to check if a task is a CLITask
 */
export function isCLITask(task: BaseTask): task is CLITask {
    return task.type === 'cli';
}

/**
 * Type guard to check if a task is a ClaudeCodeTask
 */
export function isClaudeCodeTask(task: BaseTask): task is ClaudeCodeTask {
    return task.type === 'claude-code';
}

/**
 * Factory function to create a new CLITask
 */
export function createCLITask(
    params: Omit<CLITask, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'type'>
): CLITask {
    return {
        ...params,
        id: generateTaskId(),
        type: 'cli',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

/**
 * Factory function to create a new ClaudeCodeTask
 */
export function createClaudeCodeTask(
    params: Omit<ClaudeCodeTask, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'type'>
): ClaudeCodeTask {
    return {
        ...params,
        id: generateTaskId(),
        type: 'claude-code',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

/**
 * Task for long-running services that should not timeout
 */
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
    restartPolicy?: {
        enabled: boolean;
        maxRetries?: number;
        delay?: number;
    };
}

/**
 * Service handle for managing running services
 */
export interface ServiceHandle {
    id: string;
    taskId: string;
    pid?: number;
    startedAt: Date;
    status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
}

/**
 * Service status information
 */
export interface ServiceStatus {
    handle: ServiceHandle;
    uptime: number;
    restartCount: number;
    lastError?: string;
}

/**
 * Type guard to check if a task is a ServiceTask
 */
export function isServiceTask(task: BaseTask): task is ServiceTask {
    return task.type === 'service';
}

/**
 * Factory function to create a new ServiceTask
 */
export function createServiceTask(
    params: Omit<ServiceTask, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'type'>
): ServiceTask {
    return {
        ...params,
        id: generateTaskId(),
        type: 'service',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
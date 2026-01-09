/**
 * Base interface for all task types in the task framework
 */
export interface BaseTask {
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
 * Type guard to check if a task is a CLITask
 */
export function isCLITask(task: BaseTask): task is CLITask {
    return task.type === 'cli';
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
 * Generate a unique task ID
 */
function generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
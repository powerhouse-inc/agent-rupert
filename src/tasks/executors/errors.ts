/**
 * Custom error types for task execution
 */

export class TaskExecutionError extends Error {
    constructor(
        message: string,
        public readonly taskId: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'TaskExecutionError';
    }
}

export class TaskTimeoutError extends TaskExecutionError {
    constructor(
        taskId: string,
        public readonly timeout: number,
        public readonly command?: string
    ) {
        super(`Task ${taskId} timed out after ${timeout}ms`, taskId);
        this.name = 'TaskTimeoutError';
    }
}

export class TaskValidationError extends TaskExecutionError {
    constructor(
        taskId: string,
        public readonly validationErrors: string[]
    ) {
        super(`Task ${taskId} validation failed: ${validationErrors.join(', ')}`, taskId);
        this.name = 'TaskValidationError';
    }
}

export class TaskProcessError extends TaskExecutionError {
    constructor(
        taskId: string,
        public readonly exitCode: number | null,
        public readonly stderr?: string,
        public readonly signal?: string
    ) {
        super(
            `Task ${taskId} process failed with exit code ${exitCode}${signal ? ` (signal: ${signal})` : ''}`,
            taskId
        );
        this.name = 'TaskProcessError';
    }
}

export class TaskResourceError extends TaskExecutionError {
    constructor(
        taskId: string,
        public readonly resource: 'memory' | 'cpu' | 'disk',
        public readonly limit?: number
    ) {
        super(`Task ${taskId} exceeded ${resource} limit${limit ? `: ${limit}` : ''}`, taskId);
        this.name = 'TaskResourceError';
    }
}
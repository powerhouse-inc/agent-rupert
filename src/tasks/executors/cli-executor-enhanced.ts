import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { CLITask } from '../types.js';
import { 
    TaskTimeoutError, 
    TaskValidationError, 
    TaskProcessError,
    TaskExecutionError 
} from './errors.js';

export interface CLIExecutorConfig {
    timeout?: number;
    maxOutputSize?: number;
    retryAttempts?: number;
    retryDelay?: number;
    killSignal?: NodeJS.Signals;
    gracefulShutdownTimeout?: number;
}

export interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: string | null;
    timedOut: boolean;
    startedAt: Date;
    completedAt: Date;
    duration: number;
    retryCount?: number;
}

/**
 * Enhanced CLI Executor with comprehensive error handling and retry logic
 */
export class CLIExecutorEnhanced extends EventEmitter {
    private readonly config: Required<CLIExecutorConfig>;

    constructor(config: CLIExecutorConfig = {}) {
        super();
        this.config = {
            timeout: config.timeout || Number(process.env.TASK_TIMEOUT_MS) || 300000,
            maxOutputSize: config.maxOutputSize || 1024 * 1024, // 1MB
            retryAttempts: config.retryAttempts || Number(process.env.TASK_RETRY_ATTEMPTS) || 3,
            retryDelay: config.retryDelay || 1000, // 1 second
            killSignal: config.killSignal || 'SIGTERM',
            gracefulShutdownTimeout: config.gracefulShutdownTimeout || 5000
        };
    }

    /**
     * Execute a CLI task with retry logic
     */
    async execute(task: CLITask): Promise<ExecutionResult> {
        // Validate task first
        this.validateTask(task);

        let lastError: Error | undefined;
        let retryCount = 0;

        for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
            try {
                this.emit('attempt', { task, attempt: attempt + 1, maxAttempts: this.config.retryAttempts });
                
                const result = await this.executeOnce(task);
                
                // Add retry count to result
                return { ...result, retryCount };
                
            } catch (error) {
                lastError = error as Error;
                retryCount++;
                
                // Don't retry on validation errors
                if (error instanceof TaskValidationError) {
                    throw error;
                }
                
                // Check if we should retry
                if (attempt < this.config.retryAttempts - 1) {
                    const shouldRetry = this.shouldRetry(error as Error);
                    
                    if (shouldRetry) {
                        this.emit('retry', { 
                            task, 
                            attempt: attempt + 1, 
                            error, 
                            nextRetryIn: this.config.retryDelay 
                        });
                        
                        // Exponential backoff
                        const delay = this.config.retryDelay * Math.pow(2, attempt);
                        await this.delay(delay);
                    } else {
                        throw error;
                    }
                } else {
                    throw error;
                }
            }
        }

        throw lastError || new TaskExecutionError('Task execution failed', task.id);
    }

    /**
     * Execute task once without retry
     */
    private async executeOnce(task: CLITask): Promise<ExecutionResult> {
        const startedAt = new Date();
        const timeout = task.environment?.TIMEOUT ? 
            parseInt(task.environment.TIMEOUT) : 
            this.config.timeout;

        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            let outputSize = 0;
            let timedOut = false;
            let timeoutHandle: NodeJS.Timeout | undefined;
            let processKilled = false;

            const options = {
                cwd: task.workingDirectory || process.cwd(),
                env: { ...process.env, ...task.environment },
                shell: true
            };

            const child: ChildProcess = spawn(task.command, task.args, options);
            
            // Store PID for monitoring
            if (child.pid) {
                this.emit('started', { task, pid: child.pid });
            }

            // Setup timeout
            if (timeout > 0) {
                timeoutHandle = setTimeout(() => {
                    timedOut = true;
                    processKilled = true;
                    
                    this.emit('timeout', { task, timeout, pid: child.pid });
                    
                    // Graceful shutdown
                    child.kill(this.config.killSignal);
                    
                    // Force kill after grace period
                    setTimeout(() => {
                        if (!child.killed) {
                            child.kill('SIGKILL');
                        }
                    }, this.config.gracefulShutdownTimeout);
                }, timeout);
            }

            // Handle stdout
            child.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                outputSize += chunk.length;

                if (outputSize <= this.config.maxOutputSize) {
                    stdout += chunk;
                    this.emit('stdout', { task, data: chunk });
                } else {
                    if (!stdout.includes('[Output truncated')) {
                        stdout += '\n[Output truncated due to size limit]';
                        this.emit('warning', { 
                            task, 
                            message: `Output exceeded ${this.config.maxOutputSize} bytes` 
                        });
                    }
                    child.stdout?.pause();
                }
            });

            // Handle stderr
            child.stderr?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                outputSize += chunk.length;

                if (outputSize <= this.config.maxOutputSize) {
                    stderr += chunk;
                    this.emit('stderr', { task, data: chunk });
                } else {
                    if (!stderr.includes('[Output truncated')) {
                        stderr += '\n[Output truncated due to size limit]';
                    }
                    child.stderr?.pause();
                }
            });

            // Handle process exit
            child.on('exit', (code: number | null, signal: string | null) => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }

                const completedAt = new Date();
                const duration = completedAt.getTime() - startedAt.getTime();

                const result: ExecutionResult = {
                    stdout,
                    stderr,
                    exitCode: code,
                    signal,
                    timedOut,
                    startedAt,
                    completedAt,
                    duration
                };

                this.emit('completed', { task, result });

                if (timedOut) {
                    reject(new TaskTimeoutError(task.id, timeout, task.command));
                } else if (code !== 0 && code !== null) {
                    // Non-zero exit code - might be an error or expected
                    if (task.environment?.IGNORE_EXIT_CODE === 'true') {
                        resolve(result);
                    } else {
                        reject(new TaskProcessError(task.id, code, stderr, signal || undefined));
                    }
                } else if (processKilled && signal) {
                    reject(new TaskProcessError(task.id, code, stderr, signal));
                } else {
                    resolve(result);
                }
            });

            // Handle process errors
            child.on('error', (error: Error) => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }

                this.emit('error', { task, error });
                
                reject(new TaskExecutionError(
                    `Failed to execute command: ${error.message}`,
                    task.id,
                    error
                ));
            });
        });
    }

    /**
     * Validate task parameters
     */
    private validateTask(task: CLITask): void {
        const errors: string[] = [];

        if (!task.id) {
            errors.push('Task ID is required');
        }

        if (!task.command || task.command.trim() === '') {
            errors.push('Command cannot be empty');
        }

        if (!Array.isArray(task.args)) {
            errors.push('Args must be an array');
        }

        if (task.workingDirectory && typeof task.workingDirectory !== 'string') {
            errors.push('Working directory must be a string');
        }

        if (task.environment && typeof task.environment !== 'object') {
            errors.push('Environment must be an object');
        }

        // Check for dangerous commands if not explicitly allowed
        if (task.environment?.ALLOW_DANGEROUS !== 'true') {
            const dangerous = ['rm -rf /', 'format', 'dd if=/dev/zero'];
            const cmdLower = task.command.toLowerCase();
            
            if (dangerous.some(d => cmdLower.includes(d))) {
                errors.push('Potentially dangerous command detected');
            }
        }

        if (errors.length > 0) {
            throw new TaskValidationError(task.id, errors);
        }
    }

    /**
     * Determine if error is retryable
     */
    private shouldRetry(error: Error): boolean {
        // Don't retry validation errors
        if (error instanceof TaskValidationError) {
            return false;
        }

        // Retry timeout errors
        if (error instanceof TaskTimeoutError) {
            return true;
        }

        // Retry some process errors
        if (error instanceof TaskProcessError) {
            // Retry on specific exit codes (e.g., temporary failures)
            const retryableExitCodes = [124, 137, 143]; // timeout, SIGKILL, SIGTERM
            return retryableExitCodes.includes(error.exitCode || -1);
        }

        // Retry on specific error messages
        const retryableMessages = [
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'spawn ENOMEM'
        ];

        return retryableMessages.some(msg => error.message.includes(msg));
    }

    /**
     * Helper to delay execution
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
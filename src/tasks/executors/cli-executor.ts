import { ChildProcess } from 'child_process';
import { CLITask } from '../types.js';
import { 
    TaskTimeoutError, 
    TaskValidationError, 
    TaskProcessError,
    TaskExecutionError 
} from './errors.js';
import { BaseExecutor, BaseExecutorConfig, StreamHandlerOptions } from './base-executor.js';

export interface CLIExecutorOptions extends BaseExecutorConfig {
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
}

export interface StreamOptions {
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    bufferOutput?: boolean;
    detached?: boolean; // Whether to run in detached mode for process group management
}

export interface CLIExecutorResult {
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

export interface CLIStreamEvent {
    type: 'stdout' | 'stderr' | 'start' | 'exit' | 'error';
    data?: string;
    code?: number | null;
    error?: Error;
    timestamp: Date;
}

/**
 * Unified CLI Executor with streaming, retry logic, and comprehensive error handling
 */
export class CLIExecutor extends BaseExecutor {
    private readonly cliConfig: Required<Pick<CLIExecutorOptions, 'timeout' | 'retryAttempts' | 'retryDelay'>>;
    public currentProcess: ChildProcess | null = null;

    constructor(options: CLIExecutorOptions = {}) {
        super(options);
        this.cliConfig = {
            timeout: options.timeout || Number(process.env.TASK_TIMEOUT_MS) || 300000,
            retryAttempts: options.retryAttempts || Number(process.env.TASK_RETRY_ATTEMPTS) || 3,
            retryDelay: options.retryDelay || 1000 // 1 second
        };
    }

    /**
     * Execute a CLI task with retry logic
     */
    async execute(task: CLITask): Promise<CLIExecutorResult> {
        // Validate task first
        this.validateTask(task);

        let lastError: Error | undefined;
        let retryCount = 0;

        for (let attempt = 0; attempt < this.cliConfig.retryAttempts; attempt++) {
            try {
                this.emit('attempt', { task, attempt: attempt + 1, maxAttempts: this.cliConfig.retryAttempts });
                
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
                if (attempt < this.cliConfig.retryAttempts - 1) {
                    const shouldRetry = this.shouldRetry(error as Error);
                    
                    if (shouldRetry) {
                        this.emit('retry', { 
                            task, 
                            attempt: attempt + 1, 
                            error, 
                            nextRetryIn: this.cliConfig.retryDelay 
                        });
                        
                        // Exponential backoff
                        const delay = this.cliConfig.retryDelay * Math.pow(2, attempt);
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
     * Execute a CLI task with streaming support
     */
    async executeWithStream(task: CLITask, streamOptions?: StreamOptions): Promise<CLIExecutorResult> {
        // Validate task first
        this.validateTask(task);
        
        // Use executeOnce with streaming options
        return this.executeOnce(task, streamOptions);
    }

    /**
     * Execute task once without retry
     */
    private async executeOnce(task: CLITask, streamOptions?: StreamOptions): Promise<CLIExecutorResult> {
        const startedAt = new Date();
        const timeout = task.environment?.TIMEOUT ? 
            parseInt(task.environment.TIMEOUT) : 
            this.cliConfig.timeout;

        // Emit start event for streaming
        if (streamOptions) {
            this.emit('stream', {
                type: 'start',
                timestamp: new Date()
            } as CLIStreamEvent);
        }

        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            let outputSize = 0;
            let timedOut = false;
            let timeoutHandle: NodeJS.Timeout | undefined;
            let processKilled = false;

            const spawnOptions: any = {
                cwd: task.workingDirectory || process.cwd(),
                env: this.createEnvironment(task.environment)
            };
            
            // Only use detached mode if explicitly requested (for long-running processes)
            if (streamOptions?.detached && process.platform !== 'win32') {
                spawnOptions.detached = true;
            }

            const { process: child, pid } = this.spawnProcess(task.command, task.args, spawnOptions);
            
            // Store reference to current process for cleanup
            this.currentProcess = child;
            
            // Store PID for monitoring
            if (pid) {
                this.emit('started', { task, pid });
            }

            // Handle timeout
            if (timeout > 0) {
                timeoutHandle = setTimeout(() => {
                    timedOut = true;
                    processKilled = true;
                    
                    this.emit('timeout', { task, timeout, pid: child.pid });
                    
                    // Use base class method for graceful kill
                    this.killProcessGracefully(child).catch(() => {
                        // Process kill errors are handled by exit event
                    });
                }, timeout);
            }

            // Handle stdout with optional streaming
            child.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                outputSize += chunk.length;

                // Stream the data in real-time if requested
                if (streamOptions?.onStdout) {
                    streamOptions.onStdout(chunk);
                }

                // Emit stream event
                if (streamOptions) {
                    this.emit('stream', {
                        type: 'stdout',
                        data: chunk,
                        timestamp: new Date()
                    } as CLIStreamEvent);
                }

                // Buffer output if requested (default true)
                if (streamOptions?.bufferOutput !== false) {
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
                }
            });

            // Handle stderr with optional streaming
            child.stderr?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                outputSize += chunk.length;

                // Stream the data in real-time if requested
                if (streamOptions?.onStderr) {
                    streamOptions.onStderr(chunk);
                }

                // Emit stream event
                if (streamOptions) {
                    this.emit('stream', {
                        type: 'stderr',
                        data: chunk,
                        timestamp: new Date()
                    } as CLIStreamEvent);
                }

                // Buffer output if requested (default true)
                if (streamOptions?.bufferOutput !== false) {
                    if (outputSize <= this.config.maxOutputSize) {
                        stderr += chunk;
                        this.emit('stderr', { task, data: chunk });
                    } else {
                        if (!stderr.includes('[Output truncated')) {
                            stderr += '\n[Output truncated due to size limit]';
                        }
                        child.stderr?.pause();
                    }
                }
            });

            // Handle process exit
            child.on('exit', (code: number | null, signal: string | null) => {
                // Clear the current process reference
                this.currentProcess = null;
                
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }

                const completedAt = new Date();
                const duration = completedAt.getTime() - startedAt.getTime();

                // Emit exit event for streaming
                if (streamOptions) {
                    this.emit('stream', {
                        type: 'exit',
                        code,
                        timestamp: new Date()
                    } as CLIStreamEvent);
                }

                const result: CLIExecutorResult = {
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

                // Emit error event for streaming
                if (streamOptions) {
                    this.emit('stream', {
                        type: 'error',
                        error,
                        timestamp: new Date()
                    } as CLIStreamEvent);
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
        // Use base class validation for common properties
        this.validateBaseTask(task);
        
        // Use base class command validation
        this.validateCommand(task.command, task.args);
        
        const errors: string[] = [];

        if (task.workingDirectory && typeof task.workingDirectory !== 'string') {
            errors.push('Working directory must be a string');
        }

        if (task.environment && typeof task.environment !== 'object') {
            errors.push('Environment must be an object');
        }

        // Additional validation for dangerous commands if not explicitly allowed
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

    // Note: delay() method is now inherited from BaseExecutor
}
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { CLITask } from '../types.js';

export interface StreamOptions {
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    bufferOutput?: boolean;
}

export interface CLIExecutorStreamOptions {
    timeout?: number;
    maxOutputSize?: number;
    streaming?: StreamOptions;
}

export interface CLIStreamEvent {
    type: 'stdout' | 'stderr' | 'start' | 'exit' | 'error';
    data?: string;
    code?: number | null;
    error?: Error;
    timestamp: Date;
}

/**
 * Enhanced CLI Executor with streaming capabilities
 */
export class CLIExecutorStream extends EventEmitter {
    private readonly defaultTimeout: number;
    private readonly maxOutputSize: number;

    constructor(options: CLIExecutorStreamOptions = {}) {
        super();
        this.defaultTimeout = options.timeout || Number(process.env.TASK_TIMEOUT_MS) || 300000;
        this.maxOutputSize = options.maxOutputSize || 1024 * 1024; // 1MB default
    }

    /**
     * Execute a CLI task with streaming support
     */
    async executeWithStream(task: CLITask, streamOptions?: StreamOptions): Promise<{
        stdout: string;
        stderr: string;
        exitCode: number | null;
        timedOut: boolean;
        startedAt: Date;
        completedAt: Date;
        duration: number;
    }> {
        const startedAt = new Date();
        const timeout = task.environment?.TIMEOUT ? 
            parseInt(task.environment.TIMEOUT) : 
            this.defaultTimeout;

        // Emit start event
        this.emit('stream', {
            type: 'start',
            timestamp: new Date()
        } as CLIStreamEvent);

        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let timeoutHandle: NodeJS.Timeout | undefined;
            let outputSize = 0;

            const options = {
                cwd: task.workingDirectory || process.cwd(),
                env: { ...process.env, ...task.environment },
                shell: true
            };

            const child: ChildProcess = spawn(task.command, task.args, options);

            // Handle timeout
            if (timeout > 0) {
                timeoutHandle = setTimeout(() => {
                    timedOut = true;
                    this.emit('timeout', { task, timeout });
                    child.kill('SIGTERM');
                    
                    // Force kill after grace period
                    setTimeout(() => {
                        if (!child.killed) {
                            child.kill('SIGKILL');
                        }
                    }, 5000);
                }, timeout);
            }

            // Handle stdout with streaming
            child.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                outputSize += chunk.length;

                // Stream the data in real-time
                if (streamOptions?.onStdout) {
                    streamOptions.onStdout(chunk);
                }

                // Emit stream event
                this.emit('stream', {
                    type: 'stdout',
                    data: chunk,
                    timestamp: new Date()
                } as CLIStreamEvent);

                // Buffer output if requested
                if (streamOptions?.bufferOutput !== false) {
                    if (outputSize <= this.maxOutputSize) {
                        stdout += chunk;
                    } else if (!stdout.includes('[Output truncated')) {
                        stdout += '\n[Output truncated due to size limit]';
                    }
                }
            });

            // Handle stderr with streaming
            child.stderr?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                outputSize += chunk.length;

                // Stream the data in real-time
                if (streamOptions?.onStderr) {
                    streamOptions.onStderr(chunk);
                }

                // Emit stream event
                this.emit('stream', {
                    type: 'stderr',
                    data: chunk,
                    timestamp: new Date()
                } as CLIStreamEvent);

                // Buffer output if requested
                if (streamOptions?.bufferOutput !== false) {
                    if (outputSize <= this.maxOutputSize) {
                        stderr += chunk;
                    } else if (!stderr.includes('[Output truncated')) {
                        stderr += '\n[Output truncated due to size limit]';
                    }
                }
            });

            // Handle process exit
            child.on('exit', (code: number | null) => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }

                const completedAt = new Date();
                const duration = completedAt.getTime() - startedAt.getTime();

                // Emit exit event
                this.emit('stream', {
                    type: 'exit',
                    code,
                    timestamp: new Date()
                } as CLIStreamEvent);

                const result = {
                    stdout,
                    stderr,
                    exitCode: code,
                    timedOut,
                    startedAt,
                    completedAt,
                    duration
                };

                if (timedOut) {
                    reject(new Error(`Task timed out after ${timeout}ms`));
                } else if (code !== 0 && code !== null) {
                    // Still resolve but with non-zero exit code
                    resolve(result);
                } else {
                    resolve(result);
                }
            });

            // Handle process errors
            child.on('error', (error: Error) => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }

                // Emit error event
                this.emit('stream', {
                    type: 'error',
                    error,
                    timestamp: new Date()
                } as CLIStreamEvent);

                reject(error);
            });
        });
    }

    /**
     * Execute without streaming (backward compatible)
     */
    async execute(task: CLITask): Promise<any> {
        return this.executeWithStream(task, { bufferOutput: true });
    }
}
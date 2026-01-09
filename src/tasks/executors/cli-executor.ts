import { spawn, ChildProcess } from 'child_process';
import { CLITask } from '../types.js';

export interface CLIExecutorOptions {
    timeout?: number;
    maxOutputSize?: number;
}

export interface CLIExecutorResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
    startedAt: Date;
    completedAt: Date;
    duration: number;
}

/**
 * Executor for CLI tasks that spawns child processes and captures output
 */
export class CLIExecutor {
    private readonly defaultTimeout: number;
    private readonly maxOutputSize: number;

    constructor(options: CLIExecutorOptions = {}) {
        this.defaultTimeout = options.timeout || Number(process.env.TASK_TIMEOUT_MS) || 300000;
        this.maxOutputSize = options.maxOutputSize || 1024 * 1024; // 1MB default
    }

    /**
     * Execute a CLI task by spawning a child process
     */
    async execute(task: CLITask): Promise<CLIExecutorResult> {
        const startedAt = new Date();
        const timeout = task.environment?.TIMEOUT ? 
            parseInt(task.environment.TIMEOUT) : 
            this.defaultTimeout;

        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let timeoutHandle: NodeJS.Timeout | undefined;

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
                    child.kill('SIGTERM');
                    
                    // Force kill after grace period
                    setTimeout(() => {
                        if (!child.killed) {
                            child.kill('SIGKILL');
                        }
                    }, 5000);
                }, timeout);
            }

            // Capture stdout
            child.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                if (stdout.length + chunk.length <= this.maxOutputSize) {
                    stdout += chunk;
                } else {
                    stdout += '[Output truncated due to size limit]';
                    child.stdout?.pause();
                }
            });

            // Capture stderr
            child.stderr?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                if (stderr.length + chunk.length <= this.maxOutputSize) {
                    stderr += chunk;
                } else {
                    stderr += '[Output truncated due to size limit]';
                    child.stderr?.pause();
                }
            });

            // Handle process exit
            child.on('exit', (code: number | null) => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }

                const completedAt = new Date();
                const duration = completedAt.getTime() - startedAt.getTime();

                const result: CLIExecutorResult = {
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
                    reject(new Error(`Process exited with code ${code}`));
                } else {
                    resolve(result);
                }
            });

            // Handle process errors
            child.on('error', (error: Error) => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }

                reject(error);
            });
        });
    }

    /**
     * Validate a CLI task before execution
     */
    validateTask(task: CLITask): void {
        if (!task.command || task.command.trim() === '') {
            throw new Error('Task command cannot be empty');
        }

        if (!Array.isArray(task.args)) {
            throw new Error('Task args must be an array');
        }

        if (task.workingDirectory && typeof task.workingDirectory !== 'string') {
            throw new Error('Task workingDirectory must be a string');
        }

        if (task.environment && typeof task.environment !== 'object') {
            throw new Error('Task environment must be an object');
        }
    }
}
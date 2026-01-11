import { spawn, ChildProcess, SpawnOptions, exec, execSync } from 'child_process';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { BaseTask } from '../types.js';
import { TaskValidationError } from './errors.js';

/**
 * Configuration options for BaseExecutor
 */
export interface BaseExecutorConfig {
    maxOutputSize?: number;
    killSignal?: NodeJS.Signals;
    gracefulShutdownTimeout?: number;
}

/**
 * Options for handling output streams
 */
export interface StreamHandlerOptions {
    onData?: (data: string) => void;
    bufferOutput?: boolean;
    maxSize?: number;
    streamType: 'stdout' | 'stderr';
    emitEvents?: boolean;
}

/**
 * Result from spawning a process
 */
export interface ProcessSpawnResult {
    process: ChildProcess;
    pid?: number;
}

/**
 * Abstract base class for task executors
 * Provides common functionality for process management
 */
export abstract class BaseExecutor extends EventEmitter {
    protected readonly config: Required<BaseExecutorConfig>;

    constructor(config: BaseExecutorConfig = {}) {
        super();
        this.config = {
            maxOutputSize: config.maxOutputSize || 1024 * 1024, // 1MB default
            killSignal: config.killSignal || 'SIGTERM',
            gracefulShutdownTimeout: config.gracefulShutdownTimeout || 5000
        };
    }

    /**
     * Validate command and arguments
     */
    protected validateCommand(command: string, args: string[]): void {
        const errors: string[] = [];

        if (!command || command.trim() === '') {
            errors.push('Command cannot be empty');
        }

        if (!Array.isArray(args)) {
            errors.push('Args must be an array');
        }

        // Check for potentially dangerous commands
        const dangerous = ['rm -rf /', 'format', 'dd if=/dev/zero'];
        const cmdLower = command.toLowerCase();
        
        if (dangerous.some(d => cmdLower.includes(d))) {
            errors.push('Potentially dangerous command detected');
        }

        if (errors.length > 0) {
            throw new TaskValidationError('validation-error', errors);
        }
    }

    /**
     * Validate base task properties
     */
    protected validateBaseTask(task: BaseTask): void {
        const errors: string[] = [];

        if (!task.id) {
            errors.push('Task ID is required');
        }

        if (!task.title || task.title.trim() === '') {
            errors.push('Task title is required');
        }

        if (errors.length > 0) {
            throw new TaskValidationError(task.id || 'unknown', errors);
        }
    }

    /**
     * Spawn a child process with the given command and arguments
     */
    protected spawnProcess(
        command: string, 
        args: string[], 
        options: SpawnOptions = {}
    ): ProcessSpawnResult {
        // Merge with default options
        const spawnOptions: SpawnOptions = {
            shell: true,
            ...options
        };

        const child = spawn(command, args, spawnOptions);

        // Store PID for monitoring
        if (child.pid) {
            this.emit('process-spawned', { 
                pid: child.pid, 
                command, 
                args 
            });
        }

        return {
            process: child,
            pid: child.pid
        };
    }

    /**
     * Handle output stream (stdout or stderr) with buffering and size limits
     */
    protected handleOutputStream(
        stream: Readable | null,
        options: StreamHandlerOptions
    ): { buffer: string; pause: () => void } {
        let buffer = '';
        let totalSize = 0;
        let isPaused = false;

        const pause = () => {
            if (stream && !isPaused) {
                stream.pause();
                isPaused = true;
            }
        };

        if (!stream) {
            return { buffer, pause };
        }

        stream.on('data', (data: Buffer) => {
            const chunk = data.toString();
            totalSize += chunk.length;

            // Call the data handler if provided
            if (options.onData) {
                options.onData(chunk);
            }

            // Emit events if requested
            if (options.emitEvents) {
                this.emit(options.streamType, { data: chunk });
            }

            // Buffer output if requested (default true)
            if (options.bufferOutput !== false) {
                const maxSize = options.maxSize || this.config.maxOutputSize;
                
                if (totalSize <= maxSize) {
                    buffer += chunk;
                } else {
                    if (!buffer.includes('[Output truncated')) {
                        buffer += '\n[Output truncated due to size limit]';
                        this.emit('output-truncated', { 
                            streamType: options.streamType,
                            size: totalSize,
                            maxSize 
                        });
                    }
                    pause();
                }
            }
        });

        return { buffer, pause };
    }

    /**
     * Kill a process gracefully with timeout for forced kill
     */
    protected async killProcessGracefully(
        process: ChildProcess,
        signal?: NodeJS.Signals
    ): Promise<void> {
        return new Promise((resolve) => {
            if (!process || process.killed || process.exitCode !== null) {
                resolve();
                return;
            }

            const killSignal = signal || this.config.killSignal;
            let forceKillTimeout: NodeJS.Timeout | null = null;
            let processExited = false;

            // Listen for process exit
            const exitHandler = () => {
                processExited = true;
                if (forceKillTimeout) {
                    clearTimeout(forceKillTimeout);
                }
                resolve();
            };

            process.once('exit', exitHandler);

            // Send graceful shutdown signal
            try {
                if (process.pid && global.process.platform !== 'win32') {
                    // On Unix, if process was spawned with detached: true,
                    // it's a process group leader. Kill the entire group.
                    try {
                        // Use system kill to send signal to process group (negative PID)
                        execSync(`kill -${killSignal.replace('SIG', '')} -${process.pid}`, { stdio: 'ignore' });
                        this.emit('process-kill-sent', { 
                            pid: -process.pid, // Negative indicates process group
                            signal: killSignal 
                        });
                    } catch (err) {
                        // If group kill fails, fallback to normal kill
                        process.kill(killSignal);
                        this.emit('process-kill-sent', { 
                            pid: process.pid, 
                            signal: killSignal 
                        });
                    }
                } else {
                    // Windows or fallback
                    process.kill(killSignal);
                    this.emit('process-kill-sent', { 
                        pid: process.pid, 
                        signal: killSignal 
                    });
                }
            } catch (error) {
                // Process might already be dead
                process.removeListener('exit', exitHandler);
                resolve();
                return;
            }

            // Set timeout for forced kill
            forceKillTimeout = setTimeout(() => {
                if (!processExited && !process.killed) {
                    try {
                        if (process.pid && global.process.platform !== 'win32') {
                            // Force kill the process group
                            try {
                                execSync(`kill -9 -${process.pid}`, { stdio: 'ignore' });
                            } catch {
                                // Fallback to normal kill
                                process.kill('SIGKILL');
                            }
                        } else {
                            process.kill('SIGKILL');
                        }
                        this.emit('process-force-killed', { 
                            pid: process.pid 
                        });
                    } catch {
                        // Process already dead
                    }
                }
                // Always resolve after timeout
                process.removeListener('exit', exitHandler);
                resolve();
            }, this.config.gracefulShutdownTimeout);
        });
    }

    /**
     * Helper to delay execution
     */
    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if a process is still running
     */
    protected isProcessRunning(pid: number): boolean {
        try {
            // Sending signal 0 checks if process exists without killing it
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create environment variables object
     */
    protected createEnvironment(customEnv?: Record<string, string>): NodeJS.ProcessEnv {
        return {
            ...process.env,
            ...customEnv
        };
    }
}
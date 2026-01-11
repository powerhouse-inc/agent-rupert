import { ChildProcess } from 'child_process';
import { ServiceTask, ServiceHandle, ServiceStatus } from '../types.js';
import { BaseExecutor, BaseExecutorConfig } from './base-executor.js';
import { TaskValidationError, TaskExecutionError } from './errors.js';

/**
 * Options for the ServiceExecutor
 */
export interface ServiceExecutorOptions extends BaseExecutorConfig {
    maxLogSize?: number;
    defaultGracefulShutdownTimeout?: number;
    autoRestart?: boolean;
}

/**
 * Options for stopping a service
 */
export interface StopOptions {
    force?: boolean;
    timeout?: number;
}

/**
 * Options for retrieving logs
 */
export interface LogOptions {
    limit?: number;
    tail?: boolean;
}

/**
 * Internal representation of a running service
 */
interface RunningService {
    handle: ServiceHandle;
    task: ServiceTask;
    process: ChildProcess;
    logs: string[];
    restartCount: number;
    maxLogs: number;
    shutdownTimer?: NodeJS.Timeout;
}

/**
 * Executor for long-running service tasks without timeouts
 */
export class ServiceExecutor extends BaseExecutor {
    private readonly serviceConfig: Required<Pick<ServiceExecutorOptions, 'maxLogSize' | 'defaultGracefulShutdownTimeout' | 'autoRestart'>>;
    private readonly services = new Map<string, RunningService>();

    constructor(options: ServiceExecutorOptions = {}) {
        super(options);
        this.serviceConfig = {
            maxLogSize: options.maxLogSize || 1000,
            defaultGracefulShutdownTimeout: options.defaultGracefulShutdownTimeout || 10000,
            autoRestart: options.autoRestart || false
        };
    }

    /**
     * Start a long-running service
     */
    async start(task: ServiceTask): Promise<ServiceHandle> {
        // Validate the service task
        this.validateServiceTask(task);

        // Check if a service with this task ID is already running
        for (const service of this.services.values()) {
            if (service.task.id === task.id) {
                throw new TaskExecutionError(
                    `Service with task ${task.id} is already running`,
                    task.id
                );
            }
        }

        // Create service handle
        const handle: ServiceHandle = {
            id: `service-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            taskId: task.id,
            startedAt: new Date(),
            status: 'starting'
        };

        try {
            // Spawn the process without timeout
            const spawnOptions = {
                cwd: task.workingDirectory || process.cwd(),
                env: this.createEnvironment(task.environment),
                detached: process.platform !== 'win32' // Enable process group on Unix
            };

            const { process: childProcess, pid } = this.spawnProcess(
                task.command,
                task.args,
                spawnOptions
            );

            if (pid) {
                handle.pid = pid;
            }

            // Create running service entry
            const runningService: RunningService = {
                handle,
                task,
                process: childProcess,
                logs: [],
                restartCount: 0,
                maxLogs: this.serviceConfig.maxLogSize
            };

            // Store the service
            this.services.set(handle.id, runningService);

            // Set up process event handlers
            this.setupServiceHandlers(runningService);

            // Update status to running
            handle.status = 'running';
            this.emit('service-started', { handle, task });

            return handle;
        } catch (error) {
            handle.status = 'failed';
            this.emit('service-failed', { handle, task, error });
            throw new TaskExecutionError(
                `Failed to start service: ${error instanceof Error ? error.message : 'Unknown error'}`,
                task.id,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Stop a running service
     */
    async stop(serviceId: string, options?: StopOptions): Promise<void> {
        const service = this.services.get(serviceId);
        if (!service) {
            throw new TaskExecutionError(
                `Service ${serviceId} not found`,
                serviceId
            );
        }

        // Update status
        service.handle.status = 'stopping';
        this.emit('service-stopping', { handle: service.handle });

        // Determine shutdown timeout
        const timeout = options?.timeout || 
            service.task.gracefulShutdown?.timeout || 
            this.serviceConfig.defaultGracefulShutdownTimeout;

        // Determine shutdown signal
        const signal = service.task.gracefulShutdown?.signal || this.config.killSignal;

        try {
            if (options?.force) {
                // Force kill immediately
                service.process.kill('SIGKILL');
            } else {
                // Graceful shutdown
                await this.killProcessGracefully(service.process, signal);
            }

            // Wait for process to exit or timeout
            await this.waitForExit(service.process, timeout);

            // Clean up streams
            if (service.process.stdout) {
                service.process.stdout.destroy();
            }
            if (service.process.stderr) {
                service.process.stderr.destroy();
            }
            if (service.process.stdin) {
                service.process.stdin.destroy();
            }

            // Clean up
            this.services.delete(serviceId);
            service.handle.status = 'stopped';
            this.emit('service-stopped', { handle: service.handle });
        } catch (error) {
            service.handle.status = 'failed';
            throw new TaskExecutionError(
                `Failed to stop service: ${error instanceof Error ? error.message : 'Unknown error'}`,
                service.task.id,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Restart a running service
     */
    async restart(serviceId: string): Promise<ServiceHandle> {
        const service = this.services.get(serviceId);
        if (!service) {
            throw new TaskExecutionError(
                `Service ${serviceId} not found`,
                serviceId
            );
        }

        const task = service.task;
        
        // Stop the service
        await this.stop(serviceId);
        
        // Wait a moment before restarting
        const delay = task.restartPolicy?.delay || 1000;
        await this.delay(delay);
        
        // Start it again
        return this.start(task);
    }

    /**
     * Get status of a service
     */
    getStatus(serviceId: string): ServiceStatus | null {
        const service = this.services.get(serviceId);
        if (!service) {
            return null;
        }

        const uptime = Date.now() - service.handle.startedAt.getTime();

        return {
            handle: service.handle,
            uptime,
            restartCount: service.restartCount
        };
    }

    /**
     * Get logs from a service
     */
    getLogs(serviceId: string, options?: LogOptions): string[] {
        const service = this.services.get(serviceId);
        if (!service) {
            return [];
        }

        let logs = service.logs;

        if (options?.limit && options.limit > 0) {
            logs = logs.slice(-options.limit);
        }

        return logs;
    }

    /**
     * Get all running services
     */
    getAllServices(): ServiceHandle[] {
        return Array.from(this.services.values()).map(s => s.handle);
    }

    /**
     * Stop all running services
     */
    async stopAll(options?: StopOptions): Promise<void> {
        const promises = Array.from(this.services.keys()).map(id => 
            this.stop(id, options).catch(error => {
                this.emit('service-stop-error', { serviceId: id, error });
            })
        );

        await Promise.all(promises);
    }

    /**
     * Validate service task
     */
    private validateServiceTask(task: ServiceTask): void {
        // Use base validation
        this.validateBaseTask(task);
        this.validateCommand(task.command, task.args);

        const errors: string[] = [];

        if (task.workingDirectory && typeof task.workingDirectory !== 'string') {
            errors.push('Working directory must be a string');
        }

        if (task.environment && typeof task.environment !== 'object') {
            errors.push('Environment must be an object');
        }

        if (task.restartPolicy) {
            if (typeof task.restartPolicy.enabled !== 'boolean') {
                errors.push('restartPolicy.enabled must be a boolean');
            }
            if (task.restartPolicy.maxRetries !== undefined && 
                (typeof task.restartPolicy.maxRetries !== 'number' || task.restartPolicy.maxRetries < 0)) {
                errors.push('restartPolicy.maxRetries must be a positive number');
            }
        }

        if (errors.length > 0) {
            throw new TaskValidationError(task.id, errors);
        }
    }

    /**
     * Set up event handlers for a service process
     */
    private setupServiceHandlers(service: RunningService): void {
        const { process: proc, handle, task } = service;

        // Handle stdout
        proc.stdout?.on('data', (data: Buffer) => {
            const output = data.toString();
            this.addLog(service, `[stdout] ${output}`);
            this.emit('service-output', { 
                serviceId: handle.id, 
                type: 'stdout', 
                data: output 
            });
        });

        // Handle stderr
        proc.stderr?.on('data', (data: Buffer) => {
            const output = data.toString();
            this.addLog(service, `[stderr] ${output}`);
            this.emit('service-output', { 
                serviceId: handle.id, 
                type: 'stderr', 
                data: output 
            });
        });

        // Handle process exit
        proc.on('exit', (code: number | null, signal: string | null) => {
            const wasRunning = handle.status === 'running';
            handle.status = 'stopped';
            this.addLog(service, `Process exited with code ${code} and signal ${signal}`);
            
            // Clean up streams
            if (proc.stdout) {
                proc.stdout.destroy();
            }
            if (proc.stderr) {
                proc.stderr.destroy();
            }
            if (proc.stdin) {
                proc.stdin.destroy();
            }
            
            // Remove from services map
            this.services.delete(handle.id);

            // Emit exit event
            this.emit('service-exited', { 
                handle, 
                code, 
                signal 
            });

            // Handle unexpected exit with restart if configured
            if (code !== 0 && task.restartPolicy?.enabled && wasRunning) {
                this.handleRestart(service, code, signal);
            }
        });

        // Handle process errors
        proc.on('error', (error: Error) => {
            handle.status = 'failed';
            this.addLog(service, `Process error: ${error.message}`);
            this.emit('service-error', { 
                handle, 
                error 
            });
        });
    }

    /**
     * Add a log entry for a service
     */
    private addLog(service: RunningService, message: string): void {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}`;
        
        service.logs.push(logEntry);
        
        // Trim logs if they exceed max size
        if (service.logs.length > service.maxLogs) {
            service.logs = service.logs.slice(-service.maxLogs);
        }
    }

    /**
     * Handle service restart
     */
    private async handleRestart(service: RunningService, code: number | null, signal: string | null): Promise<void> {
        const { task, handle } = service;
        const maxRetries = task.restartPolicy?.maxRetries || 3;

        if (service.restartCount >= maxRetries) {
            this.emit('service-restart-limit', { 
                handle, 
                restartCount: service.restartCount 
            });
            return;
        }

        service.restartCount++;
        const delay = task.restartPolicy?.delay || 1000;

        this.emit('service-restarting', { 
            handle, 
            attempt: service.restartCount, 
            maxRetries,
            reason: { code, signal }
        });

        await this.delay(delay * service.restartCount); // Exponential backoff

        try {
            await this.start(task);
        } catch (error) {
            this.emit('service-restart-failed', { 
                handle, 
                error 
            });
        }
    }

    /**
     * Wait for a process to exit with timeout
     */
    private async waitForExit(process: ChildProcess, timeout: number): Promise<void> {
        return new Promise((resolve, reject) => {
            // If process has already exited or been killed
            if (process.killed || process.exitCode !== null) {
                resolve();
                return;
            }

            let exited = false;
            let timeoutHandle: NodeJS.Timeout;

            const exitHandler = () => {
                exited = true;
                clearTimeout(timeoutHandle);
                resolve();
            };

            process.once('exit', exitHandler);

            timeoutHandle = setTimeout(() => {
                if (!exited) {
                    process.removeListener('exit', exitHandler);
                    // Don't reject, just resolve - process might be killed but event not received yet
                    resolve();
                }
            }, timeout);
        });
    }
}
import { ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import { ServiceTask, ServiceHandle, ServiceInfo, ServiceStatus } from '../types.js';
import { BaseExecutor, BaseExecutorConfig } from './base-executor.js';
import { TaskValidationError, TaskExecutionError } from './errors.js';

const execAsync = promisify(exec);

/**
 * Port release verification options
 */
export interface PortReleaseOptions {
    verifyPortRelease?: boolean; // Enable port verification (default: true)
    portReleaseTimeout?: number; // Max time to wait for ports (default: 5000ms)
    portCheckInterval?: number; // Interval between checks (default: 100ms)
    portCheckRetries?: number; // Max retries (default: 50)
}

/**
 * Options for the ServiceExecutor
 */
export interface ServiceExecutorOptions extends BaseExecutorConfig {
    maxLogSize?: number;
    defaultGracefulShutdownTimeout?: number;
    autoRestart?: boolean;
    portReleaseOptions?: PortReleaseOptions;
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
 * Compiled readiness matcher for efficient pattern matching
 */
interface ReadinessMatcher {
    pattern: RegExp;
    stream: 'stdout' | 'stderr' | 'any';
    name?: string;
    endpoints?: import('../types.js').EndpointCaptureGroup[];
    matched: boolean;
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
    // Boot phase fields
    bootTimeout?: NodeJS.Timeout;
    readinessMatchers?: ReadinessMatcher[];
    readinessMatched: boolean;
    // Port monitoring fields
    portsToMonitor?: number[];
}

/**
 * Executor for long-running service tasks without timeouts
 */
export class ServiceExecutor extends BaseExecutor {
    private readonly serviceConfig: Required<Pick<ServiceExecutorOptions, 'maxLogSize' | 'defaultGracefulShutdownTimeout' | 'autoRestart'>>;
    private readonly portReleaseConfig: Required<PortReleaseOptions>;
    private readonly services = new Map<string, RunningService>();

    constructor(options: ServiceExecutorOptions = {}) {
        super(options);
        this.serviceConfig = {
            maxLogSize: options.maxLogSize || 1000,
            defaultGracefulShutdownTimeout: options.defaultGracefulShutdownTimeout || 10000,
            autoRestart: options.autoRestart || false
        };
        this.portReleaseConfig = {
            verifyPortRelease: options.portReleaseOptions?.verifyPortRelease ?? true,
            portReleaseTimeout: options.portReleaseOptions?.portReleaseTimeout || 5000,
            portCheckInterval: options.portReleaseOptions?.portCheckInterval || 100,
            portCheckRetries: options.portReleaseOptions?.portCheckRetries || 50
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
            status: task.readiness ? 'booting' : 'running' // Start in booting if readiness configured
        };

        try {
            // Spawn the process without timeout
            const spawnOptions = {
                cwd: task.workingDirectory || process.cwd(),
                env: this.createEnvironment(task.environment),
                detached: process.platform !== 'win32' // Create process group on Unix
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
                maxLogs: this.serviceConfig.maxLogSize,
                readinessMatched: !task.readiness // If no readiness config, consider it matched
            };
            
            // Set up readiness detection if configured
            if (task.readiness) {
                // Compile regex patterns for efficient matching
                runningService.readinessMatchers = task.readiness.patterns.map(pattern => ({
                    pattern: new RegExp(pattern.regex, pattern.flags || ''),
                    stream: pattern.stream || 'any',
                    name: pattern.name,
                    endpoints: pattern.endpoints,
                    matched: false
                }));
                
                // Set up boot timeout
                const bootTimeout = task.readiness.timeout || 30000;
                runningService.bootTimeout = setTimeout(() => {
                    this.handleBootTimeout(runningService);
                }, bootTimeout);
                
                // Emit booting event
                this.emit('service-booting', {
                    handle,
                    readinessConfig: task.readiness
                });
                
                this.addLog(runningService, `Service booting with ${task.readiness.patterns.length} readiness patterns (timeout: ${bootTimeout}ms)`);
            }

            // Store the service
            this.services.set(handle.id, runningService);

            // Set up process event handlers
            this.setupServiceHandlers(runningService);

            // Emit service started event (status already set based on readiness config)
            this.emit('service-started', { handle, task });
            
            // If not in boot phase, log as running immediately
            if (!task.readiness) {
                this.addLog(runningService, 'Service started and running immediately (no readiness config)');
            }

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

        // Clear boot timeout if still pending
        if (service.bootTimeout) {
            clearTimeout(service.bootTimeout);
            service.bootTimeout = undefined;
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

            // Only verify port release if we're doing a controlled shutdown
            // The exit handler will also verify ports on unexpected exits
            // We skip it here to avoid duplicate checks
            /* Port release verification is handled in the exit event handler */

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
    getStatus(serviceId: string): ServiceInfo | null {
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
            
            // Check for readiness patterns during boot phase
            if (handle.status === 'booting') {
                this.checkReadiness(service, 'stdout', output);
            }
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
            
            // Check for readiness patterns during boot phase
            if (handle.status === 'booting') {
                this.checkReadiness(service, 'stderr', output);
            }
        });

        // Handle process exit
        proc.on('exit', async (code: number | null, signal: string | null) => {
            const wasRunning = handle.status === 'running' || handle.status === 'booting';
            handle.status = 'stopped';
            this.addLog(service, `Process exited with code ${code} and signal ${signal}`);
            
            // Verify port release if configured (for unexpected exits)
            if (service.portsToMonitor && service.portsToMonitor.length > 0) {
                try {
                    await this.verifyPortsReleased(service);
                } catch (error) {
                    // Log warning but don't block exit handler
                    this.addLog(service, `Warning: Port release verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    this.emit('port-release-timeout', { 
                        handle: service.handle, 
                        unavailablePorts: Array.from(service.portsToMonitor) 
                    });
                }
            }
            
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
     * Check if output matches readiness patterns and transition to running if ready
     */
    private checkReadiness(service: RunningService, stream: 'stdout' | 'stderr', data: string): boolean {
        if (!service.readinessMatchers || service.readinessMatched) {
            return service.readinessMatched;
        }

        let newMatches = false;
        
        for (let i = 0; i < service.readinessMatchers.length; i++) {
            const matcher = service.readinessMatchers[i];
            
            // Skip if already matched or wrong stream
            if (matcher.matched) continue;
            if (matcher.stream !== 'any' && matcher.stream !== stream) continue;
            
            const match = data.match(matcher.pattern);
            if (match) {
                matcher.matched = true;
                newMatches = true;
                
                // Always store captured groups
                if (!service.handle.readinessMatches) {
                    service.handle.readinessMatches = new Map();
                }
                const patternName = matcher.name || i.toString();
                service.handle.readinessMatches.set(patternName, match.slice(1));
                
                // Build endpoint URLs if configured
                if (matcher.endpoints) {
                    if (!service.handle.endpoints) {
                        service.handle.endpoints = new Map();
                    }
                    
                    for (const endpoint of matcher.endpoints) {
                        const capturedValue = match[endpoint.endpointCaptureGroup];
                        if (capturedValue) {
                            // Construct full URL or use captured value directly
                            const fullUrl = endpoint.endpointDefaultHostUrl 
                                ? `${endpoint.endpointDefaultHostUrl}:${capturedValue}`
                                : capturedValue;
                            service.handle.endpoints.set(endpoint.endpointName, fullUrl);
                            
                            // Track ports that need monitoring upon termination
                            if (endpoint.monitorPortReleaseUponTermination) {
                                if (!service.portsToMonitor) {
                                    service.portsToMonitor = [];
                                }
                                // Extract port from the captured value or full URL
                                const port = parseInt(capturedValue, 10);
                                if (!isNaN(port) && !service.portsToMonitor.includes(port)) {
                                    service.portsToMonitor.push(port);
                                }
                            }
                        }
                    }
                }
                
                // Emit match event
                this.emit('readiness-match', {
                    handle: service.handle,
                    pattern: patternName,
                    matches: match.slice(1)
                });
            }
        }
        
        // Check if all patterns matched
        if (newMatches) {
            const allMatched = service.readinessMatchers.every(m => m.matched);
            if (allMatched) {
                this.transitionToRunning(service);
                return true;
            }
        }
        
        return false;
    }

    /**
     * Transition service from booting to running
     */
    private transitionToRunning(service: RunningService): void {
        if (service.handle.status !== 'booting') return;
        
        // Clear boot timeout
        if (service.bootTimeout) {
            clearTimeout(service.bootTimeout);
            service.bootTimeout = undefined;
        }
        
        // Update status
        const bootDuration = Date.now() - service.handle.startedAt.getTime();
        service.handle.status = 'running';
        service.handle.bootedAt = new Date();
        service.readinessMatched = true;
        
        // Emit ready event
        this.emit('service-ready', {
            handle: service.handle,
            bootDuration,
            readinessMatches: service.handle.readinessMatches
        });
        
        this.addLog(service, 'Service transitioned from booting to running');
    }

    /**
     * Handle boot phase timeout
     */
    private handleBootTimeout(service: RunningService): void {
        if (service.handle.status !== 'booting') return;
        
        const timeout = service.task.readiness?.timeout || 30000;
        
        // Initialize empty readinessMatches if not already present
        if (!service.handle.readinessMatches) {
            service.handle.readinessMatches = new Map();
        }
        
        this.emit('boot-timeout', {
            handle: service.handle,
            timeout
        });
        
        this.addLog(service, `Boot timeout after ${timeout}ms - transitioning to running anyway`);
        
        // Transition to running despite timeout (configurable behavior)
        this.transitionToRunning(service);
    }

    /**
     * Check if a port is available (not in use)
     * Uses lsof on Linux/Mac or netstat on Windows to check port usage
     */
    private async checkPortAvailable(port: number): Promise<boolean> {
        try {
            // Use lsof which works well in WSL and Linux
            // -i :PORT checks for processes using that port
            // -P prevents port number conversion to service names
            // -n prevents hostname resolution (faster)
            const command = `lsof -i :${port} -P -n 2>/dev/null | grep LISTEN || true`;
            const { stdout } = await execAsync(command);
            
            // Debug logging
            this.emit('debug', { 
                message: `Port check for ${port}: stdout="${stdout}", length=${stdout.length}, trimmed=${stdout.trim().length}` 
            });
            
            // If stdout is empty, port is not in use
            return stdout.trim().length === 0;
        } catch (error) {
            // If lsof command fails, try netstat as fallback
            try {
                const { stdout } = await execAsync(`netstat -tln 2>/dev/null | grep :${port} || true`);
                return stdout.trim().length === 0;
            } catch {
                // If both commands fail, assume port is available
                this.emit('warning', { 
                    message: `Could not verify port ${port} availability - assuming available` 
                });
                return true;
            }
        }
    }

    /**
     * Extract port numbers from endpoint URLs
     */
    private extractPortsFromEndpoints(endpoints?: Map<string, string>): number[] {
        if (!endpoints || endpoints.size === 0) {
            return [];
        }

        const ports = new Set<number>();
        
        for (const [name, url] of endpoints) {
            try {
                // Parse the URL to extract the port
                const urlObj = new URL(url);
                if (urlObj.port) {
                    ports.add(parseInt(urlObj.port, 10));
                } else {
                    // Use default ports if not specified
                    if (urlObj.protocol === 'http:') ports.add(80);
                    else if (urlObj.protocol === 'https:') ports.add(443);
                    else if (urlObj.protocol === 'ws:') ports.add(80);
                    else if (urlObj.protocol === 'wss:') ports.add(443);
                }
            } catch (error) {
                // Try to extract port from non-standard URL format
                const portMatch = url.match(/:(\d+)/);
                if (portMatch) {
                    ports.add(parseInt(portMatch[1], 10));
                }
            }
        }

        return Array.from(ports);
    }

    /**
     * Verify that all monitored ports have been released
     */
    private async verifyPortsReleased(service: RunningService): Promise<void> {
        if (!this.portReleaseConfig.verifyPortRelease || !service.portsToMonitor || service.portsToMonitor.length === 0) {
            return;
        }

        // Give OS a moment to release the ports after process termination
        // The exit event fires when the process exits, but the OS may take
        // a moment to actually release the network ports
        await new Promise(resolve => setTimeout(resolve, 500));

        const ports = service.portsToMonitor;
        const startTime = Date.now();
        let retries = 0;
        let unavailablePorts = [...ports];

        this.emit('checking-port-release', { 
            handle: service.handle, 
            ports 
        });

        while (retries < this.portReleaseConfig.portCheckRetries && unavailablePorts.length > 0) {
            const stillInUse: number[] = [];

            // Check each port
            for (const port of unavailablePorts) {
                const isAvailable = await this.checkPortAvailable(port);
                if (isAvailable) {
                    this.emit('port-released', { 
                        handle: service.handle, 
                        port 
                    });
                } else {
                    stillInUse.push(port);
                }
            }

            unavailablePorts = stillInUse;

            if (unavailablePorts.length > 0) {
                // Still have ports in use, wait before retrying
                if (Date.now() - startTime >= this.portReleaseConfig.portReleaseTimeout) {
                    // Timeout reached
                    this.emit('port-release-timeout', { 
                        handle: service.handle, 
                        unavailablePorts 
                    });
                    this.addLog(service, `Port release timeout - ports still in use: ${unavailablePorts.join(', ')}`);
                    break;
                }

                // Wait before next check
                await new Promise(resolve => setTimeout(resolve, this.portReleaseConfig.portCheckInterval));
                retries++;
            }
        }

        if (unavailablePorts.length === 0) {
            const duration = Date.now() - startTime;
            this.emit('ports-released', { 
                handle: service.handle, 
                ports, 
                duration 
            });
            this.addLog(service, `All monitored ports released after ${duration}ms`);
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
        return new Promise((resolve) => {
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
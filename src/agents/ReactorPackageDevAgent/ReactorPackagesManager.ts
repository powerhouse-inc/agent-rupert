import path from 'node:path';
import fs from 'node:fs/promises';
import { CLIExecutor } from '../../tasks/executors/cli-executor.js';
import { ServiceExecutor } from '../../tasks/executors/service-executor.js';
import { createCLITask, createServiceTask } from '../../tasks/types.js';
import type { CLITask, ServiceTask, ServiceHandle } from '../../tasks/types.js';
import type { ChildProcess } from 'node:child_process';

export interface ReactorPackageConfig {
    name: string;
    path: string;
    connectPort?: number;      // Connect Studio port (default: 3000)
    switchboardPort?: number;   // Vetra Switchboard port (default: 4001)
}

export interface InitProjectResult {
    success: boolean;
    projectPath: string;
    error?: string;
}

/**
 * Represents a currently running Powerhouse project
 */
export interface RunningProject {
    /** Project name */
    name: string;
    /** Absolute path to the project directory */
    path: string;
    /** Child process instance if available */
    process?: ChildProcess;
    /** Service handle for the running service */
    serviceHandle?: ServiceHandle;
    /** Connect Studio port */
    connectPort: number;
    /** Vetra Switchboard port */
    switchboardPort: number;
    /** Timestamp when the project was started */
    startedAt: Date;
    /** Captured stdout/stderr logs from the running process */
    logs: string[];
    /** The Drive URL once vetra has fully started (e.g., http://localhost:4001/drives/xyz) */
    driveUrl?: string;
    /** The MCP server once vetra has fully started (e.g., http://localhost:4001/mcp) */
    mcpServer?: string;
    /** Indicates whether vetra has fully started and is ready to accept connections */
    isFullyStarted: boolean;
}

/**
 * Options for running a Powerhouse project
 */
export interface RunProjectOptions {
    /** Connect Studio port (default: 3000) */
    connectPort: number;
    /** Vetra Switchboard port (default: 4001) */
    switchboardPort: number;
    /** Timeout in milliseconds to wait for vetra to fully start (default: 60000) */
    startupTimeout: number;
}

/**
 * Result of running a Powerhouse project
 */
export interface RunProjectResult {
    /** Whether the project started successfully */
    success: boolean;
    /** Name of the project */
    projectName?: string;
    /** Error message if the operation failed */
    error?: string;
    /** Connect Studio port the project is running on */
    connectPort?: number;
    /** Vetra Switchboard port the project is running on */
    switchboardPort?: number;
    /** The Drive URL if captured during startup (e.g., http://localhost:4001/drives/xyz) */
    driveUrl?: string;
    /** The MCP server once vetra has fully started (e.g., http://localhost:4001/mcp) */
    mcpServer?: string;
    /** The folder of the project */
    projectPath?: string;
}

interface VetraRuntimeParams {
    driveUrl: string | null;
    mcpServer: string | null;
}

export interface VetraConfig {
    connectPort: number;
    switchboardPort: number;
    startupTimeout: number;
}

export class ReactorPackagesManager {
    private readonly projectsDir: string;
    private readonly cliExecutor: CLIExecutor;
    private readonly serviceExecutor: ServiceExecutor;
    private readonly vetraConfig: VetraConfig;
    private runningProject: RunningProject | null = null;

    constructor(
        projectsDir: string = '../projects',
        cliExecutor?: CLIExecutor,
        serviceExecutor?: ServiceExecutor,
        vetraConfig?: VetraConfig
    ) {
        // Resolve the projects directory relative to the current working directory
        this.projectsDir = path.resolve(process.cwd(), projectsDir);
        this.cliExecutor = cliExecutor || new CLIExecutor({
            timeout: 60000, // 1 minute timeout for ph init
            retryAttempts: 1
        });
        // ServiceExecutor for long-running services (no timeout)
        this.serviceExecutor = serviceExecutor || new ServiceExecutor({
            maxLogSize: 500,
            defaultGracefulShutdownTimeout: 10000
        });
        // Store vetraConfig with defaults if not provided
        this.vetraConfig = vetraConfig || {
            connectPort: 3000,
            switchboardPort: 4001,
            startupTimeout: 240000
        };
    }

    /**
     * Initialize a new Powerhouse project using ph init
     * @param projectName - Name of the project to create
     * @returns Result of the initialization
     */
    async init(projectName: string): Promise<InitProjectResult> {
        if (!projectName || projectName.trim() === '') {
            return {
                success: false,
                projectPath: '',
                error: 'Project name cannot be empty'
            };
        }

        // Validate project name (alphanumeric, hyphens, underscores)
        if (!/^[a-zA-Z0-9-_]+$/.test(projectName)) {
            return {
                success: false,
                projectPath: '',
                error: 'Project name can only contain letters, numbers, hyphens, and underscores'
            };
        }

        const projectPath = path.join(this.projectsDir, projectName);

        try {
            // Ensure projects directory exists
            await fs.mkdir(this.projectsDir, { recursive: true });

            // Check if project already exists
            try {
                await fs.access(projectPath);
                return {
                    success: false,
                    projectPath,
                    error: `Project '${projectName}' already exists at ${projectPath}`
                };
            } catch {
                // Project doesn't exist, which is good
            }

            // Create CLI task for ph init
            const initTask: CLITask = createCLITask({
                title: `Initialize Powerhouse project: ${projectName}`,
                instructions: `Create a new Powerhouse project using ph init`,
                command: 'ph',
                args: ['init', projectName],
                workingDirectory: this.projectsDir,
                environment: {
                    // Ensure non-interactive mode if available
                    CI: 'true'
                }
            });

            // Execute the initialization
            const result = await this.cliExecutor.execute(initTask);

            // Check if initialization was successful
            if (result.exitCode === 0) {
                // Verify the project was created
                try {
                    await fs.access(projectPath);
                    
                    // Check for key files that indicate successful initialization
                    const packageJsonPath = path.join(projectPath, 'package.json');
                    const configPath = path.join(projectPath, 'powerhouse.config.json');
                    
                    await fs.access(packageJsonPath);
                    await fs.access(configPath);
                    
                    return {
                        success: true,
                        projectPath
                    };
                } catch (error) {
                    return {
                        success: false,
                        projectPath,
                        error: `Project created but missing expected files: ${error}`
                    };
                }
            } else {
                // Extract error from stderr or stdout
                const errorMessage = result.stderr || result.stdout || 'Unknown error during initialization';
                const finalErrorMessage = `ph init failed: ${errorMessage}`;
                
                return {
                    success: false,
                    projectPath,
                    error: finalErrorMessage
                };
            }
        } catch (error) {
            const errorMessage = `Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`;
            
            return {
                success: false,
                projectPath,
                error: errorMessage
            };
        }
    }

    /**
     * Get the projects directory path
     */
    getProjectsDir(): string {
        return this.projectsDir;
    }

    /**
     * List all Powerhouse projects in the projects directory
     * @returns Array of project configurations
     */
    async listProjects(): Promise<ReactorPackageConfig[]> {
        const projects: ReactorPackageConfig[] = [];

        try {
            // Ensure directory exists
            await fs.mkdir(this.projectsDir, { recursive: true });
            
            // Read directory contents
            const entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
            
            // Check each directory for Powerhouse project
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const projectPath = path.join(this.projectsDir, entry.name);
                    const configPath = path.join(projectPath, 'powerhouse.config.json');
                    
                    try {
                        // Check if it's a valid Powerhouse project
                        await fs.access(configPath);
                        
                        // Read the configuration
                        const configContent = await fs.readFile(configPath, 'utf-8');
                        const config = JSON.parse(configContent);
                        
                        projects.push({
                            name: entry.name,
                            path: projectPath,
                            connectPort: config.studio?.port || config.connect?.port,
                            switchboardPort: config.reactor?.port || config.switchboard?.port
                        });
                    } catch {
                        // Not a Powerhouse project or invalid config, skip
                    }
                }
            }
        } catch (error) {
            // Directory doesn't exist or other error
            // Error listing projects
        }

        return projects;
    }

    /**
     * Check if a port is in use
     * @param port Port number to check
     * @returns true if port is in use, false otherwise
     */
    private async isPortInUse(port: number): Promise<boolean> {
        try {
            const checkPortTask: CLITask = createCLITask({
                title: `Check port ${port}`,
                command: 'lsof',
                args: ['-i', `:${port}`],
                instructions: `Checking if port ${port} is in use`
            });
            
            const result = await this.cliExecutor.execute(checkPortTask);
            // If lsof returns output, the port is in use
            return !!result.stdout && result.stdout.trim().length > 0;
        } catch (error) {
            // If lsof fails (command not found, no results), assume port is free
            return false;
        }
    }

    async runProject(projectName: string, options?: RunProjectOptions): Promise<RunProjectResult> {
        // Set defaults for options using vetraConfig
        const effectiveOptions: RunProjectOptions = {
            connectPort: options?.connectPort || this.vetraConfig.connectPort,
            switchboardPort: options?.switchboardPort || this.vetraConfig.switchboardPort,
            startupTimeout: options?.startupTimeout || this.vetraConfig.startupTimeout
        };
        // Check if a project is already running
        if (this.runningProject) {
            return {
                success: false,
                error: `A project is already running: ${this.runningProject.name}. Please shutdown the current project first.`
            };
        }

        // Check if ports are available before attempting to start
        const connectPortInUse = await this.isPortInUse(effectiveOptions.connectPort);
        if (connectPortInUse) {
            return {
                success: false,
                error: `Port ${effectiveOptions.connectPort} (Connect Studio) is already in use. Try a different port or stop the process using it.`,
                projectName,
                ...effectiveOptions
            };
        }

        const switchboardPortInUse = await this.isPortInUse(effectiveOptions.switchboardPort);
        if (switchboardPortInUse) {
            return {
                success: false,
                error: `Port ${effectiveOptions.switchboardPort} (Switchboard) is already in use. Try a different port or stop the process using it.`,
                projectName,
                ...effectiveOptions
            };
        }

        // Validate project name
        if (!projectName || projectName.trim() === '') {
            return {
                success: false,
                error: 'Project name cannot be empty'
            };
        }

        // Find the project
        const projects = await this.listProjects();
        const project = projects.find(p => p.name === projectName);
        
        if (!project) {
            return {
                success: false,
                error: `Project '${projectName}' not found in ${this.projectsDir}`
            };
        }

        // Use provided ports from effectiveOptions (with guaranteed defaults)
        const actualConnectPort = effectiveOptions.connectPort;
        const actualSwitchboardPort = effectiveOptions.switchboardPort;
        
        // Track the readiness timeout so we can clean it up
        let readinessTimeoutId: NodeJS.Timeout | null = null;

        try {
            // Create Service task for ph vetra --watch with port options and readiness patterns
            const runTask: ServiceTask = createServiceTask({
                title: `Run Powerhouse project: ${project.name}`,
                instructions: `Start Powerhouse Vetra development server for ${project.name}`,
                command: 'ph',
                args: [
                    'vetra',
                    '--watch',
                    '--connect-port', String(actualConnectPort),
                    '--switchboard-port', String(actualSwitchboardPort)
                ],
                workingDirectory: project.path,
                environment: {
                    NODE_ENV: 'development'
                },
                gracefulShutdown: {
                    signal: 'SIGTERM',
                    timeout: 10000
                },
                readiness: {
                    patterns: [
                        {
                            regex: 'Local:\\s*http://localhost:(\\d+)',
                            name: 'connect-port',
                            endpoints: [{
                                endpointName: 'connect-studio',
                                endpointDefaultHostUrl: 'http://localhost',
                                endpointCaptureGroup: 1,
                                monitorPortReleaseUponTermination: true
                            }]
                        },
                        {
                            regex: 'Drive URL:\\s*(https?://[^\\s]+)',
                            name: 'drive-url',
                            endpoints: [{
                                endpointName: 'drive-url',
                                endpointDefaultHostUrl: '',
                                endpointCaptureGroup: 1,
                                monitorPortReleaseUponTermination: false
                            }]
                        },
                        {
                            regex: 'MCP server available at (https?://[^\\s]+)',
                            name: 'mcp-server',
                            endpoints: [{
                                endpointName: 'mcp-server',
                                endpointDefaultHostUrl: '',
                                endpointCaptureGroup: 1,
                                monitorPortReleaseUponTermination: false
                            }]
                        },
                    ],
                    timeout: effectiveOptions.startupTimeout
                }
            });

            // Store the running project info
            this.runningProject = {
                name: project.name,
                path: project.path,
                connectPort: actualConnectPort,
                switchboardPort: actualSwitchboardPort,
                startedAt: new Date(),
                logs: [],
                isFullyStarted: false  // Will be set to true when Drive URL is captured
            };
        
            // Set up event listener for service output (for logging only, not for readiness detection)
            const outputHandler = (event: any) => {
                if (!this.runningProject || event.serviceId !== this.runningProject.serviceHandle?.id) {
                    return;
                }
                
                const data = event.data;
                const logPrefix = event.type === 'stdout' ? '[stdout]' : '[stderr]';
                this.runningProject.logs.push(`${logPrefix} ${data}`);
                
                const maxLogs = 500;
                if (this.runningProject.logs.length > maxLogs) {
                    this.runningProject.logs = this.runningProject.logs.slice(-maxLogs);
                }
            };
            
            // Set up promise to wait for service readiness
            let serviceReadyResolve: ((value: VetraRuntimeParams) => void) | null = null;
            const serviceReadyPromise = new Promise<VetraRuntimeParams>((resolve) => {
                serviceReadyResolve = resolve;
                
                // Set timeout for readiness
                readinessTimeoutId = setTimeout(() => {
                    // Resolve with null on timeout
                    resolve({driveUrl: null, mcpServer: null});
                }, effectiveOptions.startupTimeout);
            });

            // Listen for service-ready event
            const readyHandler = (event: any) => {
                if (event.handle.id === this.runningProject?.serviceHandle?.id) {
                    // Extract the Drive URL from endpoints
                    const driveUrl = event.handle.endpoints?.get('drive-url') || null;
                    const mcpServer = event.handle.endpoints?.get('mcp-server') || null;

                    if (driveUrl && this.runningProject) {
                        this.runningProject.driveUrl = driveUrl;
                        this.runningProject.mcpServer = mcpServer;
                        this.runningProject.isFullyStarted = true;
                    }
                    
                    // Resolve the promise with Drive URL (or null if not captured)
                    if (serviceReadyResolve) {
                        // Clear the timeout since we're resolving
                        if (readinessTimeoutId) {
                            clearTimeout(readinessTimeoutId);
                            readinessTimeoutId = null;
                        }
                        serviceReadyResolve({ driveUrl, mcpServer });
                    }
                }
            };
            
            // Listen for boot-timeout event (fallback if patterns don't match)
            const bootTimeoutHandler = (event: any) => {
                if (event.handle.id === this.runningProject?.serviceHandle?.id) {
                    // Boot timeout for project: readiness patterns not matched
                    if (serviceReadyResolve) {
                        // Clear the timeout since we're resolving
                        if (readinessTimeoutId) {
                            clearTimeout(readinessTimeoutId);
                            readinessTimeoutId = null;
                        }
                        serviceReadyResolve({driveUrl: null, mcpServer: null});
                    }
                }
            };

            // Register all handlers
            this.serviceExecutor.on('service-output', outputHandler);
            this.serviceExecutor.once('service-ready', readyHandler);
            this.serviceExecutor.once('boot-timeout', bootTimeoutHandler);
            
            // Start the service (no timeout!)
            const serviceHandle = await this.serviceExecutor.start(runTask);
            this.runningProject.serviceHandle = serviceHandle;
            
            // Store the service handle's PID if available
            if (serviceHandle.pid && this.runningProject) {
                // Create a mock process object for compatibility
                this.runningProject.process = { pid: serviceHandle.pid } as ChildProcess;
            }
            
            // Handle service exit
            this.serviceExecutor.once('service-exited', (event) => {
                if (event.handle.id === serviceHandle.id) {
                    this.runningProject = null;
                    // Clean up all event listeners
                    this.serviceExecutor.removeListener('service-output', outputHandler);
                    this.serviceExecutor.removeListener('service-ready', readyHandler);
                    this.serviceExecutor.removeListener('boot-timeout', bootTimeoutHandler);
                }
            });

            // Wait for service to be ready (Drive URL captured)
            const vetraOutputParams = await serviceReadyPromise;
            
            if (!vetraOutputParams.driveUrl) {
                // Warning: Drive URL not captured within timeout
                // Project may still be starting up. Check logs with getProjectLogs() for details.
            }

            if (!vetraOutputParams.mcpServer) {
                // Warning: MCP server not captured within timeout
                // Project may still be starting up. Check logs with getProjectLogs() for details.
            }

            return {
                success: true,
                projectName: project.name,
                projectPath: project.path,
                connectPort: actualConnectPort,
                switchboardPort: actualSwitchboardPort,
                driveUrl: vetraOutputParams.driveUrl || undefined,
                mcpServer: vetraOutputParams.mcpServer || undefined,
            };

        } catch (error) {
            // Clean up timeout if it exists
            if (readinessTimeoutId) {
                clearTimeout(readinessTimeoutId);
            }
            
            this.runningProject = null;
            return {
                success: false,
                projectName: project.name,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get information about the currently running project
     * @returns Running project information or null if no project is running
     */
    getRunningProject(): RunningProject | null {
        return this.runningProject;
    }

    /**
     * Get logs for the currently running project
     * @returns Logs array or undefined if no project is running
     */
    getProjectLogs(): string[] | undefined {
        return this.runningProject?.logs;
    }

    /**
     * Check if the project is fully started and ready
     * @returns true if project is running and Drive URL has been captured
     */
    isProjectReady(): boolean {
        return this.runningProject?.isFullyStarted === true;
    }

    /**
     * Shutdown the currently running project
     * @returns Promise that resolves when the project is shutdown
     */
    async shutdownProject(): Promise<{ success: boolean; error?: string }> {
        if (!this.runningProject) {
            return {
                success: false,
                error: 'No project is currently running'
            };
        }

        const projectName = this.runningProject.name;
        const serviceHandle = this.runningProject.serviceHandle;
        
        try {
            // Shutting down project
            
            // If we have a service handle, stop it gracefully
            if (serviceHandle) {
                // Stopping service handle
                await this.serviceExecutor.stop(serviceHandle.id, {
                    timeout: 10000  // 10 second timeout for graceful shutdown
                });
                // Service handle stopped
            }
            // Fallback: If we have a process reference, kill it directly
            else if (this.runningProject.process && !this.runningProject.process.killed) {
                const pid = this.runningProject.process.pid;
                
                if (pid) {
                    // Kill the entire process tree using process group
                    // The negative PID kills all processes in the process group
                    try {
                        process.kill(-pid, 'SIGTERM');
                    } catch (e) {
                        // If process group kill fails, try regular kill
                        this.runningProject.process.kill('SIGTERM');
                    }
                    
                    // Wait a bit for graceful shutdown
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Force kill if still running
                    if (!this.runningProject.process.killed) {
                        try {
                            process.kill(-pid, 'SIGKILL');
                        } catch (e) {
                            this.runningProject.process.kill('SIGKILL');
                        }
                    }
                } else {
                    // Fallback to regular kill if no PID
                    this.runningProject.process.kill('SIGTERM');
                }
            }
            
            // Clear the running project
            this.runningProject = null;
            
            // Project shutdown complete
            return {
                success: true
            };
        } catch (error) {
            const errorMessage = `Failed to shutdown project '${projectName}': ${error instanceof Error ? error.message : String(error)}`;
            return {
                success: false,
                error: errorMessage
            };
        }
    }
}
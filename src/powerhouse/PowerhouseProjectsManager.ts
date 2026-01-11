import path from 'node:path';
import fs from 'node:fs/promises';
import { CLIExecutor } from '../tasks/executors/cli-executor.js';
import { ServiceExecutor } from '../tasks/executors/service-executor.js';
import { createCLITask, createServiceTask } from '../tasks/types.js';
import type { CLITask, ServiceTask, ServiceHandle } from '../tasks/types.js';
import type { ChildProcess } from 'node:child_process';
import { AgentProjectsClient } from '../graphql/AgentProjectsClient.js';
import { ProjectStatus, LogLevel, LogSource } from '../graphql/types.js';
import type { GraphQLConfig } from '../types.js';

export interface PowerhouseProjectConfig {
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
}

export class PowerhouseProjectsManager {
    private readonly projectsDir: string;
    private readonly cliExecutor: CLIExecutor;
    private readonly serviceExecutor: ServiceExecutor;
    private readonly graphqlClient: AgentProjectsClient | null = null;
    private runningProject: RunningProject | null = null;
    private runningProcessPromise: Promise<any> | null = null;

    constructor(
        projectsDir: string = '../projects',
        cliExecutor?: CLIExecutor,
        serviceExecutor?: ServiceExecutor,
        graphqlConfig?: GraphQLConfig
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
        
        // Initialize GraphQL client if config provided
        if (graphqlConfig) {
            this.graphqlClient = new AgentProjectsClient({
                endpoint: graphqlConfig.endpoint,
                headers: graphqlConfig.authToken ? { Authorization: `Bearer ${graphqlConfig.authToken}` } : {},
                retryAttempts: graphqlConfig.retryAttempts,
                retryDelay: graphqlConfig.retryDelay,
                timeout: graphqlConfig.timeout
            });
        }
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

                    // Sync with GraphQL if client is available
                    if (this.graphqlClient) {
                        try {
                            await this.graphqlClient.createProject({
                                name: projectName,
                                path: projectPath,
                                autoStart: false,
                                commandTimeout: 60000
                            });
                            await this.graphqlClient.addLogEntry(
                                projectName,
                                LogLevel.INFO,
                                `Project initialized successfully at ${projectPath}`,
                                LogSource.SYSTEM
                            );
                        } catch (error) {
                            console.warn('Failed to sync project creation to GraphQL:', error);
                        }
                    }
                    
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
                
                // Log error to GraphQL if client is available
                if (this.graphqlClient) {
                    try {
                        await this.graphqlClient.addLogEntry(
                            projectName,
                            LogLevel.ERROR,
                            finalErrorMessage,
                            LogSource.SYSTEM
                        );
                    } catch (graphqlError) {
                        console.warn('Failed to log error to GraphQL:', graphqlError);
                    }
                }
                
                return {
                    success: false,
                    projectPath,
                    error: finalErrorMessage
                };
            }
        } catch (error) {
            const errorMessage = `Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`;
            
            // Log error to GraphQL if client is available
            if (this.graphqlClient) {
                try {
                    await this.graphqlClient.addLogEntry(
                        projectName,
                        LogLevel.ERROR,
                        errorMessage,
                        LogSource.SYSTEM
                    );
                } catch (graphqlError) {
                    console.warn('Failed to log error to GraphQL:', graphqlError);
                }
            }
            
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
    async listProjects(): Promise<PowerhouseProjectConfig[]> {
        const projects: PowerhouseProjectConfig[] = [];

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
            console.error(`Error listing projects: ${error}`);
        }

        return projects;
    }

    /**
     * Run a single Powerhouse project with ph vetra --watch command
     * @param projectName - Name of the project to run
     * @param options - Optional configuration for running the project
     * @returns Result of the run operation including Drive URL if captured
     */
    /**
     * Clean up any orphaned vetra processes
     */
    async cleanupOrphanedProcesses(): Promise<void> {
        try {
            const findVetraTask: CLITask = createCLITask({
                title: 'Find orphaned vetra processes',
                command: 'bash',
                args: ['-c', 'ps aux | grep -E "ph.*vetra|vetra.*--watch" | grep -v grep || true'],
                instructions: 'Looking for orphaned vetra processes'
            });
            
            const result = await this.cliExecutor.execute(findVetraTask);
            if (result.stdout && result.stdout.trim()) {
                // Extract PIDs and kill them
                const lines = result.stdout.trim().split('\n');
                const pids = lines.map(line => {
                    const parts = line.split(/\s+/);
                    return parts[1]; // PID is the second column
                }).filter(pid => pid && !isNaN(Number(pid)));
                
                if (pids.length > 0) {
                    const killTask: CLITask = createCLITask({
                        title: 'Kill orphaned processes',
                        command: 'kill',
                        args: ['-9', ...pids],
                        instructions: `Killing orphaned processes: ${pids.join(', ')}`
                    });
                    
                    try {
                        await this.cliExecutor.execute(killTask);
                    } catch (error) {
                        console.warn('Failed to kill some orphaned processes:', error);
                    }
                }
            }
        } catch (error) {
            // Non-critical, just log
            console.warn('Could not check for orphaned processes:', error);
        }
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
        // Set defaults for options
        const effectiveOptions: RunProjectOptions = {
            connectPort: options?.connectPort || 3000,
            switchboardPort: options?.switchboardPort || 4001,  // Safe default port
            startupTimeout: options?.startupTimeout || 60000 // Default 60 seconds
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

        try {
            // Create Service task for ph vetra --watch with port options (no timeout!)
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
            
            // Notify GraphQL that project is running
            if (this.graphqlClient) {
                try {
                    await this.graphqlClient.updateProjectStatus(
                        project.name,
                        ProjectStatus.RUNNING
                    );
                    await this.graphqlClient.addLogEntry(
                        project.name,
                        LogLevel.INFO,
                        `Starting project with Connect on port ${actualConnectPort} and Switchboard on port ${actualSwitchboardPort}`,
                        LogSource.SYSTEM
                    );
                } catch (error) {
                    console.warn('Failed to update project status in GraphQL:', error);
                }
            }

            // Set up event listener for service output
            const outputHandler = (event: any) => {
                if (!this.runningProject || event.serviceId !== this.runningProject.serviceHandle?.id) {
                    return;
                }
                
                const data = event.data;
                const logPrefix = event.type === 'stdout' ? '[stdout]' : '[stderr]';
                
                this.runningProject.logs.push(`${logPrefix} ${data}`);
                
                // Check for Drive URL in the output
                if (!this.runningProject.driveUrl && data.includes('Drive URL:')) {
                    const urlMatch = data.match(/Drive URL:\s*(https?:\/\/[^\s]+)/);
                    if (urlMatch && urlMatch[1]) {
                        this.runningProject.driveUrl = urlMatch[1].trim();
                        this.runningProject.isFullyStarted = true;
                        
                        // Update GraphQL with runtime info including Drive URL
                        if (this.graphqlClient) {
                                    this.graphqlClient.updateProjectRuntime(
                                        this.runningProject.name,
                                        {
                                            pid: this.runningProject.process?.pid,
                                            startedAt: this.runningProject.startedAt.toISOString(),
                                            driveUrl: this.runningProject.driveUrl
                                        }
                                    ).catch(error => console.warn('Failed to update runtime in GraphQL:', error));
                                    
                                    this.graphqlClient.addLogEntry(
                                        this.runningProject.name,
                                        LogLevel.INFO,
                                        `Project fully started. Drive URL: ${this.runningProject.driveUrl}`,
                                        LogSource.SYSTEM
                                    ).catch(error => console.warn('Failed to add log entry to GraphQL:', error));
                        }
                    }
                }
                
                // Send log to GraphQL (throttled)
                const logLevel = event.type === 'stdout' ? LogLevel.INFO : LogLevel.WARNING;
                if (this.graphqlClient && data.trim()) {
                    this.graphqlClient.addLogEntry(
                        this.runningProject.name,
                        logLevel,
                        data.trim(),
                        LogSource.APPLICATION
                    ).catch(() => {}); // Silently ignore log failures
                }
                
                const maxLogs = 500;
                if (this.runningProject.logs.length > maxLogs) {
                    this.runningProject.logs = this.runningProject.logs.slice(-maxLogs);
                }
            };
            
            // Register the output handler
            this.serviceExecutor.on('service-output', outputHandler);
            
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
                    console.log(`Project '${project.name}' stopped (code: ${event.code}, signal: ${event.signal})`);
                    this.runningProject = null;
                    this.serviceExecutor.removeListener('service-output', outputHandler);
                }
            });

            // Wait for Drive URL to be captured (indicates vetra is fully started)
            const driveUrl = await this.waitForDriveUrl(effectiveOptions.startupTimeout!);
            
            if (!driveUrl) {
                // Log warning but don't fail - project might still be starting
                console.warn(
                    `Warning: Drive URL not captured within ${effectiveOptions.startupTimeout!}ms. ` +
                    `Project may still be starting up. Check logs with getProjectLogs() for details.`
                );
            }

            return {
                success: true,
                projectName: project.name,
                connectPort: actualConnectPort,
                switchboardPort: actualSwitchboardPort,
                driveUrl: driveUrl || undefined
            };

        } catch (error) {
            this.runningProject = null;
            this.runningProcessPromise = null;
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
     * Wait for the Drive URL to be captured during project startup
     * @param timeout - Maximum time to wait in milliseconds (default: 60000)
     * @returns The Drive URL if captured, null if timeout reached
     */
    async waitForDriveUrl(timeout: number = 60000): Promise<string | null> {
        if (!this.runningProject) {
            return null;
        }

        // If Drive URL is already captured, return it immediately
        if (this.runningProject.driveUrl) {
            return this.runningProject.driveUrl;
        }

        const startTime = Date.now();
        const pollInterval = 1000; // Check every 1 second

        while (Date.now() - startTime < timeout) {
            // Check if project is still running
            if (!this.runningProject) {
                return null;
            }

            // Check if Drive URL has been captured
            if (this.runningProject.driveUrl) {
                return this.runningProject.driveUrl;
            }

            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        // Timeout reached
        return null;
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
            // If we have a service handle, stop it gracefully
            if (serviceHandle) {
                await this.serviceExecutor.stop(serviceHandle.id, {
                    timeout: 10000  // 10 second timeout for graceful shutdown
                });
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

            // Update GraphQL on successful shutdown
            if (this.graphqlClient) {
                try {
                    await this.graphqlClient.updateProjectStatus(
                        projectName,
                        ProjectStatus.STOPPED
                    );
                    await this.graphqlClient.updateProjectRuntime(
                        projectName,
                        {}
                    );
                    await this.graphqlClient.addLogEntry(
                        projectName,
                        LogLevel.INFO,
                        'Project shutdown successfully',
                        LogSource.SYSTEM
                    );
                } catch (error) {
                    console.warn('Failed to update GraphQL on shutdown:', error);
                }
            }
            
            // Clear the running project
            this.runningProject = null;
            this.runningProcessPromise = null;
            
            return {
                success: true
            };
        } catch (error) {
            const errorMessage = `Failed to shutdown project '${projectName}': ${error instanceof Error ? error.message : String(error)}`;
            
            // Log shutdown error to GraphQL
            if (this.graphqlClient) {
                try {
                    await this.graphqlClient.addLogEntry(
                        projectName,
                        LogLevel.ERROR,
                        errorMessage,
                        LogSource.SYSTEM
                    );
                } catch (graphqlError) {
                    console.warn('Failed to log shutdown error to GraphQL:', graphqlError);
                }
            }
            
            return {
                success: false,
                error: errorMessage
            };
        }
    }
}
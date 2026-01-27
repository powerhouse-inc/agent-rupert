import path from 'node:path';
import fs from 'node:fs/promises';
import { CLIExecutor } from '../../tasks/executors/cli-executor.js';
import { ServiceExecutor } from '../../tasks/executors/service-executor.js';
import { createCLITask } from '../../tasks/types.js';
import type { CLITask, ServiceTask, ServiceHandle } from '../../tasks/types.js';
import type { ChildProcess } from 'node:child_process';

/**
 * Common initialization result interface
 */
export interface InitProjectResult {
    success: boolean;
    projectPath: string;
    error?: string;
}

/**
 * Base interface for running projects
 */
export interface BaseRunningProject {
    /** Project name */
    name: string;
    /** Absolute path to the project directory */
    path: string;
    /** Child process instance if available */
    process?: ChildProcess;
    /** Service handle for the running service */
    serviceHandle?: ServiceHandle;
    /** Timestamp when the project was started */
    startedAt: Date;
    /** Captured stdout/stderr logs from the running process */
    logs: string[];
    /** Indicates whether the service has fully started and is ready */
    isFullyStarted: boolean;
}

/**
 * Abstract base class for project managers
 * Provides common functionality for managing development projects
 */
export abstract class AbstractProjectManager<
    TConfig,
    TRunning extends BaseRunningProject,
    TRunOptions,
    TRunResult
> {
    protected readonly projectsDir: string;
    protected readonly cliExecutor: CLIExecutor;
    protected readonly serviceExecutor: ServiceExecutor;
    protected runningProject: TRunning | null = null;

    constructor(
        projectsDir: string,
        cliExecutor?: CLIExecutor,
        serviceExecutor?: ServiceExecutor
    ) {
        // Resolve the projects directory relative to the current working directory
        this.projectsDir = path.resolve(process.cwd(), projectsDir);
        
        this.cliExecutor = cliExecutor || new CLIExecutor({
            timeout: 60000, // 1 minute timeout for CLI commands
            retryAttempts: 1
        });
        
        // ServiceExecutor for long-running services (no timeout)
        this.serviceExecutor = serviceExecutor || new ServiceExecutor({
            maxLogSize: 500,
            defaultGracefulShutdownTimeout: 10000
        });
    }

    /**
     * Initialize a new project
     * @param projectName - Name of the project to create
     * @returns Result of the initialization
     */
    abstract init(projectName: string): Promise<InitProjectResult>;

    /**
     * List all projects in the projects directory
     * @returns Array of project configurations
     */
    abstract listProjects(): Promise<TConfig[]>;

    /**
     * Run a project with the specified options
     * @param projectName - Name of the project to run
     * @param options - Runtime options
     * @returns Result of running the project
     */
    abstract runProject(projectName: string, options?: TRunOptions): Promise<TRunResult>;

    /**
     * Get the configuration file name for this project type
     * @returns Configuration file name (e.g., "powerhouse.config.json")
     */
    protected abstract getProjectConfigFile(): string;

    /**
     * Create initialization task(s) for the project
     * @param projectName - Name of the project
     * @param projectPath - Path where the project will be created
     * @returns Single task or array of tasks to execute
     */
    protected abstract createInitTask(projectName: string, projectPath: string): CLITask | CLITask[];

    /**
     * Create the service task for running the project
     * @param project - Project configuration
     * @param options - Runtime options
     * @returns Service task to execute
     */
    protected abstract createRunTask(project: TConfig, options: TRunOptions): ServiceTask;

    /**
     * Extract readiness parameters from service ready event
     * @param event - Service ready event
     * @returns Extracted parameters specific to the project type
     */
    protected abstract extractReadinessParams(event: any): any;

    /**
     * Get the projects directory path
     */
    getProjectsDir(): string {
        return this.projectsDir;
    }

    /**
     * Get information about the currently running project
     * @returns Running project information or null if no project is running
     */
    getRunningProject(): TRunning | null {
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
     * @returns true if project is running and fully started
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

    /**
     * Check if a port is in use
     * @param port Port number to check
     * @returns true if port is in use, false otherwise
     */
    protected async isPortInUse(port: number): Promise<boolean> {
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

    /**
     * Validate a project name
     * @param projectName - Name to validate
     * @returns Validation result
     */
    protected validateProjectName(projectName: string): { valid: boolean; error?: string } {
        if (!projectName || projectName.trim() === '') {
            return {
                valid: false,
                error: 'Project name cannot be empty'
            };
        }

        // Validate project name (alphanumeric, hyphens, underscores)
        if (!/^[a-zA-Z0-9-_]+$/.test(projectName)) {
            return {
                valid: false,
                error: 'Project name can only contain letters, numbers, hyphens, and underscores'
            };
        }

        return { valid: true };
    }

    /**
     * Ensure the projects directory exists
     */
    protected async ensureProjectsDirectory(): Promise<void> {
        await fs.mkdir(this.projectsDir, { recursive: true });
    }

    /**
     * Check if a project already exists
     * @param projectPath - Path to check
     * @returns true if project exists
     */
    protected async checkProjectExists(projectPath: string): Promise<boolean> {
        try {
            await fs.access(projectPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Hook called after project initialization
     * Override to add custom post-init logic
     */
    protected async postInitHook(projectPath: string, projectName: string): Promise<void> {
        // Default: no-op
    }

    /**
     * Hook called before running a project
     * Override to add custom pre-run logic
     */
    protected async preRunHook(project: TConfig, options: TRunOptions): Promise<void> {
        // Default: no-op
    }

    /**
     * Hook called when service is ready
     * Override to add custom ready logic
     */
    protected async onServiceReady(params: any): Promise<void> {
        // Default: no-op
    }
}
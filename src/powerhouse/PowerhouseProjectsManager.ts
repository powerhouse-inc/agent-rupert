import path from 'node:path';
import fs from 'node:fs/promises';
import { CLIExecutor } from '../tasks/executors/cli-executor.js';
import { createCLITask } from '../tasks/types.js';
import type { CLITask } from '../tasks/types.js';
import type { ChildProcess } from 'node:child_process';

export interface PowerhouseProjectConfig {
    name: string;
    path: string;
    studioPort?: number;
    reactorPort?: number;
}

export interface InitProjectResult {
    success: boolean;
    projectPath: string;
    error?: string;
}

export interface RunningProject {
    name: string;
    path: string;
    process?: ChildProcess;
    studioPort: number;
    reactorPort: number;
    startedAt: Date;
    logs: string[];
}

export interface RunProjectResult {
    success: boolean;
    projectName?: string;
    error?: string;
    studioPort?: number;
    reactorPort?: number;
}

export class PowerhouseProjectsManager {
    private readonly projectsDir: string;
    private readonly basePort: number;
    private readonly portIncrement: number;
    private readonly cliExecutor: CLIExecutor;
    private runningProject: RunningProject | null = null;
    private runningProcessPromise: Promise<any> | null = null;

    constructor(
        projectsDir: string = '../projects',
        basePort: number = 5000,
        portIncrement: number = 10,
        cliExecutor?: CLIExecutor
    ) {
        // Resolve the projects directory relative to the current working directory
        this.projectsDir = path.resolve(process.cwd(), projectsDir);
        this.basePort = basePort;
        this.portIncrement = portIncrement;
        this.cliExecutor = cliExecutor || new CLIExecutor({
            timeout: 60000, // 1 minute timeout for ph init
            retryAttempts: 1
        });
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
                return {
                    success: false,
                    projectPath,
                    error: `ph init failed: ${errorMessage}`
                };
            }
        } catch (error) {
            return {
                success: false,
                projectPath,
                error: `Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`
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
                            studioPort: config.studio?.port,
                            reactorPort: config.reactor?.port
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
     * Run a single Powerhouse project with ph dev command
     * @param projectName - Name of the project to run
     * @param studioPort - Optional studio port (defaults to basePort)
     * @param reactorPort - Optional reactor port (defaults to studioPort + 1)
     * @returns Result of the run operation
     */
    async runProject(projectName: string, studioPort?: number, reactorPort?: number): Promise<RunProjectResult> {
        // Check if a project is already running
        if (this.runningProject) {
            return {
                success: false,
                error: `A project is already running: ${this.runningProject.name}. Please shutdown the current project first.`
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

        // Use provided ports or defaults
        const actualStudioPort = studioPort || this.basePort;
        const actualReactorPort = reactorPort || actualStudioPort + 1;

        try {
            // Create CLI task for ph dev
            const runTask: CLITask = createCLITask({
                title: `Run Powerhouse project: ${project.name}`,
                instructions: `Start Powerhouse development server for ${project.name}`,
                command: 'ph',
                args: ['dev'],
                workingDirectory: project.path,
                environment: {
                    PORT: String(actualStudioPort),
                    REACTOR_PORT: String(actualReactorPort),
                    NODE_ENV: 'development'
                }
            });

            // Store the running project info
            this.runningProject = {
                name: project.name,
                path: project.path,
                studioPort: actualStudioPort,
                reactorPort: actualReactorPort,
                startedAt: new Date(),
                logs: []
            };

            // Execute with streaming to keep the process running
            this.runningProcessPromise = this.cliExecutor.executeWithStream(runTask, {
                onStdout: (data) => {
                    if (this.runningProject) {
                        this.runningProject.logs.push(`[stdout] ${data}`);
                        // Keep only last 100 logs
                        if (this.runningProject.logs.length > 100) {
                            this.runningProject.logs = this.runningProject.logs.slice(-100);
                        }
                    }
                },
                onStderr: (data) => {
                    if (this.runningProject) {
                        this.runningProject.logs.push(`[stderr] ${data}`);
                        // Keep only last 100 logs
                        if (this.runningProject.logs.length > 100) {
                            this.runningProject.logs = this.runningProject.logs.slice(-100);
                        }
                    }
                }
            });

            // Get the child process from the executor if available
            if ('currentProcess' in this.cliExecutor) {
                const executor = this.cliExecutor as any;
                if (executor.currentProcess) {
                    this.runningProject.process = executor.currentProcess;
                }
            }

            // Handle process termination
            this.runningProcessPromise.catch((error) => {
                console.error(`Project '${project.name}' stopped with error:`, error);
                this.runningProject = null;
                this.runningProcessPromise = null;
            });

            return {
                success: true,
                projectName: project.name,
                studioPort: actualStudioPort,
                reactorPort: actualReactorPort
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
        
        try {
            // If we have a process reference, send SIGINT
            if (this.runningProject.process && !this.runningProject.process.killed) {
                this.runningProject.process.kill('SIGINT');
                
                // Wait a bit for graceful shutdown
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Force kill if still running
                if (!this.runningProject.process.killed) {
                    this.runningProject.process.kill('SIGTERM');
                }
            }

            // Clear the running project
            this.runningProject = null;
            this.runningProcessPromise = null;
            
            return {
                success: true
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to shutdown project '${projectName}': ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
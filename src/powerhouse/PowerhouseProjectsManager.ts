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

export interface RunProjectsResult {
    success: boolean;
    started: string[];
    failed: Array<{ name: string; error: string }>;
}

export class PowerhouseProjectsManager {
    private readonly projectsDir: string;
    private readonly basePort: number;
    private readonly portIncrement: number;
    private readonly cliExecutor: CLIExecutor;
    private runningProjects: Map<string, RunningProject> = new Map();

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
     * Run all Powerhouse projects with ph dev command
     * Each project gets unique ports based on basePort and portIncrement
     * @returns Result of the run operation
     */
    async runProjects(): Promise<RunProjectsResult> {
        const result: RunProjectsResult = {
            success: true,
            started: [],
            failed: []
        };

        // Get all projects
        const projects = await this.listProjects();
        
        if (projects.length === 0) {
            return {
                success: true,
                started: [],
                failed: []
            };
        }

        // Start each project
        for (let i = 0; i < projects.length; i++) {
            const project = projects[i];
            
            // Skip if already running
            if (this.runningProjects.has(project.name)) {
                console.log(`Project '${project.name}' is already running`);
                result.started.push(project.name);
                continue;
            }

            // Calculate ports for this project
            const studioPort = this.basePort + (i * this.portIncrement);
            const reactorPort = studioPort + 1;

            try {
                // Create CLI task for ph dev
                const runTask: CLITask = createCLITask({
                    title: `Run Powerhouse project: ${project.name}`,
                    instructions: `Start Powerhouse development server for ${project.name}`,
                    command: 'ph',
                    args: ['dev'],
                    workingDirectory: project.path,
                    environment: {
                        PORT: String(studioPort),
                        REACTOR_PORT: String(reactorPort),
                        NODE_ENV: 'development'
                    }
                });

                // Execute with streaming to keep the process running
                const executePromise = this.cliExecutor.executeWithStream(runTask, {
                    onStdout: (data) => {
                        const runningProject = this.runningProjects.get(project.name);
                        if (runningProject) {
                            runningProject.logs.push(`[stdout] ${data}`);
                            // Keep only last 100 logs
                            if (runningProject.logs.length > 100) {
                                runningProject.logs = runningProject.logs.slice(-100);
                            }
                        }
                    },
                    onStderr: (data) => {
                        const runningProject = this.runningProjects.get(project.name);
                        if (runningProject) {
                            runningProject.logs.push(`[stderr] ${data}`);
                            // Keep only last 100 logs
                            if (runningProject.logs.length > 100) {
                                runningProject.logs = runningProject.logs.slice(-100);
                            }
                        }
                    }
                });

                // Store the running project info
                const runningProject: RunningProject = {
                    name: project.name,
                    path: project.path,
                    studioPort,
                    reactorPort,
                    startedAt: new Date(),
                    logs: []
                };

                // Get the child process from the executor if available
                if ('process' in this.cliExecutor) {
                    const executor = this.cliExecutor as any;
                    if (executor.currentProcess) {
                        runningProject.process = executor.currentProcess;
                    }
                }

                this.runningProjects.set(project.name, runningProject);
                result.started.push(project.name);

                // Store the promise for cleanup later
                executePromise.catch((error) => {
                    console.error(`Project '${project.name}' stopped with error:`, error);
                    this.runningProjects.delete(project.name);
                });

            } catch (error) {
                result.success = false;
                result.failed.push({
                    name: project.name,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        return result;
    }

    /**
     * Get information about running projects
     * @returns Array of running project information
     */
    getRunningProjects(): RunningProject[] {
        return Array.from(this.runningProjects.values());
    }

    /**
     * Get logs for a specific running project
     * @param projectName - Name of the project
     * @returns Logs array or undefined if project not running
     */
    getProjectLogs(projectName: string): string[] | undefined {
        const project = this.runningProjects.get(projectName);
        return project?.logs;
    }

    async shutdownProjects(): Promise<void> {
        throw new Error('Not implemented yet');
    }
}
import { EventEmitter } from 'node:events';
import { CLIExecutor } from './cli-executor.js';
import { createCLITask } from '../types.js';
import type { ClaudeCodeTask, CLITask } from '../types.js';
import type { CLIExecutorResult } from './cli-executor.js';
import { TaskValidationError } from './errors.js';
import { ReactorPackagesManager } from '../../agents/ReactorPackageAgent/ReactorPackagesManager.js';

export interface ClaudeCodeExecutorConfig {
    timeout?: number;
    maxPromptLength?: number;
    claudeCommand?: string;
}

export interface ClaudeCodeExecutorResult {
    success: boolean;
    output?: string;
    error?: string;
    projectName?: string;
    projectPath?: string;
    startedAt: Date;
    completedAt: Date;
    duration: number;
}

/**
 * Executor for ClaudeCode tasks that requires a running ReactorPackagesManager project
 */
export class ClaudeCodeExecutor extends EventEmitter {
    private readonly config: Required<ClaudeCodeExecutorConfig>;
    private readonly projectsManager: ReactorPackagesManager;
    private readonly cliExecutor: CLIExecutor;

    constructor(
        projectsManager: ReactorPackagesManager,
        config: ClaudeCodeExecutorConfig = {}
    ) {
        super();
        
        this.projectsManager = projectsManager;
        this.config = {
            timeout: config.timeout || 300000, // 5 minutes default
            maxPromptLength: config.maxPromptLength || 10000,
            claudeCommand: config.claudeCommand || 'claude'
        };

        this.cliExecutor = new CLIExecutor({
            timeout: this.config.timeout
        });
    }

    /**
     * Execute a Claude Code task
     * Requires a running project in ReactorPackagesManager
     */
    async execute(task: ClaudeCodeTask): Promise<ClaudeCodeExecutorResult> {
        const startedAt = new Date();

        // Check if a project is running
        const runningProject = this.projectsManager.getRunningProject();
        if (!runningProject) {
            const error = 'No Powerhouse project is currently running. Please start a project with ReactorPackagesManager.runProject() first.';
            this.emit('error', { task, error });
            
            return {
                success: false,
                error,
                startedAt,
                completedAt: new Date(),
                duration: Date.now() - startedAt.getTime()
            };
        }

        // Validate the task
        if (!task.prompt || task.prompt.trim() === '') {
            throw new TaskValidationError(task.id, ['Claude Code task requires a non-empty prompt']);
        }

        if (task.prompt.length > this.config.maxPromptLength) {
            throw new TaskValidationError(task.id, [`Prompt exceeds maximum length of ${this.config.maxPromptLength} characters`]);
        }

        // Use the running project's path as the working directory
        const projectPath = task.projectPath || runningProject.path;

        this.emit('started', { 
            task, 
            projectName: runningProject.name,
            projectPath,
            connectPort: runningProject.connectPort,
            switchboardPort: runningProject.switchboardPort
        });

        try {
            // Create a CLI task to run claude command
            const cliTask: CLITask = createCLITask({
                title: task.title,
                instructions: task.instructions || 'Execute Claude Code command in Powerhouse project',
                command: this.config.claudeCommand,
                args: this.buildClaudeArgs(task),
                workingDirectory: projectPath,
                environment: {
                    // Add any Claude-specific environment variables here
                }
            });

            // Execute the claude command
            const result: CLIExecutorResult = await this.cliExecutor.execute(cliTask);

            const completedAt = new Date();
            const duration = completedAt.getTime() - startedAt.getTime();

            if (result.exitCode === 0) {
                this.emit('completed', { task, result });
                
                return {
                    success: true,
                    output: result.stdout,
                    projectName: runningProject.name,
                    projectPath,
                    startedAt,
                    completedAt,
                    duration
                };
            } else {
                const error = result.stderr || result.stdout || 'Claude command failed';
                this.emit('error', { task, error });
                
                return {
                    success: false,
                    error,
                    output: result.stdout,
                    projectName: runningProject.name,
                    projectPath,
                    startedAt,
                    completedAt,
                    duration
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emit('error', { task, error: errorMessage });
            
            const completedAt = new Date();
            
            return {
                success: false,
                error: `Failed to execute Claude Code task: ${errorMessage}`,
                projectName: runningProject.name,
                projectPath,
                startedAt,
                completedAt,
                duration: completedAt.getTime() - startedAt.getTime()
            };
        }
    }

    /**
     * Build command arguments for claude CLI
     */
    private buildClaudeArgs(task: ClaudeCodeTask): string[] {
        const args: string[] = [];

        // Add the prompt as the main argument
        // Note: This assumes claude CLI accepts the prompt directly
        // Adjust based on actual claude CLI interface
        args.push(task.prompt);

        // Add any additional flags
        if (task.additionalFlags) {
            args.push(...task.additionalFlags);
        }

        return args;
    }

    /**
     * Get the current running project info
     */
    getRunningProject() {
        return this.projectsManager.getRunningProject();
    }

    /**
     * Check if a project is currently running
     */
    hasRunningProject(): boolean {
        return this.projectsManager.getRunningProject() !== null;
    }
}
/**
 * ReactorPackagesManager Tool Definitions
 * MCP tools for managing Powerhouse projects through the Claude Agent SDK
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { ReactorPackagesManager, RunProjectOptions } from '../agents/ReactorPackageDevAgent/ReactorPackagesManager.js';
import type { ILogger } from '../agents/AgentBase/AgentBase.js';
import { AgentsManager } from '../agents/AgentsManager.js';
import { ReactorPackageDevAgent } from '../agents/ReactorPackageDevAgent/ReactorPackageDevAgent.js';

/**
 * Create the init_project tool
 */
export function createInitProjectTool(manager: ReactorPackagesManager, logger?: ILogger) {
    return tool(
        'init_project',
        'Initialize a new Powerhouse project with the specified name',
        {
            projectName: z.string()
                .regex(/^[a-zA-Z0-9-_]+$/)
                .describe('Project name (alphanumeric, hyphens, underscores)')
        },
        async (args) => {
            try {
                logger?.info(`Initializing project: ${args.projectName}`);
                const result = await manager.init(args.projectName);

                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: result.success,
                            projectPath: result.projectPath,
                            message: `Project ${args.projectName} initialized successfully`
                        }, null, 2)
                    }]
                };
            } catch (error) {
                logger?.error(`Failed to initialize project: ${error}`);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }]
                };
            }
        }
    );
}

/**
 * Create the list_projects tool
 */
export function createListProjectsTool(manager: ReactorPackagesManager, logger?: ILogger) {
    return tool(
        'list_projects',
        'List all available Powerhouse projects and their status',
        {},
        async () => {
            try {
                logger?.info('Listing projects');
                const projects = await manager.listProjects();
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            projects: projects,
                            count: projects.length
                        }, null, 2)
                    }]
                };
            } catch (error) {
                logger?.error(`Failed to list projects: ${error}`);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }]
                };
            }
        }
    );
}

/**
 * Create the run_project tool
 */
export function createRunProjectTool(manager: ReactorPackagesManager, agent: ReactorPackageDevAgent, logger?: ILogger) {
    return tool(
        'run_project',
        'Run a Powerhouse project with optional custom ports',
        {
            projectName: z.string()
                .describe('Name of the project to run'),
            apiPort: z.number()
                .optional()
                .describe('Custom API port (default: auto-assigned)'),
            appPort: z.number()
                .optional()
                .describe('Custom app port (default: auto-assigned)')
        },
        async (args) => {
            try {
                logger?.info(`Running project: ${args.projectName}`);
                
                // Build options if ports are provided
                const options: RunProjectOptions | undefined = (args.apiPort || args.appPort) ? {
                    connectPort: args.apiPort || 3000,
                    switchboardPort: args.appPort || 4001,
                    startupTimeout: 60000
                } : undefined;
                
                const result = await manager.runProject(args.projectName, options);

                if (result.mcpServer) {
                    console.log("MCP Server", result.mcpServer);
                    agent.addMcpEndpoint(`active-project-vetra`, result.mcpServer);
                }

                if (result.projectPath) {
                    console.log("Setting agent work dir to project path", result.projectPath);
                    agent.setWorkDir(result.projectPath);
                } else {
                    console.warn("No project path received after project start");
                }
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: result.success,
                            projectName: result.projectName,
                            connectPort: result.connectPort,
                            switchboardPort: result.switchboardPort,
                            driveUrl: result.driveUrl,
                            mcpServer: result.mcpServer,
                            message: `Project ${args.projectName} started successfully`
                        }, null, 2)
                    }]
                };
            } catch (error) {
                logger?.error(`Failed to run project: ${error}`);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }]
                };
            }
        }
    );
}

/**
 * Create the shutdown_project tool
 */
export function createShutdownProjectTool(manager: ReactorPackagesManager, agent:ReactorPackageDevAgent, logger?: ILogger) {
    return tool(
        'shutdown_project',
        'Shutdown a running Powerhouse project',
        {
            projectName: z.string()
                .describe('Name of the project to shutdown')
        },
        async (args) => {
            try {
                logger?.info(`Shutting down project: ${args.projectName}`);
                // Note: shutdownProject doesn't take arguments, it shuts down the currently running project
                agent.removeMcpEndpoint('active-project-vetra');
                const result = await manager.shutdownProject();
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: result.success,
                            message: result.error || `Project ${args.projectName} shut down successfully`
                        }, null, 2)
                    }]
                };
            } catch (error) {
                logger?.error(`Failed to shutdown project: ${error}`);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }]
                };
            }
        }
    );
}

/**
 * Create the get_project_logs tool
 */
export function createGetProjectLogsTool(manager: ReactorPackagesManager, logger?: ILogger) {
    return tool(
        'get_project_logs',
        'Get recent logs from a running Powerhouse project',
        {
            projectName: z.string()
                .describe('Name of the project to get logs from'),
            lines: z.number()
                .optional()
                .describe('Number of log lines to retrieve (default: 100)')
        },
        async (args) => {
            try {
                logger?.info(`Getting logs for project: ${args.projectName}`);
                // Note: getProjectLogs doesn't take arguments, it gets logs for the currently running project
                const logs = manager.getProjectLogs() || [];
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: true,
                            project: args.projectName,
                            logs: logs
                        }, null, 2)
                    }]
                };
            } catch (error) {
                logger?.error(`Failed to get project logs: ${error}`);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }]
                };
            }
        }
    );
}

/**
 * Create the get_project_status tool
 */
export function createGetProjectStatusTool(manager: ReactorPackagesManager, logger?: ILogger) {
    return tool(
        'get_project_status',
        'Get the current status of a Powerhouse project',
        {
            projectName: z.string()
                .describe('Name of the project to check status')
        },
        async (args) => {
            try {
                logger?.info(`Getting status for project: ${args.projectName}`);
                // Get the running project details
                const runningProject = manager.getRunningProject();
                const status = runningProject ? {
                    running: true,
                    name: runningProject.name,
                    connectPort: runningProject.connectPort,
                    switchboardPort: runningProject.switchboardPort,
                    driveUrl: runningProject.driveUrl,
                    mcpServer: runningProject.mcpServer,
                    isFullyStarted: runningProject.isFullyStarted,
                    startedAt: runningProject.startedAt
                } : {
                    running: false,
                    message: `Project ${args.projectName} is not running`
                };
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: true,
                            project: args.projectName,
                            status: status
                        }, null, 2)
                    }]
                };
            } catch (error) {
                logger?.error(`Failed to get project status: ${error}`);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }]
                };
            }
        }
    );
}

/**
 * Create the is_project_ready tool
 */
export function createIsProjectReadyTool(manager: ReactorPackagesManager, logger?: ILogger) {
    return tool(
        'is_project_ready',
        'Check if a Powerhouse project is fully ready for use',
        {
            projectName: z.string()
                .describe('Name of the project to check readiness')
        },
        async (args) => {
            try {
                logger?.info(`Checking readiness for project: ${args.projectName}`);
                // Note: isProjectReady doesn't take arguments, it checks the currently running project
                const isReady = manager.isProjectReady();
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: true,
                            project: args.projectName,
                            isReady: isReady,
                            message: isReady 
                                ? `Project ${args.projectName} is ready`
                                : `Project ${args.projectName} is not ready yet`
                        }, null, 2)
                    }]
                };
            } catch (error) {
                logger?.error(`Failed to check project readiness: ${error}`);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }]
                };
            }
        }
    );
}

/**
 * Create the get_projects_dir tool
 */
export function createGetProjectsDirTool(manager: ReactorPackagesManager, logger?: ILogger) {
    return tool(
        'get_projects_dir',
        'Get the directory path where Powerhouse projects are stored',
        {},
        async () => {
            try {
                logger?.info('Getting projects directory');
                const dir = manager.getProjectsDir();
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: true,
                            projectsDirectory: dir
                        }, null, 2)
                    }]
                };
            } catch (error) {
                logger?.error(`Failed to get projects directory: ${error}`);
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }, null, 2)
                    }]
                };
            }
        }
    );
}
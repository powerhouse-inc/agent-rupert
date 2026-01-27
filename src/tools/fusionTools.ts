/**
 * Fusion Projects Tools
 * MCP tools for managing Fusion front-end projects
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { FusionProjectsManager, RunFusionProjectOptions } from '../agents/ReactorPackageDevAgent/FusionProjectsManager.js';
import type { ILogger } from '../agents/AgentBase/AgentBase.js';

/**
 * Create a tool for initializing Fusion projects
 */
export function createInitFusionProjectTool(manager: FusionProjectsManager, logger?: ILogger) {
    return tool(
        'init_fusion_project',
        'Initialize a new Fusion front-end project with the specified name',
        {
            projectName: z.string()
                .regex(/^[a-zA-Z0-9-_]+$/)
                .describe('Name of the Fusion project to create (alphanumeric, hyphens, underscores only)')
        },
        async ({ projectName }) => {
            try {
                logger?.info(`Initializing Fusion project: ${projectName}`);
                const result = await manager.init(projectName);
                
                if (result.success) {
                    logger?.info(`Successfully initialized Fusion project: ${projectName} at ${result.projectPath}`);
                    return {
                        success: true,
                        message: `Fusion project '${projectName}' initialized successfully`,
                        projectPath: result.projectPath
                    };
                } else {
                    logger?.warn(`Failed to initialize Fusion project: ${result.error}`);
                    return {
                        success: false,
                        error: result.error || 'Failed to initialize project'
                    };
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger?.error(`Error initializing Fusion project: ${errorMessage}`);
                return {
                    success: false,
                    error: `Unexpected error: ${errorMessage}`
                };
            }
        }
    );
}

/**
 * Create a tool for listing Fusion projects
 */
export function createListFusionProjectsTool(manager: FusionProjectsManager, logger?: ILogger) {
    return tool(
        'list_fusion_projects',
        'List all available Fusion projects and their status',
        {},
        async () => {
            try {
                logger?.info('Listing Fusion projects');
                const projects = await manager.listProjects();
                const runningProject = manager.getRunningProject();
                
                const projectList = projects.map(project => ({
                    name: project.name,
                    path: project.path,
                    fusionPort: runningProject?.fusionPort,
                    switchboardUrl: runningProject?.switchboardUrl,
                    isRunning: runningProject?.name === project.name,
                    status: runningProject?.name === project.name ? 'running' : 'stopped'
                }));
                
                logger?.info(`Found ${projects.length} Fusion projects`);
                
                return {
                    success: true,
                    projects: projectList,
                    projectsDirectory: manager.getProjectsDir(),
                    runningProject: runningProject ? {
                        name: runningProject.name,
                        fusionPort: runningProject.fusionPort,
                        switchboardUrl: runningProject.switchboardUrl,
                        startedAt: runningProject.startedAt,
                        isReady: runningProject.isFullyStarted
                    } : null
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger?.error(`Error listing Fusion projects: ${errorMessage}`);
                return {
                    success: false,
                    error: `Failed to list projects: ${errorMessage}`
                };
            }
        }
    );
}

/**
 * Create a tool for running a Fusion project
 */
export function createRunFusionProjectTool(manager: FusionProjectsManager, logger?: ILogger) {
    return tool(
        'run_fusion_project',
        'Run a Fusion project with the development server',
        {
            projectName: z.string().describe('Name of the Fusion project to run'),
            switchboardUrl: z.string()
                .describe('URL of the Switchboard instance to use for backend, e.d. http://localhost:4001/graphql'),
            fusionPort: z.number()
                .int()
                .min(1024)
                .max(65535)
                .optional()
                .describe('Port for the Fusion front-end (default: 8000)'),
            startupTimeout: z.number()
                .int()
                .min(5000)
                .max(300000)
                .optional()
                .describe('Timeout in milliseconds to wait for Fusion to start (default: 60000)')
        },
        async ({ projectName, switchboardUrl, fusionPort, startupTimeout }) => {
            try {
                // Check if a project is already running
                const currentProject = manager.getRunningProject();
                if (currentProject) {
                    logger?.warn(`Cannot run project: ${currentProject.name} is already running`);
                    return {
                        success: false,
                        error: `Project '${currentProject.name}' is already running on port ${currentProject.fusionPort}. Please shutdown the current project first.`
                    };
                }
                
                logger?.info(`Starting Fusion project: ${projectName}`);
                
                // Build options if any were provided
                const options: Partial<RunFusionProjectOptions> = {};
                if (fusionPort !== undefined) options.fusionPort = fusionPort;
                if (switchboardUrl !== undefined) options.switchboardUrl = switchboardUrl;
                if (startupTimeout !== undefined) options.startupTimeout = startupTimeout;
                
                const result = await manager.runProject(
                    projectName, 
                    Object.keys(options).length > 0 ? options as RunFusionProjectOptions : undefined
                );
                
                if (result.success) {
                    logger?.info(`Successfully started Fusion project: ${projectName} on port ${result.fusionPort} with Switchboard '${result.switchboardUrl}'`);
                    
                    // Wait a moment for the project to be fully ready
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    const isReady = manager.isProjectReady();
                    
                    return {
                        success: true,
                        message: `Fusion project '${projectName}' is now running`,
                        projectName: result.projectName,
                        projectPath: result.projectPath,
                        fusionPort: result.fusionPort,
                        fusionUrl: `http://localhost:${result.fusionPort}`,
                        switchboardUrl: result.switchboardUrl,
                        isReady,
                        status: isReady ? 'ready' : 'starting'
                    };
                } else {
                    logger?.warn(`Failed to start Fusion project: ${result.error}`);
                    return {
                        success: false,
                        error: result.error || 'Failed to start project'
                    };
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger?.error(`Error running Fusion project: ${errorMessage}`);
                return {
                    success: false,
                    error: `Unexpected error: ${errorMessage}`
                };
            }
        }
    );
}

/**
 * Create a tool for shutting down the running Fusion project
 */
export function createShutdownFusionProjectTool(manager: FusionProjectsManager, logger?: ILogger) {
    return tool(
        'shutdown_fusion_project',
        'Shutdown the currently running Fusion project',
        {},
        async () => {
            try {
                const runningProject = manager.getRunningProject();
                
                if (!runningProject) {
                    logger?.info('No Fusion project is currently running');
                    return {
                        success: true,
                        message: 'No project was running'
                    };
                }
                
                const projectName = runningProject.name;
                logger?.info(`Shutting down Fusion project: ${projectName}`);
                
                const result = await manager.shutdownProject();
                
                if (result.success) {
                    logger?.info(`Successfully shut down Fusion project: ${projectName}`);
                    return {
                        success: true,
                        message: `Fusion project '${projectName}' has been shut down`
                    };
                } else {
                    logger?.warn(`Failed to shutdown Fusion project: ${result.error}`);
                    return {
                        success: false,
                        error: result.error || 'Failed to shutdown project'
                    };
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger?.error(`Error shutting down Fusion project: ${errorMessage}`);
                return {
                    success: false,
                    error: `Unexpected error: ${errorMessage}`
                };
            }
        }
    );
}

/**
 * Create a tool for getting Fusion project logs
 */
export function createGetFusionProjectLogsTool(manager: FusionProjectsManager, logger?: ILogger) {
    return tool(
        'get_fusion_project_logs',
        'Get the logs from the currently running Fusion project',
        {
            limit: z.number()
                .int()
                .min(1)
                .max(500)
                .optional()
                .describe('Maximum number of log lines to return (default: 50)')
        },
        async ({ limit = 50 }) => {
            try {
                const runningProject = manager.getRunningProject();
                
                if (!runningProject) {
                    return {
                        success: false,
                        error: 'No Fusion project is currently running'
                    };
                }
                
                const logs = manager.getProjectLogs() || [];
                const recentLogs = logs.slice(-limit);
                
                logger?.info(`Retrieved ${recentLogs.length} log lines for project: ${runningProject.name}`);
                
                return {
                    success: true,
                    projectName: runningProject.name,
                    logs: recentLogs,
                    totalLogs: logs.length,
                    isReady: runningProject.isFullyStarted
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger?.error(`Error getting Fusion project logs: ${errorMessage}`);
                return {
                    success: false,
                    error: `Failed to get logs: ${errorMessage}`
                };
            }
        }
    );
}

/**
 * Create a tool for getting Fusion project status
 */
export function createGetFusionProjectStatusTool(manager: FusionProjectsManager, logger?: ILogger) {
    return tool(
        'get_fusion_project_status',
        'Get the status of the currently running Fusion project',
        {},
        async () => {
            try {
                const runningProject = manager.getRunningProject();
                
                if (!runningProject) {
                    return {
                        success: true,
                        status: 'stopped',
                        message: 'No Fusion project is currently running'
                    };
                }
                
                const isReady = manager.isProjectReady();
                const logs = manager.getProjectLogs() || [];
                
                logger?.info(`Fusion project status: ${runningProject.name} - ${isReady ? 'ready' : 'starting'}`);
                
                return {
                    success: true,
                    status: isReady ? 'ready' : 'starting',
                    project: {
                        name: runningProject.name,
                        path: runningProject.path,
                        fusionPort: runningProject.fusionPort,
                        fusionUrl: `http://localhost:${runningProject.fusionPort}`,
                        startedAt: runningProject.startedAt,
                        isReady,
                        logCount: logs.length
                    }
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger?.error(`Error getting Fusion project status: ${errorMessage}`);
                return {
                    success: false,
                    error: `Failed to get status: ${errorMessage}`
                };
            }
        }
    );
}

/**
 * Create a tool for checking if Fusion project is ready
 */
export function createIsFusionProjectReadyTool(manager: FusionProjectsManager, logger?: ILogger) {
    return tool(
        'is_fusion_project_ready',
        'Check if the running Fusion project is fully started and ready',
        {},
        async () => {
            try {
                const runningProject = manager.getRunningProject();
                
                if (!runningProject) {
                    return {
                        success: true,
                        isReady: false,
                        message: 'No Fusion project is currently running'
                    };
                }
                
                const isReady = manager.isProjectReady();
                
                logger?.info(`Fusion project ${runningProject.name} ready status: ${isReady}`);
                
                return {
                    success: true,
                    isReady,
                    projectName: runningProject.name,
                    message: isReady 
                        ? `Fusion project '${runningProject.name}' is ready` 
                        : `Fusion project '${runningProject.name}' is still starting up`
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger?.error(`Error checking Fusion project readiness: ${errorMessage}`);
                return {
                    success: false,
                    error: `Failed to check readiness: ${errorMessage}`
                };
            }
        }
    );
}

/**
 * Create a tool for getting the Fusion projects directory
 */
export function createGetFusionProjectsDirTool(manager: FusionProjectsManager, logger?: ILogger) {
    return tool(
        'get_fusion_projects_dir',
        'Get the directory path where Fusion projects are stored',
        {},
        async () => {
            try {
                const projectsDir = manager.getProjectsDir();
                logger?.info(`Fusion projects directory: ${projectsDir}`);
                
                return {
                    success: true,
                    projectsDir
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger?.error(`Error getting Fusion projects directory: ${errorMessage}`);
                return {
                    success: false,
                    error: `Failed to get projects directory: ${errorMessage}`
                };
            }
        }
    );
}
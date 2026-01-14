/**
 * ReactorPackagesManager MCP Server Factory
 * Creates an MCP server that exposes ReactorPackagesManager functionality
 */

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { ReactorPackagesManager } from '../agents/ReactorPackageDevAgent/ReactorPackagesManager.js';
import type { ILogger } from '../agents/AgentBase.js';
import {
    createInitProjectTool,
    createListProjectsTool,
    createRunProjectTool,
    createShutdownProjectTool,
    createGetProjectLogsTool,
    createGetProjectStatusTool,
    createIsProjectReadyTool,
    createGetProjectsDirTool
} from './reactorPackagesTools.js';

/**
 * Create an MCP server for ReactorPackagesManager
 * Server name will be 'reactor_prjmgr' resulting in tool names like:
 * - mcp__reactor_prjmgr__init_project
 * - mcp__reactor_prjmgr__list_projects
 * - mcp__reactor_prjmgr__run_project
 * etc.
 */
export function createReactorProjectsManagerMcpServer(
    manager: ReactorPackagesManager,
    logger?: ILogger
) {
    logger?.info('Creating ReactorProjectsManager MCP server');
    
    // Create all tools with the manager instance
    const tools = [
        createInitProjectTool(manager, logger),
        createListProjectsTool(manager, logger),
        createRunProjectTool(manager, logger),
        createShutdownProjectTool(manager, logger),
        createGetProjectLogsTool(manager, logger),
        createGetProjectStatusTool(manager, logger),
        createIsProjectReadyTool(manager, logger),
        createGetProjectsDirTool(manager, logger)
    ];
    
    logger?.info(`Registered ${tools.length} tools for ReactorProjectsManager MCP server`);
    
    // Create and return the MCP server
    return createSdkMcpServer({
        name: 'reactor_prjmgr',
        version: '1.0.0',
        tools: tools
    });
}

/**
 * Get the list of allowed tool names for this MCP server
 * Useful for configuring AgentClaudeBrain's allowedTools
 */
export function getReactorMcpToolNames(): string[] {
    return [
        'mcp__reactor_prjmgr__init_project',
        'mcp__reactor_prjmgr__list_projects',
        'mcp__reactor_prjmgr__run_project',
        'mcp__reactor_prjmgr__shutdown_project',
        'mcp__reactor_prjmgr__get_project_logs',
        'mcp__reactor_prjmgr__get_project_status',
        'mcp__reactor_prjmgr__is_project_ready',
        'mcp__reactor_prjmgr__get_projects_dir'
    ];
}
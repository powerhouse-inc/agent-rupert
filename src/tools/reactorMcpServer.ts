/**
 * ReactorPackagesManager MCP Server Factory
 * Creates an MCP server that exposes ReactorPackagesManager functionality
 */

import { createSdkMcpServer, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { ReactorPackagesManager } from '../agents/ReactorPackageDevAgent/ReactorPackagesManager.js';
import type { ILogger } from '../agents/AgentBase/AgentBase.js';
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
import { ReactorPackageDevAgent } from '../agents/ReactorPackageDevAgent/ReactorPackageDevAgent.js';

/**
 * Create an MCP server for ReactorPackagesManager
 * Server name will be 'reactor-prjmgr' resulting in tool names like:
 * - mcp__reactor-prjmgr__init_project
 * - mcp__reactor-prjmgr__list_projects
 * - mcp__reactor-prjmgr__run_project
 * etc.
 * @returns McpSdkServerConfigWithInstance - ready to use with addMcpServer
 */
export function createReactorProjectsManagerMcpServer(
    manager: ReactorPackagesManager,
    agent: ReactorPackageDevAgent,
    logger?: ILogger
): McpServerConfig {
    logger?.info('Creating ReactorProjectsManager MCP server');
    
    // Create all tools with the manager instance
    const tools = [
        createInitProjectTool(manager, logger),
        createListProjectsTool(manager, logger),
        createRunProjectTool(manager, agent, logger),
        createShutdownProjectTool(manager, agent, logger),
        createGetProjectLogsTool(manager, logger),
        createGetProjectStatusTool(manager, logger),
        createIsProjectReadyTool(manager, logger),
        createGetProjectsDirTool(manager, logger)
    ];
    
    logger?.info(`Registered ${tools.length} tools for ReactorProjectsManager MCP server`);
    
    // Create and return the MCP server
    const server = createSdkMcpServer({
        name: 'reactor-prjmgr',
        version: '1.0.0',
        tools: tools
    });
    
    return server;
}

/**
 * Get the list of allowed tool names for this MCP server
 * Useful for configuring AgentClaudeBrain's allowedTools
 */
export function getReactorMcpToolNames(): string[] {
    return [
        'mcp__reactor-prjmgr__init_project',
        'mcp__reactor-prjmgr__list_projects',
        'mcp__reactor-prjmgr__run_project',
        'mcp__reactor-prjmgr__shutdown_project',
        'mcp__reactor-prjmgr__get_project_logs',
        'mcp__reactor-prjmgr__get_project_status',
        'mcp__reactor-prjmgr__is_project_ready',
        'mcp__reactor-prjmgr__get_projects_dir'
    ];
}
/**
 * FusionProjectsManager MCP Server Factory
 * Creates an MCP server that exposes FusionProjectsManager functionality
 */

import { createSdkMcpServer, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { FusionProjectsManager } from '../agents/ReactorPackageDevAgent/FusionProjectsManager.js';
import type { ILogger } from '../agents/AgentBase/AgentBase.js';
import {
    createInitFusionProjectTool,
    createListFusionProjectsTool,
    createRunFusionProjectTool,
    createShutdownFusionProjectTool,
    createGetFusionProjectLogsTool,
    createGetFusionProjectStatusTool,
    createIsFusionProjectReadyTool,
    createGetFusionProjectsDirTool
} from './fusionTools.js';

/**
 * Create an MCP server for FusionProjectsManager
 * Server name will be 'fusion-prjmgr' resulting in tool names like:
 * - mcp__fusion-prjmgr__init_fusion_project
 * - mcp__fusion-prjmgr__list_fusion_projects
 * - mcp__fusion-prjmgr__run_fusion_project
 * etc.
 * @returns McpServerConfig - ready to use with addMcpServer
 */
export function createFusionProjectsManagerMcpServer(
    manager: FusionProjectsManager,
    logger?: ILogger
): McpServerConfig {
    logger?.info('Creating FusionProjectsManager MCP server');
    
    // Create all tools with the manager instance
    const tools = [
        createInitFusionProjectTool(manager, logger),
        createListFusionProjectsTool(manager, logger),
        createRunFusionProjectTool(manager, logger),
        createShutdownFusionProjectTool(manager, logger),
        createGetFusionProjectLogsTool(manager, logger),
        createGetFusionProjectStatusTool(manager, logger),
        createIsFusionProjectReadyTool(manager, logger),
        createGetFusionProjectsDirTool(manager, logger)
    ];
    
    logger?.info(`Registered ${tools.length} tools for FusionProjectsManager MCP server`);
    
    // Create and return the MCP server
    const server = createSdkMcpServer({
        name: 'fusion-prjmgr',
        version: '1.0.0',
        tools: tools
    });
    
    return server;
}

/**
 * Get the list of allowed tool names for this MCP server
 * Useful for configuring AgentClaudeBrain's allowedTools
 */
export function getFusionMcpToolNames(): string[] {
    return [
        'mcp__fusion-prjmgr__init_fusion_project',
        'mcp__fusion-prjmgr__list_fusion_projects',
        'mcp__fusion-prjmgr__run_fusion_project',
        'mcp__fusion-prjmgr__shutdown_fusion_project',
        'mcp__fusion-prjmgr__get_fusion_project_logs',
        'mcp__fusion-prjmgr__get_fusion_project_status',
        'mcp__fusion-prjmgr__is_fusion_project_ready',
        'mcp__fusion-prjmgr__get_fusion_projects_dir'
    ];
}
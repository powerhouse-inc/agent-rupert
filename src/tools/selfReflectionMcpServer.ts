import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { AgentBase } from '../agents/AgentBase/AgentBase.js';
import type { ILogger } from '../agents/AgentBase/AgentBase.js';
import {
    createListSkillsTool,
    createGetSkillDetailsTool,
    createGetScenarioDetailsTool,
    createSearchScenariosTool,
    createGetInboxStateTool,
    createGetWbsStateTool,
    createListMcpEndpointsTool
} from './selfReflectionTools.js';

export function createSelfReflectionMcpServer(
    agent: AgentBase,
    logger?: ILogger
) {
    logger?.info('Creating SelfReflection MCP server');
    
    const tools = [
        createListSkillsTool(agent, logger),
        createGetSkillDetailsTool(agent, logger),
        createGetScenarioDetailsTool(agent, logger),
        createSearchScenariosTool(agent, logger),
        createGetInboxStateTool(agent, logger),
        createGetWbsStateTool(agent, logger),
        createListMcpEndpointsTool(agent, logger)
    ];
    
    const server = createSdkMcpServer({
        name: 'self_reflection',
        version: '1.0.0',
        tools: tools
    });
    
    return server;
}

export function getSelfReflectionMcpToolNames(): string[] {
    return [
        'mcp__self_reflection__list_skills',
        'mcp__self_reflection__get_skill_details',
        'mcp__self_reflection__get_scenario_details',
        'mcp__self_reflection__search_scenarios',
        'mcp__self_reflection__get_inbox_state',
        'mcp__self_reflection__get_wbs_state',
        'mcp__self_reflection__list_mcp_endpoints'
    ];
}
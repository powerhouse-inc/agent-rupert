import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentBase } from '../agents/AgentBase/AgentBase.js';
import type { ILogger } from '../agents/AgentBase/AgentBase.js';

export function createListSkillsTool(agent: AgentBase, logger?: ILogger) {
    return tool(
        'list_skills',
        'List all skills available to this agent',
        {},
        async () => {
            try {
                const skills = agent.getSkills();
                const skillSummaries = skills.map(s => ({
                    name: s.name,
                    scenario_count: s.scenarios.length
                }));
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            skills: skillSummaries,
                            total_skills: skills.length
                        }, null, 2)
                    }]
                };
            } catch (error) {
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

export function createGetSkillDetailsTool(agent: AgentBase, logger?: ILogger) {
    return tool(
        'get_skill_details',
        'Get detailed information about a specific skill',
        {
            skill_name: z.string().describe('Name of the skill to inspect')
        },
        async (args) => {
            try {
                const skill = agent.getSkillDetails(args.skill_name);
                if (!skill) {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: JSON.stringify({
                                success: false,
                                error: `Skill '${args.skill_name}' not found`
                            }, null, 2)
                        }]
                    };
                }
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            name: skill.name,
                            scenarios: skill.scenarios.map(s => ({
                                id: s.id,
                                title: s.title,
                                task_count: s.tasks.length
                            }))
                        }, null, 2)
                    }]
                };
            } catch (error) {
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

export function createGetScenarioDetailsTool(agent: AgentBase, logger?: ILogger) {
    return tool(
        'get_scenario_details',
        'Get full scenario including all tasks',
        {
            skill_name: z.string().describe('Name of the skill containing the scenario'),
            scenario_id: z.string().describe('ID of the scenario to retrieve')
        },
        async (args) => {
            try {
                const scenario = agent.getScenarioDetails(args.skill_name, args.scenario_id);
                if (!scenario) {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: JSON.stringify({
                                success: false,
                                error: `Scenario '${args.scenario_id}' not found in skill '${args.skill_name}'`
                            }, null, 2)
                        }]
                    };
                }
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify(scenario, null, 2)
                    }]
                };
            } catch (error) {
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

export function createSearchScenariosTool(agent: AgentBase, logger?: ILogger) {
    return tool(
        'search_scenarios',
        'Search for scenarios by keyword',
        {
            query: z.string().describe('Keyword or phrase to search for'),
            skill_name: z.string().optional().describe('Optional: limit search to specific skill')
        },
        async (args) => {
            try {
                const results = agent.searchScenarios(args.query, args.skill_name);
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            matches: results.map(r => ({
                                skill: r.skill,
                                scenario_id: r.scenario.id,
                                title: r.scenario.title,
                                match_context: r.matchContext
                            })),
                            total_matches: results.length
                        }, null, 2)
                    }]
                };
            } catch (error) {
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

export function createGetInboxStateTool(agent: AgentBase, logger?: ILogger) {
    return tool(
        'get_inbox_state',
        'Get the complete inbox document state as JSON',
        {},
        async () => {
            try {
                const state = await agent.getInboxState();
                
                if (!state) {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: JSON.stringify({
                                success: false,
                                error: 'No inbox document found or configured'
                            }, null, 2)
                        }]
                    };
                }
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify(state, null, 2)
                    }]
                };
            } catch (error) {
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

export function createGetWbsStateTool(agent: AgentBase, logger?: ILogger) {
    return tool(
        'get_wbs_state',
        'Get the complete WBS document state as JSON',
        {},
        async () => {
            try {
                const state = await agent.getWbsState();
                
                if (!state) {
                    return {
                        content: [{
                            type: 'text' as const,
                            text: JSON.stringify({
                                success: false,
                                error: 'No WBS document found or configured'
                            }, null, 2)
                        }]
                    };
                }
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify(state, null, 2)
                    }]
                };
            } catch (error) {
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

export function createListMcpEndpointsTool(agent: AgentBase, logger?: ILogger) {
    return tool(
        'list_mcp_endpoints',
        'List all registered MCP endpoints',
        {},
        async () => {
            try {
                const endpoints = agent.listMcpEndpoints();
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            endpoints,
                            total_endpoints: endpoints.length
                        }, null, 2)
                    }]
                };
            } catch (error) {
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
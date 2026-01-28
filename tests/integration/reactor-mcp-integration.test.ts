/**
 * Integration test for ReactorPackageDevAgent MCP server
 * Tests that the agent can receive messages and use ReactorProjectsManager tools via MCP
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ReactorPackageDevAgent } from '../../src/agents/ReactorPackageDevAgent/ReactorPackageDevAgent.js';
import { AgentClaudeBrain } from '../../src/agents/AgentClaudeBrain.js';
import type { ILogger } from '../../src/agents/AgentBase.js';
import type { ReactorPackageDevAgentConfig } from '../../src/types.js';
import path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Helper function to extract JSON from markdown code blocks or raw JSON
function extractJSON(response: string): any {
    // Try to parse as raw JSON first
    try {
        return JSON.parse(response);
    } catch (e) {
        // If that fails, try to extract from markdown code block
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            return JSON.parse(jsonMatch[1]);
        }
        // If still no match, throw the original error
        throw new Error(`Failed to parse JSON from response: ${response}`);
    }
}

describe('ReactorPackageDevAgent MCP Integration', () => {
    let agent: ReactorPackageDevAgent;
    let brain: AgentClaudeBrain;
    let testProjectsDir: string;
    let logger: ILogger;
    
    beforeEach(async () => {
        // Skip if no API key
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        
        // Create a simple logger
        logger = {
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {}
        };
        
        // Use the actual test-projects directory where persistent-test-project exists
        testProjectsDir = path.join(process.cwd(), '..', 'test-projects');
        
        // Create agent configuration
        const config: ReactorPackageDevAgentConfig = {
            name: 'test-reactor-agent',
            reactorPackages: {
                projectsDir: testProjectsDir,
                defaultProjectName: 'test-project',
                autoStartDefaultProject: false
            },
            vetraConfig: {
                connectPort: 3000,
                switchboardPort: 4001,
                startupTimeout: 60000
            },
            workDrive: {
                reactorStorage: {
                    type: 'memory'  // Use memory storage for tests
                },
                driveUrl: null,  // Not connecting to a remote drive
                documents: {
                    inbox: {
                        documentType: 'inbox',
                        documentId: 'test-inbox'
                    },
                    wbs: {
                        documentType: 'wbs',
                        documentId: 'test-wbs'
                    }
                }
            }
        };
        
        // Create a real brain with the Claude SDK
        brain = new AgentClaudeBrain({
            apiKey: process.env.ANTHROPIC_API_KEY,
            workingDirectory: path.join(testProjectsDir, 'workspace'),
            model: 'haiku',
            maxTurns: 5,
            bypassPermissions: true,  // Bypass permissions for testing
            allowedTools: [
                'mcp__reactor-prjmgr__init_project',
                'mcp__reactor-prjmgr__list_projects',
                'mcp__reactor-prjmgr__run_project',
                'mcp__reactor-prjmgr__shutdown_project',
                'mcp__reactor-prjmgr__get_project_logs',
                'mcp__reactor-prjmgr__get_project_status',
                'mcp__reactor-prjmgr__is_project_ready',
                'mcp__reactor-prjmgr__get_projects_dir',
                'mcp__self_reflection__list_skills',
                'mcp__self_reflection__get_skill_details',
                'mcp__self_reflection__list_mcp_endpoints'
            ]
        });
        
        // Create the agent with the real brain
        agent = new ReactorPackageDevAgent(config, logger, brain);
    });
    
    afterEach(async () => {
        // Cleanup
        if (agent) {
            await agent.shutdown();
        }
        
        if (brain) {
            await brain.cleanup();
        }
    });
    
    test('should initialize agent and register MCP server with brain', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        
        // Initialize the agent
        await agent.initialize();
        
        // Verify the agent initialized successfully
        expect(agent.getPackagesManager()).toBeDefined();
        
        // Verify that the MCP server was added to the brain
        const servers = brain.listMcpServers();
        expect(servers).toContain('reactor-prjmgr');
    });
    
    test('should respond to request to list projects using MCP tools', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        
        await agent.initialize();
        
        // Set a system prompt for the brain
        brain.setSystemPrompt(
            'You are a helpful assistant with access to ReactorProjectsManager tools via MCP. ' +
            'Always respond with valid JSON following the exact template provided. ' +
            'Use the mcp__reactor-prjmgr__list_projects tool when asked about projects.',
            'test-agent'
        );
        
        // Send a message to the brain asking it to list projects
        const result = await brain.sendMessage(
            'Use the list_projects MCP tool. Return response in this format:\n\n' +
            '```json\n' +
            '{\n' +
            '  "projects": [<project-names>],\n' +
            '  "count": <number>\n' +
            '}\n' +
            '```\n\n' +
            'Important: Return the raw, valid JSON only. Validate the JSON syntax before replying.'
        );
        
        // Parse and verify the JSON response
        expect(result.response).toBeDefined();
        const jsonResponse = extractJSON(result.response);
        expect(jsonResponse).toHaveProperty('projects');
        expect(Array.isArray(jsonResponse.projects)).toBe(true);
        // Projects array contains either strings or objects with name property
        const hasProject = jsonResponse.projects.some((p: any) => 
            typeof p === 'string' ? p === 'persistent-test-project' : p.name === 'persistent-test-project'
        );
        expect(hasProject).toBe(true);
    }, 30000);  // Increase timeout for API calls
    
    test('should respond to request for projects directory using MCP tools', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        
        await agent.initialize();
        
        // Set a system prompt for the brain
        brain.setSystemPrompt(
            'You are a helpful assistant with access to ReactorProjectsManager tools via MCP. ' +
            'Always respond with valid JSON following the exact template provided. ' +
            'Use the mcp__reactor-prjmgr__get_projects_dir tool when asked about the projects directory.',
            'test-agent'
        );
        
        // Send a message asking for the projects directory
        const result = await brain.sendMessage(
            'Use the get_projects_dir MCP tool. Return response in this format:\n\n' +
            '```json\n' +
            '{\n' +
            '  "directory": "<path>",\n' +
            '  "exists": <boolean>\n' +
            '}\n' +
            '```\n\n' +
            'Important: Return the raw, valid JSON only. Validate the JSON syntax before replying.'
        );
        
        // Parse and verify the JSON response
        expect(result.response).toBeDefined();
        const jsonResponse = extractJSON(result.response);
        expect(jsonResponse).toHaveProperty('directory');
        expect(typeof jsonResponse.directory).toBe('string');
        expect(jsonResponse.directory).toMatch(/test-projects/);
    }, 30000);
    
    test('should respond to request about project readiness using MCP tools', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        
        await agent.initialize();
        
        // Set a system prompt for the brain
        brain.setSystemPrompt(
            'You are a helpful assistant with access to ReactorProjectsManager tools via MCP. ' +
            'Always respond with valid JSON following the exact template provided. ' +
            'Use the mcp__reactor-prjmgr__is_project_ready and mcp__reactor-prjmgr__get_project_status tools.',
            'test-agent'
        );
        
        // Send a message asking about project status
        const result = await brain.sendMessage(
            'Check "persistent-test-project" using MCP tools. Return response in this format:\n\n' +
            '```json\n' +
            '{\n' +
            '  "projectName": "<name>",\n' +
            '  "isReady": <boolean>,\n' +
            '  "status": "<status>"\n' +
            '}\n' +
            '```\n\n' +
            'Important: Return the raw, valid JSON only. Validate the JSON syntax before replying.'
        );
        
        // Parse and verify the JSON response
        expect(result.response).toBeDefined();
        const jsonResponse = extractJSON(result.response);
        expect(jsonResponse).toHaveProperty('projectName');
        expect(jsonResponse).toHaveProperty('isReady');
        expect(jsonResponse).toHaveProperty('status');
        expect(typeof jsonResponse.isReady).toBe('boolean');
        expect(jsonResponse.projectName).toBe('persistent-test-project');
    }, 30000);
    
    test('should have registered all 8 ReactorProjectsManager tools', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        
        await agent.initialize();
        
        // Get the list of MCP servers from the brain
        const servers = brain.listMcpServers();
        expect(servers).toContain('reactor-prjmgr');
        
        // The brain's allowed tools should include all reactor tools
        const brainConfig = (brain as any).config;
        const allowedTools = brainConfig.allowedTools || [];
        
        const expectedTools = [
            'mcp__reactor-prjmgr__init_project',
            'mcp__reactor-prjmgr__list_projects',
            'mcp__reactor-prjmgr__run_project',
            'mcp__reactor-prjmgr__shutdown_project',
            'mcp__reactor-prjmgr__get_project_logs',
            'mcp__reactor-prjmgr__get_project_status',
            'mcp__reactor-prjmgr__is_project_ready',
            'mcp__reactor-prjmgr__get_projects_dir'
        ];
        
        // Check that all expected tools are in the allowed tools
        for (const tool of expectedTools) {
            expect(allowedTools).toContain(tool);
        }
    });
    
    test('should successfully use multiple MCP tools in conversation', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        
        await agent.initialize();
        
        // Set a comprehensive system prompt
        brain.setSystemPrompt(
            'You are a helpful assistant with access to ReactorProjectsManager tools via MCP. ' +
            'Always respond with valid JSON following the exact template provided. ' +
            'You can use tools like mcp__reactor-prjmgr__list_projects, mcp__reactor-prjmgr__get_projects_dir, ' +
            'and mcp__reactor-prjmgr__get_project_status to answer questions.',
            'test-agent'
        );
        
        // Start a conversation that requires multiple tool uses
        let sessionId: string | undefined;
        
        // First message - list projects
        const result1 = await brain.sendMessage(
            'Use list_projects tool. Format:\n```json\n{"projects":[<items>],"count":<n>}\n```\nReturn raw JSON only.',
            sessionId
        );
        sessionId = result1.sessionId;
        expect(result1.response).toBeDefined();
        const json1 = extractJSON(result1.response);
        expect(json1).toHaveProperty('projects');
        expect(json1).toHaveProperty('count');
        expect(json1.count).toBeGreaterThan(0);
        
        // Second message - check directory
        const result2 = await brain.sendMessage(
            'Use get_projects_dir tool. Format:\n```json\n{"directory":"<path>","exists":<bool>}\n```\nReturn raw JSON only.',
            sessionId
        );
        sessionId = result2.sessionId;
        expect(result2.response).toBeDefined();
        const json2 = extractJSON(result2.response);
        expect(json2).toHaveProperty('directory');
        expect(json2).toHaveProperty('exists');
        expect(json2.directory).toMatch(/test-projects/);
        
        // Third message - check status
        const result3 = await brain.sendMessage(
            'Check persistent-test-project status. Format:\n```json\n{"project":"<name>","status":"<status>","running":<bool>}\n```\nReturn raw JSON only.',
            sessionId
        );
        expect(result3.response).toBeDefined();
        const json3 = extractJSON(result3.response);
        expect(json3).toHaveProperty('project');
        expect(json3).toHaveProperty('status');
        expect(json3).toHaveProperty('running');
        expect(json3.project).toBe('persistent-test-project');
    }, 60000);  // Longer timeout for conversation
    
    test('should list agent skills using self-reflection MCP tools', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        
        await agent.initialize();
        
        // Set a system prompt for the brain
        brain.setSystemPrompt(
            'You are a helpful ReactorPackageDevAgent with self-reflection capabilities. ' +
            'You have access to self_reflection MCP tools to introspect your own skills. ' +
            'Always respond with valid JSON following the exact template provided. ' +
            'Use the mcp__self_reflection__list_skills tool when asked about your skills.',
            'test-agent'
        );
        
        // Send a message asking the agent to list its skills
        const result = await brain.sendMessage(
            'Use the self_reflection list_skills MCP tool to tell me what skills you have. Return response in this format:\n\n' +
            '```json\n' +
            '{\n' +
            '  "skills": [<skill-names>],\n' +
            '  "count": <number>\n' +
            '}\n' +
            '```\n\n' +
            'Important: Return the raw, valid JSON only. Include all skill names you have access to.'
        );
        
        // Parse and verify the JSON response
        expect(result.response).toBeDefined();
        const jsonResponse = extractJSON(result.response);
        expect(jsonResponse).toHaveProperty('skills');
        expect(jsonResponse).toHaveProperty('count');
        expect(Array.isArray(jsonResponse.skills)).toBe(true);
        
        // ReactorPackageDevAgent should have these specific skills
        const expectedSkills = ReactorPackageDevAgent.getDefaultSkillNames();
        
        // Check that the agent reported the correct skills
        for (const expectedSkill of expectedSkills) {
            const hasSkill = jsonResponse.skills.some((skill: any) => 
                typeof skill === 'string' ? skill === expectedSkill : skill === expectedSkill
            );
            expect(hasSkill).toBe(true);
        }
        
        // Should have exactly 4 skills
        expect(jsonResponse.count).toBe(expectedSkills.length);
    }, 30000);
    
    test('should get skill details using self-reflection MCP tools', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        
        await agent.initialize();
        
        // Set a system prompt for the brain
        brain.setSystemPrompt(
            'You are a helpful ReactorPackageDevAgent with self-reflection capabilities. ' +
            'You have access to self_reflection MCP tools to introspect your own skills. ' +
            'Always respond with valid JSON following the exact template provided. ' +
            'Use the mcp__self_reflection__get_skill_details tool when asked about specific skills.',
            'test-agent'
        );
        
        // Send a message asking for details about a specific skill
        const result = await brain.sendMessage(
            'Use the self_reflection get_skill_details MCP tool to get details about the "reactor-package-project-management" skill. Return response in this format:\n\n' +
            '```json\n' +
            '{\n' +
            '  "skill_name": "<name>",\n' +
            '  "scenario_count": <number>,\n' +
            '  "scenarios": [<scenario-ids>]\n' +
            '}\n' +
            '```\n\n' +
            'Important: Return the raw, valid JSON only. Include the scenario IDs from the skill.'
        );
        
        // Parse and verify the JSON response
        expect(result.response).toBeDefined();
        const jsonResponse = extractJSON(result.response);
        expect(jsonResponse).toHaveProperty('skill_name');
        expect(jsonResponse).toHaveProperty('scenario_count');
        expect(jsonResponse).toHaveProperty('scenarios');
        
        // Verify the skill details
        expect(jsonResponse.skill_name).toBe('reactor-package-project-management');
        expect(jsonResponse.scenario_count).toBeGreaterThan(0);
        expect(Array.isArray(jsonResponse.scenarios)).toBe(true);
        
        // Check for expected scenarios
        const expectedScenarios = ['RPPM.00', 'RPPM.01', 'RPPM.02'];
        for (const expectedScenario of expectedScenarios) {
            const hasScenario = jsonResponse.scenarios.some((scenario: any) => 
                scenario === expectedScenario || scenario.includes(expectedScenario)
            );
            expect(hasScenario).toBe(true);
        }
    }, 30000);
    
    test('should verify self-reflection MCP server is registered', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        
        await agent.initialize();
        
        // Get the list of MCP servers from the brain
        const servers = brain.listMcpServers();
        expect(servers).toContain('reactor-prjmgr');
        expect(servers).toContain('self_reflection');  // Should also have self_reflection server
    });
    
    test('should list MCP endpoints using self-reflection tools', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            return;
        }
        
        await agent.initialize();
        
        // Set a system prompt for the brain
        brain.setSystemPrompt(
            'You are a helpful ReactorPackageDevAgent with self-reflection capabilities. ' +
            'You have access to self_reflection MCP tools to introspect your own configuration. ' +
            'Always respond with valid JSON following the exact template provided. ' +
            'Use the mcp__self_reflection__list_mcp_endpoints tool when asked about MCP endpoints.',
            'test-agent'
        );
        
        // Send a message asking the agent to list its MCP endpoints
        const result = await brain.sendMessage(
            'Use the self_reflection list_mcp_endpoints MCP tool to tell me what MCP endpoints you have. Return response in this format:\n\n' +
            '```json\n' +
            '{\n' +
            '  "endpoints": [<endpoint-names>],\n' +
            '  "count": <number>\n' +
            '}\n' +
            '```\n\n' +
            'Important: Return the raw, valid JSON only. Include all MCP endpoint names.'
        );
        
        // Parse and verify the JSON response
        expect(result.response).toBeDefined();
        const jsonResponse = extractJSON(result.response);
        expect(jsonResponse).toHaveProperty('endpoints');
        expect(jsonResponse).toHaveProperty('count');
        expect(Array.isArray(jsonResponse.endpoints)).toBe(true);
        
        // Should have at least reactor-prjmgr and self_reflection
        const endpointNames = jsonResponse.endpoints.map((e: any) => 
            typeof e === 'string' ? e : e.name
        );
        expect(endpointNames).toContain('reactor-prjmgr');
        expect(endpointNames).toContain('self_reflection');
        
        // Should have at least 2 endpoints
        expect(jsonResponse.count).toBeGreaterThanOrEqual(2);
    }, 30000);
});
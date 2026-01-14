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

describe('ReactorPackageDevAgent MCP Integration', () => {
    let agent: ReactorPackageDevAgent;
    let brain: AgentClaudeBrain;
    let testProjectsDir: string;
    let logger: ILogger;
    
    beforeEach(async () => {
        // Skip if no API key
        if (!process.env.ANTHROPIC_API_KEY) {
            console.log('Skipping MCP integration tests - no ANTHROPIC_API_KEY set');
            return;
        }
        
        // Create a simple logger
        logger = {
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: console.error
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
                'mcp__reactor_prjmgr__init_project',
                'mcp__reactor_prjmgr__list_projects',
                'mcp__reactor_prjmgr__run_project',
                'mcp__reactor_prjmgr__shutdown_project',
                'mcp__reactor_prjmgr__get_project_logs',
                'mcp__reactor_prjmgr__get_project_status',
                'mcp__reactor_prjmgr__is_project_ready',
                'mcp__reactor_prjmgr__get_projects_dir'
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
            console.log('Skipping test - no API key');
            return;
        }
        
        // Initialize the agent
        await agent.initialize();
        
        // Verify the agent initialized successfully
        expect(agent.getPackagesManager()).toBeDefined();
        
        // Verify that the MCP server was added to the brain
        const servers = brain.listMcpServers();
        expect(servers).toContain('reactor_prjmgr');
    });
    
    test('should respond to request to list projects using MCP tools', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.log('Skipping test - no API key');
            return;
        }
        
        await agent.initialize();
        
        // Set a system prompt for the brain
        brain.setSystemPrompt(
            'You are a helpful assistant with access to ReactorProjectsManager tools via MCP. ' +
            'Always respond with valid JSON objects only, no additional text. ' +
            'Use the mcp__reactor_prjmgr__list_projects tool when asked about projects.',
            'test-agent'
        );
        
        // Send a message to the brain asking it to list projects
        const result = await brain.sendMessage(
            'List all available projects using the MCP tool and respond with only a JSON object ' +
            'containing a "projects" array with project names.'
        );
        
        // Parse and verify the JSON response
        expect(result.response).toBeDefined();
        const jsonResponse = JSON.parse(result.response);
        expect(jsonResponse).toHaveProperty('projects');
        expect(Array.isArray(jsonResponse.projects)).toBe(true);
        expect(jsonResponse.projects).toContain('persistent-test-project');
        
        console.log('List projects JSON response:', jsonResponse);
    }, 30000);  // Increase timeout for API calls
    
    test('should respond to request for projects directory using MCP tools', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.log('Skipping test - no API key');
            return;
        }
        
        await agent.initialize();
        
        // Set a system prompt for the brain
        brain.setSystemPrompt(
            'You are a helpful assistant with access to ReactorProjectsManager tools via MCP. ' +
            'Always respond with valid JSON objects only, no additional text. ' +
            'Use the mcp__reactor_prjmgr__get_projects_dir tool when asked about the projects directory.',
            'test-agent'
        );
        
        // Send a message asking for the projects directory
        const result = await brain.sendMessage(
            'Get the projects directory path using the MCP tool and respond with only a JSON object ' +
            'containing a "directory" field with the path.'
        );
        
        // Parse and verify the JSON response
        expect(result.response).toBeDefined();
        const jsonResponse = JSON.parse(result.response);
        expect(jsonResponse).toHaveProperty('directory');
        expect(typeof jsonResponse.directory).toBe('string');
        expect(jsonResponse.directory).toMatch(/test-projects/);
        
        console.log('Projects directory JSON response:', jsonResponse);
    }, 30000);
    
    test('should respond to request about project readiness using MCP tools', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.log('Skipping test - no API key');
            return;
        }
        
        await agent.initialize();
        
        // Set a system prompt for the brain
        brain.setSystemPrompt(
            'You are a helpful assistant with access to ReactorProjectsManager tools via MCP. ' +
            'Always respond with valid JSON objects only, no additional text. ' +
            'Use the mcp__reactor_prjmgr__is_project_ready and mcp__reactor_prjmgr__get_project_status tools.',
            'test-agent'
        );
        
        // Send a message asking about project status
        const result = await brain.sendMessage(
            'Check if the "persistent-test-project" is ready using the MCP tools. ' +
            'Respond with only a JSON object containing "projectName", "isReady" (boolean), and "status" fields.'
        );
        
        // Parse and verify the JSON response
        expect(result.response).toBeDefined();
        const jsonResponse = JSON.parse(result.response);
        expect(jsonResponse).toHaveProperty('projectName');
        expect(jsonResponse).toHaveProperty('isReady');
        expect(jsonResponse).toHaveProperty('status');
        expect(typeof jsonResponse.isReady).toBe('boolean');
        expect(jsonResponse.projectName).toBe('persistent-test-project');
        
        console.log('Project readiness JSON response:', jsonResponse);
    }, 30000);
    
    test('should have registered all 8 ReactorProjectsManager tools', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.log('Skipping test - no API key');
            return;
        }
        
        await agent.initialize();
        
        // Get the list of MCP servers from the brain
        const servers = brain.listMcpServers();
        expect(servers).toContain('reactor_prjmgr');
        
        // The brain's allowed tools should include all reactor tools
        const brainConfig = (brain as any).config;
        const allowedTools = brainConfig.allowedTools || [];
        
        const expectedTools = [
            'mcp__reactor_prjmgr__init_project',
            'mcp__reactor_prjmgr__list_projects',
            'mcp__reactor_prjmgr__run_project',
            'mcp__reactor_prjmgr__shutdown_project',
            'mcp__reactor_prjmgr__get_project_logs',
            'mcp__reactor_prjmgr__get_project_status',
            'mcp__reactor_prjmgr__is_project_ready',
            'mcp__reactor_prjmgr__get_projects_dir'
        ];
        
        // Check that all expected tools are in the allowed tools
        for (const tool of expectedTools) {
            expect(allowedTools).toContain(tool);
        }
    });
    
    test('should successfully use multiple MCP tools in conversation', async () => {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.log('Skipping test - no API key');
            return;
        }
        
        await agent.initialize();
        
        // Set a comprehensive system prompt
        brain.setSystemPrompt(
            'You are a helpful assistant with access to ReactorProjectsManager tools via MCP. ' +
            'Always respond with valid JSON objects only, no additional text. ' +
            'You can use tools like mcp__reactor_prjmgr__list_projects, mcp__reactor_prjmgr__get_projects_dir, ' +
            'and mcp__reactor_prjmgr__get_project_status to answer questions.',
            'test-agent'
        );
        
        // Start a conversation that requires multiple tool uses
        let sessionId: string | undefined;
        
        // First message - list projects
        const result1 = await brain.sendMessage(
            'List all projects and respond with only JSON containing a "projects" array and "count" number.',
            sessionId
        );
        sessionId = result1.sessionId;
        expect(result1.response).toBeDefined();
        const json1 = JSON.parse(result1.response);
        expect(json1).toHaveProperty('projects');
        expect(json1).toHaveProperty('count');
        expect(json1.count).toBeGreaterThan(0);
        console.log('Response 1 JSON:', json1);
        
        // Second message - check directory
        const result2 = await brain.sendMessage(
            'Get the projects directory and respond with only JSON containing "directory" and "exists" boolean.',
            sessionId
        );
        sessionId = result2.sessionId;
        expect(result2.response).toBeDefined();
        const json2 = JSON.parse(result2.response);
        expect(json2).toHaveProperty('directory');
        expect(json2).toHaveProperty('exists');
        expect(json2.directory).toMatch(/test-projects/);
        console.log('Response 2 JSON:', json2);
        
        // Third message - check status
        const result3 = await brain.sendMessage(
            'Get status of "persistent-test-project" and respond with only JSON containing "project", "status", and "running" boolean.',
            sessionId
        );
        expect(result3.response).toBeDefined();
        const json3 = JSON.parse(result3.response);
        expect(json3).toHaveProperty('project');
        expect(json3).toHaveProperty('status');
        expect(json3).toHaveProperty('running');
        expect(json3.project).toBe('persistent-test-project');
        console.log('Response 3 JSON:', json3);
    }, 60000);  // Longer timeout for conversation
});
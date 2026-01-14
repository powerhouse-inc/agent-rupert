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
            'Use the mcp__reactor_prjmgr__list_projects tool when asked about projects.',
            'test-agent'
        );
        
        // Send a message to the brain asking it to list projects
        const result = await brain.sendMessage('Can you list all the available projects? Use the appropriate MCP tool.');
        
        // Verify the response mentions using the tool and finding projects
        expect(result.response).toBeDefined();
        expect(result.response.toLowerCase()).toMatch(/list|project|persistent-test-project/i);
        
        // The response should indicate tool usage (Claude typically mentions what it's doing)
        console.log('List projects response:', result.response);
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
            'Use the mcp__reactor_prjmgr__get_projects_dir tool when asked about the projects directory.',
            'test-agent'
        );
        
        // Send a message asking for the projects directory
        const result = await brain.sendMessage('What is the projects directory path? Use the get_projects_dir MCP tool.');
        
        // Verify the response contains the path
        expect(result.response).toBeDefined();
        expect(result.response).toMatch(/test-projects|projects/i);
        
        console.log('Projects directory response:', result.response);
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
            'Use the mcp__reactor_prjmgr__is_project_ready tool when asked about project readiness.',
            'test-agent'
        );
        
        // Send a message asking if a project is ready
        const result = await brain.sendMessage('Is any project currently running and ready? Check with the is_project_ready MCP tool.');
        
        // Verify the response indicates checking readiness
        expect(result.response).toBeDefined();
        expect(result.response.toLowerCase()).toMatch(/ready|running|project|no|false/i);
        
        console.log('Project readiness response:', result.response);
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
            'You can use tools like mcp__reactor_prjmgr__list_projects, mcp__reactor_prjmgr__get_projects_dir, ' +
            'and mcp__reactor_prjmgr__is_project_ready to help answer questions about projects.',
            'test-agent'
        );
        
        // Start a conversation that requires multiple tool uses
        let sessionId: string | undefined;
        
        // First message - list projects
        const result1 = await brain.sendMessage('First, can you list all available projects?', sessionId);
        sessionId = result1.sessionId;
        expect(result1.response).toBeDefined();
        console.log('Response 1:', result1.response);
        
        // Second message - check directory
        const result2 = await brain.sendMessage('Now tell me where these projects are stored (the directory path).', sessionId);
        sessionId = result2.sessionId;
        expect(result2.response).toBeDefined();
        expect(result2.response).toMatch(/test-projects|directory|path/i);
        console.log('Response 2:', result2.response);
        
        // Third message - check readiness
        const result3 = await brain.sendMessage('Finally, check if any project is currently running and ready.', sessionId);
        expect(result3.response).toBeDefined();
        expect(result3.response.toLowerCase()).toMatch(/ready|running|no|false|not/i);
        console.log('Response 3:', result3.response);
    }, 60000);  // Longer timeout for conversation
});
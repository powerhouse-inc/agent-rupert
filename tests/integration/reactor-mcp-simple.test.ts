/**
 * Simple integration test for ReactorPackageDevAgent MCP server
 * Just verifies that the MCP server is registered correctly
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ReactorPackageDevAgent } from '../../src/agents/ReactorPackageDevAgent/ReactorPackageDevAgent.js';
import { AgentClaudeBrain } from '../../src/agents/AgentClaudeBrain.js';
import type { ILogger } from '../../src/agents/AgentBase.js';
import type { ReactorPackageDevAgentConfig } from '../../src/types.js';
import path from 'path';

describe('ReactorPackageDevAgent MCP Simple Test', () => {
    let agent: ReactorPackageDevAgent;
    let brain: AgentClaudeBrain;
    let testProjectsDir: string;
    let logger: ILogger;
    
    beforeEach(async () => {
        // Create a simple logger
        logger = {
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {}
        };
        
        // Use the actual test-projects directory
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
                    type: 'memory'
                },
                driveUrl: null,
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
        
        // Create a brain with minimal config (no API key needed for this test)
        brain = new AgentClaudeBrain({
            apiKey: 'test-key',
            workingDirectory: path.join(testProjectsDir, 'workspace'),
            model: 'haiku'
        });
        
        // Create the agent
        agent = new ReactorPackageDevAgent(config, logger, brain);
    });
    
    afterEach(async () => {
        if (agent) {
            await agent.shutdown();
        }
    });
    
    test('should initialize agent and register MCP server', async () => {
        // Initialize the agent
        await agent.initialize();
        
        // Verify the agent initialized
        expect(agent.getPackagesManager()).toBeDefined();
        
        // Verify the MCP server was registered
        const servers = brain.listMcpServers();
        expect(servers).toContain('reactor_prjmgr');
        
        // Get the registered server
        const server = brain.getMcpServer('reactor_prjmgr');
        expect(server).toBeDefined();
    });
    
    test('should have ReactorPackagesManager with correct directory', async () => {
        await agent.initialize();
        
        const packagesManager = agent.getPackagesManager();
        const dir = packagesManager.getProjectsDir();
        expect(dir).toBe(testProjectsDir);
    });
    
    test('should be able to list projects through manager', async () => {
        await agent.initialize();
        
        const packagesManager = agent.getPackagesManager();
        const projects = await packagesManager.listProjects();
        
        // Should at least find persistent-test-project
        expect(projects.length).toBeGreaterThan(0);
        expect(projects.some(p => p.name === 'persistent-test-project')).toBe(true);
    });
});
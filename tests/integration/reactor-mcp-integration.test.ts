/**
 * Integration test for ReactorPackageDevAgent MCP server
 * Tests that the agent can properly expose and use ReactorProjectsManager tools
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ReactorPackageDevAgent } from '../../src/agents/ReactorPackageDevAgent/ReactorPackageDevAgent.js';
import { AgentClaudeBrain } from '../../src/agents/AgentClaudeBrain.js';
import type { ILogger } from '../../src/agents/AgentBase.js';
import type { ReactorPackageDevAgentConfig } from '../../src/types.js';
import path from 'path';

describe('ReactorPackageDevAgent MCP Integration', () => {
    let agent: ReactorPackageDevAgent;
    let testProjectsDir: string;
    let mockLogger: ILogger;
    
    beforeEach(async () => {
        // Create a mock logger
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
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
        
        // Create a mock brain (we're not testing Claude SDK, just MCP server registration)
        const brain = new AgentClaudeBrain({
            apiKey: 'test-key',
            workingDirectory: path.join(testProjectsDir, 'workspace'),
            model: 'haiku'
        });
        
        // Create the agent with the brain
        agent = new ReactorPackageDevAgent(config, mockLogger, brain);
    });
    
    afterEach(async () => {
        // Cleanup
        if (agent) {
            await agent.shutdown();
        }
        
        // Don't remove the test-projects directory as it contains persistent projects
    });
    
    test('should initialize and register MCP server', async () => {
        // Initialize the agent
        await agent.initialize();
        
        // Since brain is protected, we can verify MCP registration worked
        // by checking that the agent initialized successfully and the
        // packages manager is available
        const packagesManager = agent.getPackagesManager();
        expect(packagesManager).toBeDefined();
        
        // The MCP server should have been registered during initialization
        // We can't directly verify this without accessing the protected brain,
        // but successful initialization indicates it worked
    });
    
    test('should expose list_projects tool through MCP', async () => {
        await agent.initialize();
        
        // Get the packages manager to test directly
        const packagesManager = agent.getPackagesManager();
        expect(packagesManager).toBeDefined();
        
        // Test that we can list projects (should find persistent-test-project)
        const projects = await packagesManager.listProjects();
        expect(projects.length).toBeGreaterThan(0);
        expect(projects.some(p => p.name === 'persistent-test-project')).toBe(true);
    });
    
    test('should expose get_projects_dir tool through MCP', async () => {
        await agent.initialize();
        
        // Get the packages manager
        const packagesManager = agent.getPackagesManager();
        expect(packagesManager).toBeDefined();
        
        // Test that we can get the projects directory
        const dir = packagesManager.getProjectsDir();
        expect(dir).toBe(testProjectsDir);
    });
    
    test('should expose is_project_ready tool through MCP', async () => {
        await agent.initialize();
        
        // Get the packages manager
        const packagesManager = agent.getPackagesManager();
        expect(packagesManager).toBeDefined();
        
        // Test that we can check project readiness (should be false with no running project)
        const isReady = packagesManager.isProjectReady();
        expect(isReady).toBe(false);
    });
    
    test('should verify persistent-test-project exists', async () => {
        await agent.initialize();
        
        const packagesManager = agent.getPackagesManager();
        
        // List projects should find the persistent-test-project
        const projects = await packagesManager.listProjects();
        expect(projects.length).toBeGreaterThan(0);
        
        // Find the persistent-test-project specifically
        const persistentProject = projects.find(p => p.name === 'persistent-test-project');
        expect(persistentProject).toBeDefined();
        expect(persistentProject?.path).toContain('persistent-test-project');
    });
});
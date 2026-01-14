import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { z } from 'zod';
import { 
    ClaudeAgentToolBase,
    createTool,
    createProjectTool,
    createSystemTool,
    createRetryableTool,
    ToolRegistry,
    type ToolContext,
    type ClaudeAgentTool
} from '../../../src/tools/index.js';
import type { ILogger } from '../../../src/agents/AgentBase.js';

// Mock logger
const createMockLogger = (): ILogger => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
});

// Mock agent
const createMockAgent = () => ({
    getName: () => 'test-agent',
    // Add other required methods as needed
});

// Mock brain
const createMockBrain = () => ({
    setLogger: jest.fn(),
    describeWbsOperations: jest.fn(),
    describeInboxOperations: jest.fn(),
    sendMessage: jest.fn()
});

describe('Tool Infrastructure', () => {
    let logger: ILogger;
    let registry: ToolRegistry;
    
    beforeEach(() => {
        logger = createMockLogger();
        registry = new ToolRegistry(logger);
    });
    
    describe('ClaudeAgentToolBase', () => {
        class TestTool extends ClaudeAgentToolBase {
            name = 'test_tool';
            description = 'A test tool';
            category = 'custom' as const;
            schema = z.object({
                message: z.string()
            });
            
            protected async executeInternal(args: { message: string }): Promise<string> {
                return `Processed: ${args.message}`;
            }
        }
        
        it('should validate input against schema', async () => {
            const tool = new TestTool();
            const context: ToolContext = {
                agent: createMockAgent() as any,
                brain: createMockBrain() as any,
                logger,
                permissions: {},
                metadata: {}
            };
            
            // Valid input
            const result = await tool.execute({ message: 'hello' }, context);
            expect(result.success).toBe(true);
            expect(result.data).toBe('Processed: hello');
            
            // Invalid input
            const badResult = await tool.execute({ invalid: 'field' }, context);
            expect(badResult.success).toBe(false);
            expect(badResult.error?.message).toContain('Validation failed');
        });
        
        it('should track execution metadata', async () => {
            const tool = new TestTool();
            const context: ToolContext = {
                agent: createMockAgent() as any,
                brain: createMockBrain() as any,
                logger,
                permissions: {},
                metadata: {}
            };
            
            const result = await tool.execute({ message: 'test' }, context);
            expect(result.metadata).toBeDefined();
            expect(result.metadata?.toolName).toBe('test_tool');
            expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
        });
    });
    
    describe('Tool Factory Functions', () => {
        it('should create a simple tool', async () => {
            const tool = createTool({
                name: 'simple_tool',
                description: 'A simple tool',
                category: 'custom',
                schema: z.object({
                    value: z.number()
                }),
                handler: async (args) => args.value * 2
            });
            
            expect(tool.name).toBe('simple_tool');
            expect(tool.category).toBe('custom');
            
            const context: ToolContext = {
                agent: createMockAgent() as any,
                brain: createMockBrain() as any,
                logger,
                permissions: {},
                metadata: {}
            };
            
            const result = await tool.execute({ value: 5 }, context);
            expect(result.success).toBe(true);
            expect(result.data).toBe(10);
        });
        
        it('should create a project tool with prefix', () => {
            const tool = createProjectTool(
                'init',
                'Initialize project',
                z.object({ name: z.string() }),
                async (args) => `Project ${args.name} initialized`
            );
            
            expect(tool.name).toBe('project_init');
            expect(tool.category).toBe('project');
        });
        
        it('should create a system tool with default permissions', () => {
            const tool = createSystemTool(
                'restart',
                'Restart system',
                z.object({}),
                async () => 'System restarted'
            );
            
            expect(tool.name).toBe('system_restart');
            expect(tool.category).toBe('system');
            expect(tool.permissions?.requiresApproval).toBe(true);
        });
        
        it('should create a retryable tool', async () => {
            let attempts = 0;
            const tool = createRetryableTool(
                {
                    name: 'flaky_tool',
                    description: 'A flaky tool',
                    category: 'custom',
                    schema: z.object({}),
                    handler: async () => {
                        attempts++;
                        if (attempts < 3) {
                            throw new Error('Temporary failure');
                        }
                        return 'Success after retries';
                    }
                },
                3,
                10 // Short delay for testing
            );
            
            const context: ToolContext = {
                agent: createMockAgent() as any,
                brain: createMockBrain() as any,
                logger,
                permissions: {},
                metadata: {}
            };
            
            const result = await tool.execute({}, context);
            expect(result.success).toBe(true);
            expect(result.data).toBe('Success after retries');
            expect(attempts).toBe(3);
        });
    });
    
    describe('ToolRegistry', () => {
        it('should register and retrieve tools', () => {
            const tool: ClaudeAgentTool = {
                name: 'registry_test',
                description: 'Test tool',
                category: 'custom',
                schema: z.object({}),
                execute: jest.fn()
            };
            
            registry.register(tool);
            expect(registry.has('registry_test')).toBe(true);
            expect(registry.get('registry_test')).toBe(tool);
        });
        
        it('should prevent duplicate registration without override', () => {
            const tool: ClaudeAgentTool = {
                name: 'duplicate',
                description: 'Test tool',
                category: 'custom',
                schema: z.object({}),
                execute: jest.fn()
            };
            
            registry.register(tool);
            expect(() => registry.register(tool)).toThrow('already registered');
            
            // With override
            registry.register(tool, { override: true });
            expect(registry.has('duplicate')).toBe(true);
        });
        
        it('should get tools by category', () => {
            const systemTool: ClaudeAgentTool = {
                name: 'sys_tool',
                description: 'System tool',
                category: 'system',
                schema: z.object({}),
                execute: jest.fn()
            };
            
            const projectTool: ClaudeAgentTool = {
                name: 'proj_tool',
                description: 'Project tool',
                category: 'project',
                schema: z.object({}),
                execute: jest.fn()
            };
            
            registry.register(systemTool);
            registry.register(projectTool);
            
            const systemTools = registry.getByCategory('system');
            expect(systemTools).toHaveLength(1);
            expect(systemTools[0].name).toBe('sys_tool');
            
            const projectTools = registry.getByCategory('project');
            expect(projectTools).toHaveLength(1);
            expect(projectTools[0].name).toBe('proj_tool');
        });
        
        it('should filter tools by agent permissions', () => {
            const allowedTool: ClaudeAgentTool = {
                name: 'allowed',
                description: 'Allowed tool',
                category: 'custom',
                schema: z.object({}),
                execute: jest.fn(),
                permissions: {
                    allowedAgents: ['test-agent']
                }
            };
            
            const deniedTool: ClaudeAgentTool = {
                name: 'denied',
                description: 'Denied tool',
                category: 'custom',
                schema: z.object({}),
                execute: jest.fn(),
                permissions: {
                    deniedAgents: ['test-agent']
                }
            };
            
            registry.register(allowedTool);
            registry.register(deniedTool);
            
            const accessible = registry.getForAgent('test-agent');
            expect(accessible).toHaveLength(1);
            expect(accessible[0].name).toBe('allowed');
        });
        
        it('should provide registry statistics', () => {
            const tools: ClaudeAgentTool[] = [
                {
                    name: 'tool1',
                    description: 'Tool 1',
                    category: 'system',
                    schema: z.object({}),
                    execute: jest.fn(),
                    permissions: { requiresApproval: true }
                },
                {
                    name: 'tool2',
                    description: 'Tool 2',
                    category: 'project',
                    schema: z.object({}),
                    execute: jest.fn()
                }
            ];
            
            tools.forEach(t => registry.register(t));
            
            const stats = registry.getStats();
            expect(stats.total).toBe(2);
            expect(stats.byCategory.system).toBe(1);
            expect(stats.byCategory.project).toBe(1);
            expect(stats.withPermissions).toBe(1);
            expect(stats.requiresApproval).toBe(1);
        });
    });
});
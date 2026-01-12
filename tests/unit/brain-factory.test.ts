import { BrainFactory, BrainType } from '../../src/agents/BrainFactory.js';
import { AgentBrain } from '../../src/agents/AgentBrain.js';
import { AgentClaudeBrain } from '../../src/agents/AgentClaudeBrain.js';

describe('BrainFactory', () => {
    const mockApiKey = 'sk-ant-test-key';

    describe('create', () => {
        it('should create a standard brain when type is STANDARD', () => {
            const brain = BrainFactory.create({
                type: BrainType.STANDARD,
                apiKey: mockApiKey
            });

            expect(brain).toBeInstanceOf(AgentBrain);
        });

        it('should create a Claude SDK brain when type is CLAUDE_SDK', () => {
            const brain = BrainFactory.create({
                type: BrainType.CLAUDE_SDK,
                apiKey: mockApiKey,
                workingDirectory: '/tmp/test-workspace'
            });

            expect(brain).toBeInstanceOf(AgentClaudeBrain);
        });

        it('should create Claude SDK brain with agent manager MCP server URL', () => {
            const brain = BrainFactory.create({
                type: BrainType.CLAUDE_SDK,
                apiKey: mockApiKey,
                workingDirectory: '/tmp/test-workspace',
                agentManagerMcpUrl: 'http://localhost:3100/mcp'
            });

            expect(brain).toBeInstanceOf(AgentClaudeBrain);
        });

        it('should create Claude SDK brain with file system restrictions', () => {
            const brain = BrainFactory.create({
                type: BrainType.CLAUDE_SDK,
                apiKey: mockApiKey,
                workingDirectory: '/tmp/test-workspace',
                fileSystemPaths: {
                    allowedReadPaths: ['/tmp/test-workspace'],
                    allowedWritePaths: ['/tmp/test-workspace/output']
                }
            });

            expect(brain).toBeInstanceOf(AgentClaudeBrain);
        });

        it('should throw error for unknown brain type', () => {
            expect(() => {
                BrainFactory.create({
                    type: 'unknown' as any,
                    apiKey: mockApiKey
                });
            }).toThrow('Unknown brain type: unknown');
        });
    });
});
import { jest } from '@jest/globals';
import { CreativeWriterAgent, type CreativeWriterConfig } from '../../../src/agents/CreativeWriterAgent/CreativeWriterAgent.js';
import type { IAgentBrain } from '../../../src/agents/IAgentBrain.js';
import type { ILogger } from '../../../src/agents/AgentBase.js';
import { BrainType } from '../../../src/agents/BrainFactory.js';

// Mock logger
const mockLogger: ILogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
};

// Mock brain
class MockBrain implements Partial<IAgentBrain> {
    public sendMessage = jest.fn();
    public setSystemPrompt = jest.fn();
    public describeInboxOperations = jest.fn();
    public describeWbsOperations = jest.fn();
    public setLogger = jest.fn();
}

describe('CreativeWriterAgent', () => {
    let agent: CreativeWriterAgent;
    let mockBrain: MockBrain;
    let config: CreativeWriterConfig;

    beforeEach(() => {
        jest.clearAllMocks();
        
        config = {
            name: 'TestWriter',
            apiKey: 'test-api-key',
            genre: 'science-fiction'
        };
        
        mockBrain = new MockBrain();
    });

    describe('static methods', () => {
        it('should return brain config with API key', () => {
            const brainConfig = CreativeWriterAgent.getBrainConfig('test-api-key');
            
            expect(brainConfig).not.toBeNull();
            expect(brainConfig?.type).toBe(BrainType.CLAUDE_SDK);
            expect(brainConfig?.apiKey).toBe('test-api-key');
            expect(brainConfig?.model).toBe('claude-3-haiku-20240307');
        });

        it('should return null brain config without API key', () => {
            const brainConfig = CreativeWriterAgent.getBrainConfig();
            expect(brainConfig).toBeNull();
        });

        it('should return correct prompt template paths', () => {
            const paths = CreativeWriterAgent.getPromptTemplatePaths();
            
            expect(paths).toEqual([
                'prompts/agent-profiles/CreativeWriterAgent.md'
            ]);
        });

        it('should build prompt context with genre property', () => {
            const context = CreativeWriterAgent.buildPromptContext(config, 3000, ['test-server']);
            
            expect(context.agentType).toBe('CreativeWriterAgent');
            expect(context.agentName).toBe('TestWriter');
            expect(context.genre).toBe('science-fiction');  // Check genre property
            expect(context.capabilities).toBeUndefined();  // Capabilities removed
        });

        it('should include different genre in context', () => {
            const thrillerConfig = { ...config, genre: 'thriller' as const };
            const context = CreativeWriterAgent.buildPromptContext(thrillerConfig, 3000);
            
            expect(context.genre).toBe('thriller');
            expect(context.capabilities).toBeUndefined();  // Capabilities removed
        });

        it('should return correct default skill names', () => {
            const skills = CreativeWriterAgent.getDefaultSkillNames();
            expect(skills).toEqual(['short-story-writing']);
        });
    });

    describe('instance methods', () => {
        beforeEach(() => {
            agent = new CreativeWriterAgent(config, mockLogger, mockBrain as IAgentBrain);
        });

        it('should return the configured genre', () => {
            expect(agent.getGenre()).toBe('science-fiction');
        });

        it('should write creative piece with genre context', async () => {
            mockBrain.sendMessage.mockResolvedValue({ 
                response: 'A creative story...', 
                sessionId: 'test-session-1' 
            });
            
            const result = await agent.writeCreativePiece('Write a story about robots');
            
            expect(mockBrain.sendMessage).toHaveBeenCalledWith(
                'Write in the science-fiction genre.\n\nWrite a story about robots'
            );
            expect(result).toBe('A creative story...');
        });

        it('should throw error if brain does not support sendMessage', async () => {
            const limitedBrain = { 
                setSystemPrompt: jest.fn(),
                setLogger: jest.fn()
            };
            const agentWithLimitedBrain = new CreativeWriterAgent(
                config, 
                mockLogger, 
                limitedBrain as IAgentBrain
            );
            
            await expect(agentWithLimitedBrain.writeCreativePiece('Write something'))
                .rejects.toThrow('Brain not initialized or does not support sendMessage');
        });

        it('should handle different genres', async () => {
            const thrillerConfig = { ...config, genre: 'thriller' as const };
            const thrillerAgent = new CreativeWriterAgent(thrillerConfig, mockLogger, mockBrain as IAgentBrain);
            
            mockBrain.sendMessage.mockResolvedValue('A thrilling story...');
            
            await thrillerAgent.writeCreativePiece('Write a suspenseful scene');
            
            expect(mockBrain.sendMessage).toHaveBeenCalledWith(
                'Write in the thriller genre.\n\nWrite a suspenseful scene'
            );
        });
    });

    describe('document handlers', () => {
        beforeEach(() => {
            agent = new CreativeWriterAgent(config, mockLogger, mockBrain as IAgentBrain);
        });

        it('should handle inbox updates', async () => {
            const operations = [{ type: 'insert', data: 'test' }];
            mockBrain.describeInboxOperations.mockResolvedValue('New writing request');
            
            await (agent as any).handleInboxUpdate('doc-id', operations);
            
            expect(mockLogger.info).toHaveBeenCalledWith(
                'TestWriter: Processing inbox update with 1 operations'
            );
            expect(mockBrain.describeInboxOperations).toHaveBeenCalledWith(operations);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'TestWriter: Brain analysis: New writing request'
            );
        });

        it('should handle inbox updates without brain', async () => {
            const agentNoBrain = new CreativeWriterAgent(config, mockLogger);
            const operations = [{ type: 'insert', data: 'test' }];
            
            await (agentNoBrain as any).handleInboxUpdate('doc-id', operations);
            
            expect(mockLogger.info).toHaveBeenCalledWith(
                'TestWriter: Processing inbox update with 1 operations'
            );
            expect(mockBrain.describeInboxOperations).not.toHaveBeenCalled();
        });

        it('should handle WBS updates', async () => {
            const operations = [{ type: 'update', data: 'progress' }];
            mockBrain.describeWbsOperations.mockResolvedValue('Story task completed');
            
            await (agent as any).handleWbsUpdate('wbs-id', operations);
            
            expect(mockLogger.info).toHaveBeenCalledWith(
                'TestWriter: Processing WBS update with 1 operations'
            );
            expect(mockBrain.describeWbsOperations).toHaveBeenCalledWith(operations);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'TestWriter: Brain analysis: Story task completed'
            );
        });

        it('should handle brain analysis errors gracefully', async () => {
            const operations = [{ type: 'insert' }];
            mockBrain.describeInboxOperations.mockRejectedValue(new Error('Analysis failed'));
            
            await (agent as any).handleInboxUpdate('doc-id', operations);
            
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'TestWriter: Failed to get brain analysis of inbox operations'
            );
        });
    });

    // Note: initialization and shutdown tests would require complex reactor mocking
    // These are covered by AgentBase tests

    describe('genre variations', () => {
        it('should support thriller genre', () => {
            const thrillerConfig: CreativeWriterConfig = {
                ...config,
                genre: 'thriller'
            };
            
            const thrillerAgent = new CreativeWriterAgent(thrillerConfig, mockLogger);
            expect(thrillerAgent.getGenre()).toBe('thriller');
        });

        it('should support slice-of-life genre', () => {
            const sliceOfLifeConfig: CreativeWriterConfig = {
                ...config,
                genre: 'slice-of-life'
            };
            
            const sliceOfLifeAgent = new CreativeWriterAgent(sliceOfLifeConfig, mockLogger);
            expect(sliceOfLifeAgent.getGenre()).toBe('slice-of-life');
        });
    });
});
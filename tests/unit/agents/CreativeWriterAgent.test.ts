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
            const paths = CreativeWriterAgent.getSystemPromptTemplatePaths();
            
            expect(paths).toEqual([
                'prompts/agent-profiles/CreativeWriterAgent.md'
            ]);
        });

        it('should build prompt context with genre property', () => {
            const context = CreativeWriterAgent.buildSystemPromptContext(config, 3000, ['test-server']);
            
            expect(context.agentType).toBe('CreativeWriterAgent');
            expect(context.agentName).toBe('TestWriter');
            expect(context.genre).toBe('science-fiction');  // Check genre property
            expect(context.capabilities).toBeUndefined();  // Capabilities removed
        });

        it('should include different genre in context', () => {
            const thrillerConfig = { ...config, genre: 'thriller' as const };
            const context = CreativeWriterAgent.buildSystemPromptContext(thrillerConfig, 3000);
            
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
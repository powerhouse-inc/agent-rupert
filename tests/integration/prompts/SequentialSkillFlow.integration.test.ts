import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { SequentialSkillFlow } from '../../../src/prompts/flows/SequentialSkillFlow.js';
import { PromptDriver } from '../../../src/prompts/PromptDriver.js';
import { SkillsRepository } from '../../../src/prompts/SkillsRepository.js';
import { CreativeWriterAgent, type CreativeWriterConfig } from '../../../src/agents/CreativeWriterAgent/CreativeWriterAgent.js';
import { BrainFactory } from '../../../src/agents/BrainFactory.js';
import type { IAgentBrain } from '../../../src/agents/IAgentBrain.js';
import type { ILogger } from '../../../src/agents/AgentBase.js';
import type { RenderedScenario } from '../../../src/prompts/types.js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// This test requires environment setup
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Logger implementation for testing
class TestLogger implements ILogger {
    info(message: string): void {
        if (process.env.DEBUG) console.log('[INFO]', message);
    }
    
    warn(message: string): void {
        if (process.env.DEBUG) console.warn('[WARN]', message);
    }
    
    error(message: string, error?: Error): void {
        if (process.env.DEBUG) console.error('[ERROR]', message, error);
    }
    
    debug(message: string): void {
        if (process.env.DEBUG) console.debug('[DEBUG]', message);
    }
}

describe('CreativeWriterAgent with SequentialSkillFlow', () => {
    let repository: SkillsRepository;
    let logger: ILogger;
    let agent: CreativeWriterAgent;
    let brain: IAgentBrain;
    let promptDriver: PromptDriver;
    let skillFlow: SequentialSkillFlow;
    
    beforeAll(async () => {
        // Skip tests if no API key
        if (!ANTHROPIC_API_KEY) {
            console.log('Skipping SequentialSkillFlow integration tests - ANTHROPIC_API_KEY not set');
            return;
        }
        
        // Initialize repository and load scenarios
        repository = new SkillsRepository('./build/prompts');
        await repository.loadSkills();
        
        // Create logger
        logger = new TestLogger();

        // Create agent configuration matching BaseAgentConfig structure
        const config: CreativeWriterConfig = {
            name: 'TestCreativeWriter',
            genre: 'horror',
            workDrive: {
                reactorStorage: { 
                    type: 'memory' 
                },
                driveUrl: null,
                documents: {
                    inbox: { 
                        documentType: 'powerhouse/inbox', 
                        documentId: null 
                    },
                    wbs: { 
                        documentType: 'powerhouse/wbs', 
                        documentId: null 
                    }
                }
            }
        };
        
        // Build prompt context
        const promptContext = CreativeWriterAgent.buildPromptContext(config, 3000, []);
        const promptPaths = CreativeWriterAgent.getPromptTemplatePaths();
        
        // Set up the brain
        const brainConfig = CreativeWriterAgent.getBrainConfig(ANTHROPIC_API_KEY);
        if (!brainConfig) {
            throw new Error('Failed to get brain configuration');
        }

        brain = await BrainFactory.create(
            brainConfig,
            logger,
            promptPaths,
            promptContext
        );
        
        // Create agent with brain
        agent = new CreativeWriterAgent(config, logger, brain);
        
        // Create PromptDriver with the repository
        promptDriver = new PromptDriver(brain, repository);
        await promptDriver.initialize();

        // Get all scenarios for the short-story-writing skill
        const skillName = 'short-story-writing';
        const context = { character: 'Al Dente' }; // Context for template rendering
        
        // Get rendered scenarios for the skill
        const scenarioIds = repository.getScenarioIdsBySkill(skillName);
        const renderedScenarios: RenderedScenario[] = [];
        
        for (const scenarioId of scenarioIds) {
            const scenarioKey = `${skillName}/${scenarioId}`;
            const renderedScenario = repository.getScenarioByKey(scenarioKey, context);
            if (renderedScenario) {
                renderedScenarios.push(renderedScenario);
            }
        }
        
        // Sort scenarios by ID to ensure proper order (SS.00, SS.01, etc.)
        renderedScenarios.sort((a, b) => a.id.localeCompare(b.id));
        
        // Create the skill flow with all scenarios
        skillFlow = new SequentialSkillFlow(skillName, renderedScenarios);

        console.log(" Test setup finished. "); 
    });
    
    it('should have loaded scenarios correctly', () => {
        const skillInfo = skillFlow.getSkillInfo();
        expect(skillInfo.name).toBe('short-story-writing');
        expect(skillInfo.totalScenarios).toBeGreaterThan(0);
    });
    
    it('should have correct agent configuration', () => {
        expect(agent).toBeDefined();
        expect(agent.getGenre()).toBe('horror');
    });
    
    it('should have initialized prompt driver', () => {
        expect(promptDriver).toBeDefined();
        expect(promptDriver.isReady()).toBe(true);
    });

    it('should complete flash fiction skill with Al Dente as main character', async () => {
        const context = { character: 'Al Dente' };
        
        let sessionId: string | null = null;

        sessionId = promptDriver.getSessionId();
        expect(sessionId).toBeNull();

        type ShortStoryContext = {character: string};
        const results = await promptDriver.executeSkillFlow<ShortStoryContext>(
            'short-story-writing',
            skillFlow,
            {character: "Al Dente"},
        );

        console.log(results);
    }, 360000);
});
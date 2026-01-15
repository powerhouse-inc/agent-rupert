import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { AgentActivityLoop } from '../../../src/prompts/AgentActivityLoop.js';
import { SkillsRepository } from '../../../src/prompts/SkillsRepository.js';
import { CreativeWriterAgent, type CreativeWriterConfig } from '../../../src/agents/CreativeWriterAgent/CreativeWriterAgent.js';
import { BrainFactory } from '../../../src/agents/BrainFactory.js';
import type { IAgentBrain } from '../../../src/agents/IAgentBrain.js';
import type { ILogger } from '../../../src/agents/AgentBase.js';
import type { ScenarioTemplate } from '../../../src/prompts/types.js';
import {
    TaskExecutionState,
    type ActivityLoopConfig,
    type ActivityLoopCallbacks,
    type ProgressReport
} from '../../../src/prompts/ActivityLoopTypes.js';
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

describe('AgentActivityLoop Integration Tests', () => {
    let repository: SkillsRepository;
    let logger: ILogger;
    
    beforeAll(async () => {
        // Initialize repository and load scenarios
        repository = new SkillsRepository('./build/prompts');
        await repository.loadSkills();
        
        // Create logger
        logger = new TestLogger();
    });
    
    describe('CreativeWriterAgent with AgentActivityLoop', () => {
        let agent: CreativeWriterAgent;
        let brain: IAgentBrain;
        let activityLoop: AgentActivityLoop;
        let scenario: ScenarioTemplate | undefined;
        
        beforeEach(async () => {
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
            
            // Get brain configuration from agent
            if (!ANTHROPIC_API_KEY) {
                throw new Error('ANTHROPIC_API_KEY is required for integration tests');
            }
            const brainConfig = CreativeWriterAgent.getBrainConfig(ANTHROPIC_API_KEY);
            if (!brainConfig) {
                throw new Error('Failed to get brain configuration');
            }
            
            // Build prompt context
            const promptContext = CreativeWriterAgent.buildPromptContext(config, 3000, []);
            
            // Get prompt template paths
            const promptPaths = CreativeWriterAgent.getPromptTemplatePaths();
            
            // Create brain using factory
            brain = await BrainFactory.create(
                brainConfig,
                logger,
                promptPaths,
                promptContext
            );
            
            // Create agent with brain
            agent = new CreativeWriterAgent(config, logger, brain);
            
            // Load a scenario for testing
            scenario = repository.getScenarioTemplateInternal('short-story-writing/SS.00');
            
            // Configure activity loop
            const loopConfig: ActivityLoopConfig = {
                maxRetries: 2,
                retryDelay: 1000,
                taskTimeout: 30000,
                enableCheckpoints: false,
                checkpointInterval: 0,
                progressReportInterval: 0
            };
            
            const callbacks: ActivityLoopCallbacks = {
                onTaskStart: (task) => {
                    logger.info(`Starting task: ${task.id}`);
                },
                onTaskComplete: (task, result) => {
                    logger.info(`Completed task: ${task.id} - State: ${result.state}`);
                },
                onTaskFailed: (task, error) => {
                    logger.error(`Failed task: ${task.id}`, error);
                },
                onProgressUpdate: (report) => {
                    logger.info(`Progress: ${report.completedTasks}/${report.totalTasks}`);
                }
            };
            
            // Create activity loop with brain and repository for skill preambles
            activityLoop = new AgentActivityLoop(brain, loopConfig, callbacks, repository);
        });
        
        afterEach(async () => {
            // Cleanup
            if (activityLoop) {
                await activityLoop.cleanup();
            }
            if (brain && brain.cleanup) {
                await brain.cleanup();
            }
            // Give the SDK time to clean up any spawned processes
            await new Promise(resolve => setTimeout(resolve, 100));
        });
        
        it('should load scenario correctly', () => {
            expect(scenario).toBeDefined();
            expect(scenario?.id).toBe('SS.00');
            expect(scenario?.title).toBe('Write a piece of flash fiction');
            expect(scenario?.tasks).toHaveLength(6);
        });
        
        it('should have correct agent configuration', () => {
            expect(agent).toBeDefined();
            expect(agent.getGenre()).toBe('horror');
        });
        
        it('should have initialized activity loop', () => {
            expect(activityLoop).toBeDefined();
            expect(activityLoop.getState()).toBe(TaskExecutionState.IDLE);
        });
                
        describe('with real Claude API', () => {
            it('should complete flash fiction scenario with Al Dente as main character', async () => {
                if (!scenario) {
                    throw new Error('Scenario not loaded');
                }
                
                // Create context with Al Dente as the character
                // This will be injected into the skill preamble if the skill has a .preamble.md file
                // For example: "Name your main character '{{character}}'" becomes "Name your main character 'Al Dente'"
                const context = { character: 'Al Dente' };
                
                // Execute the scenario with context - Al Dente will be the main character
                const report: ProgressReport = await activityLoop.processScenario(scenario, context);
                
                // Output the actual story content
                //console.log('\n=== FLASH FICTION STORY FEATURING AL DENTE ===\n');
                
                // Get the complete story task result (SS.00.6 - Review and polish the complete story)
                const storyTask = report.taskResults.get('SS.00.6');
                if (storyTask?.response) {
                    //console.log(storyTask.response);
                } else {
                    //console.log('(No story generated)');
                }
                
                //console.log('\n=== END OF STORY ===\n');
                
                // Also show other creative outputs
                const titleTask = report.taskResults.get('SS.00.1');
                const charactersTask = report.taskResults.get('SS.00.2');
                const openingTask = report.taskResults.get('SS.00.4');
                const endingTask = report.taskResults.get('SS.00.5');
                const revisionTask = report.taskResults.get('SS.00.6');
                
                //console.log('Other outputs:');
                //console.log('- Title:', titleTask?.response?.substring(0, 100) || 'N/A');
                //console.log('- Characters:', charactersTask?.response?.substring(0, 100) || 'N/A');
                //console.log('- Opening Hook:', openingTask?.response?.substring(0, 100) || 'N/A');
                //console.log('- Ending:', endingTask?.response?.substring(0, 100) || 'N/A');
                //console.log('- Revision Notes:', revisionTask?.response?.substring(0, 100) || 'N/A');
                
                // Validate results
                expect(report.scenarioId).toBe('SS.00');
                expect(report.totalTasks).toBe(6);
                expect(report.completedTasks).toBeGreaterThan(0);
                expect(report.failedTasks).toBe(0);
                
                // Verify that Al Dente appears in the story
                const fullStory = storyTask?.response || '';
                const hasCharacter = fullStory.toLowerCase().includes('al dente');
                //console.log('\n✓ Story includes "Al Dente":', hasCharacter);
                if (report.completedTasks === 6) {
                    // Only check if all tasks completed successfully
                    expect(hasCharacter).toBe(true);
                }
                
                // Check task results
                const taskIds = ['SS.00.1', 'SS.00.2', 'SS.00.3', 'SS.00.4', 'SS.00.5', 'SS.00.6'];
                taskIds.forEach(taskId => {
                    const result = report.taskResults.get(taskId);
                    expect(result).toBeDefined();
                    if (result) {
                        expect(result.state).toBe(TaskExecutionState.COMPLETED);
                        expect(result.response).toBeDefined();
                    }
                });
            }, 180000); // 3 minute timeout
        });
    });
});
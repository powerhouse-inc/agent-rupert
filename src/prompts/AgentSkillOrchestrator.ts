import { PromptDriver } from './PromptDriver.js';
import { SkillsRepository } from './SkillsRepository.js';
import type { IAgentBrain } from '../agents/IAgentBrain.js';
import type { ScenarioInfo } from './types.js';

/**
 * Result of executing a complete skill with all its scenarios
 */
export interface SkillExecutionResult {
    skillName: string;
    totalScenarios: number;
    completedScenarios: number;
    scenarioResults: Array<{
        scenarioId: string;
        scenarioTitle: string;
        completed: boolean;
        totalTasks: number;
        completedTasks: number;
        error?: Error;
    }>;
    success: boolean;
    startTime: Date;
    endTime: Date;
}

/**
 * Configuration for AgentSkillApplication
 */
export interface SkillApplicationConfig {
    continueOnError?: boolean;  // Continue with next scenario even if one fails
    logProgress?: boolean;       // Log progress between scenarios
    maxTurns?: number;           // Maximum turns per message exchange (default: 100 for skills)
}

/**
 * AgentSkillApplication orchestrates the execution of all scenarios within a skill
 * It leverages PromptDriver to execute each scenario in sequence
 */
export class AgentSkillOrchestrator {
    private promptDriver: PromptDriver;
    private repository: SkillsRepository;
    private config: Required<SkillApplicationConfig>;
    
    constructor(
        agent: IAgentBrain,
        repositoryPath: string = './build/prompts',
        config: SkillApplicationConfig = {}
    ) {
        this.promptDriver = new PromptDriver(agent, repositoryPath);
        this.repository = new SkillsRepository(repositoryPath);
        this.config = {
            continueOnError: config.continueOnError ?? false,
            logProgress: config.logProgress ?? true,
            maxTurns: config.maxTurns ?? 100  // Default to 100 turns for skill execution
        };
        
        // Configure PromptDriver with the maxTurns setting
        this.promptDriver.setMaxTurns(this.config.maxTurns);
    }
    
    /**
     * Initialize the repository and prompt driver
     */
    async initialize(): Promise<void> {
        await this.promptDriver.initialize();
        await this.repository.loadSkills();
    }
    
    /**
     * Execute all scenarios in a skill sequentially
     * @param skillName The name of the skill to execute
     * @param context Context object to pass to all scenarios
     * @returns SkillExecutionResult with details of all scenario executions
     */
    async executeSkill<TContext = any>(
        skillName: string,
        context: TContext = {} as TContext
    ): Promise<SkillExecutionResult> {
        const startTime = new Date();
        
        // Get skill information
        const skillInfo = this.repository.getSkillInformation(skillName);
        if (!skillInfo || skillInfo.scenarios.length === 0) {
            throw new Error(`Skill not found or has no scenarios: ${skillName}`);
        }
        const scenarios = skillInfo.scenarios;
        
        const result: SkillExecutionResult = {
            skillName,
            totalScenarios: scenarios.length,
            completedScenarios: 0,
            scenarioResults: [],
            success: true,
            startTime,
            endTime: new Date()
        };
        
        // Get actual scenario templates for execution
        const scenarioTemplates = this.repository.getScenarioTemplatesBySkillInternal(skillName);
        
        // Sort scenarios by ID to ensure proper order (HSM.00, HSM.01, etc.)
        const sortedScenarios = [...scenarioTemplates].sort((a, b) => {
            return a.id.localeCompare(b.id);
        });
        
        if (this.config.logProgress) {
            console.log(`Starting skill execution: ${skillName} with ${sortedScenarios.length} scenarios`);
        }
        
        // Important: The PromptDriver will start a session on the first scenario execution
        // and keep it active across all scenarios. This ensures the skill preamble is only
        // sent once at the beginning of the skill execution.
        
        // Execute each scenario in sequence
        for (const scenario of sortedScenarios) {
            if (this.config.logProgress) {
                console.log(`Executing scenario: ${scenario.id} - ${scenario.title}`);
            }
            
            try {
                // Execute the scenario using PromptDriver with configured maxTurns
                const scenarioKey = `${skillName}/${scenario.id}`;
                const flow = this.promptDriver.createSequentialFlow(scenarioKey, context);
                const scenarioResult = await this.promptDriver.executeScenarioFlow(
                    scenarioKey,
                    flow,
                    context,
                    { maxTurns: this.config.maxTurns }
                );
                
                // Record successful execution
                result.scenarioResults.push({
                    scenarioId: scenario.id,
                    scenarioTitle: scenario.title,
                    completed: true,
                    totalTasks: scenarioResult.totalTasks,
                    completedTasks: scenarioResult.completedTasks
                });
                
                if (scenarioResult.completedTasks === scenarioResult.totalTasks) {
                    result.completedScenarios++;
                }
                
                if (this.config.logProgress) {
                    console.log(`Completed scenario: ${scenario.id} (${scenarioResult.completedTasks}/${scenarioResult.totalTasks} tasks)`);
                }
                
            } catch (error) {
                // Record failed execution
                result.scenarioResults.push({
                    scenarioId: scenario.id,
                    scenarioTitle: scenario.title,
                    completed: false,
                    totalTasks: 0,
                    completedTasks: 0,
                    error: error as Error
                });
                
                result.success = false;
                
                if (this.config.logProgress) {
                    console.error(`Failed scenario: ${scenario.id} - ${(error as Error).message}`);
                }
                
                // Stop execution if continueOnError is false
                if (!this.config.continueOnError) {
                    break;
                }
            }
        }
        
        result.endTime = new Date();
        
        // End the session to clean up (optional - the session will be reused if we run another skill)
        // Note: We keep the session active in case we want to run another skill in the same context
        // await this.promptDriver.endSession();
        
        if (this.config.logProgress) {
            const duration = result.endTime.getTime() - result.startTime.getTime();
            console.log(`Skill execution completed: ${result.completedScenarios}/${result.totalScenarios} scenarios in ${duration}ms`);
        }
        
        return result;
    }
    
    /**
     * Execute a single scenario within a skill
     * @param skillName The name of the skill
     * @param scenarioId The ID of the scenario to execute
     * @param context Context object to pass to the scenario
     * @returns Execution result from PromptDriver
     */
    async executeScenario<TContext = any>(
        skillName: string,
        scenarioId: string,
        context: TContext = {} as TContext
    ) {
        const scenarioKey = `${skillName}/${scenarioId}`;
        const flow = this.promptDriver.createSequentialFlow(scenarioKey, context);
        return await this.promptDriver.executeScenarioFlow(scenarioKey, flow, context, { maxTurns: this.config.maxTurns });
    }
    
    /**
     * Get the list of available skill names
     */
    getAvailableSkills(): string[] {
        return this.repository.getSkills();
    }
    
    /**
     * Get scenarios for a specific skill (returns information only, no functions)
     */
    getSkillScenarios(skillName: string): ScenarioInfo[] | undefined {
        const skillInfo = this.repository.getSkillInformation(skillName);
        return skillInfo?.scenarios;
    }
    
    /**
     * Get the PromptDriver instance for direct access if needed
     */
    getPromptDriver(): PromptDriver {
        return this.promptDriver;
    }
}
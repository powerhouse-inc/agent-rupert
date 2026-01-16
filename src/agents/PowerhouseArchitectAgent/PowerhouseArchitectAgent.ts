import { AgentBase, type ILogger, type BaseAgentConfig } from "../AgentBase/AgentBase.js";
import type { PowerhouseArchitectAgentConfig } from "../../types.js";
import type { IAgentBrain } from "../IAgentBrain.js";
import { BrainType, type BrainConfig } from "../BrainFactory.js";
import type { AgentBrainPromptContext } from "../../types/prompt-context.js";

/**
 *  The PowerhouseArchitectAgent creates and manages a variety of architecture-related 
 *  documents, and it delegates tasks to its ReactorPackageAgent and in the future others,
 *  to develop and roll out Powerhouse-based cloud platforms. 
 */
export class PowerhouseArchitectAgent extends AgentBase<IAgentBrain> {
    protected getConfig(): PowerhouseArchitectAgentConfig {
        return this.config as PowerhouseArchitectAgentConfig;
    }
    
    /**
     * Get the brain configuration for PowerhouseArchitectAgent
     * Uses standard brain for simple operations
     */
    static getBrainConfig(apiKey?: string): BrainConfig | null {
        if (!apiKey) return null;
        
        return {
            type: BrainType.STANDARD,  // Use standard brain for simple operations
            apiKey,
            model: 'claude-3-haiku-20240307'
        };
    }
    
    /**
     * Get the prompt template paths for PowerhouseArchitectAgent
     */
    static getSystemPromptTemplatePaths(): string[] {
        return [
            'prompts/agent-profiles/AgentBase.md',
            'prompts/agent-profiles/PowerhouseArchitectAgent.md'
        ];
    }
    
    /**
     * Get the default skill names for PowerhouseArchitectAgent
     */
    static getDefaultSkillNames(): string[] {
        return [
            // No skills assigned yet
        ];
    }
    
    /**
     * Build the prompt context for PowerhouseArchitectAgent
     */
    static buildSystemPromptContext(
        config: BaseAgentConfig,
        serverPort: number,
        mcpServers: string[] = []
    ): AgentBrainPromptContext {
        const baseContext = AgentBase.buildSystemPromptContext(config, serverPort, mcpServers);
        
        return {
            ...baseContext,
            agentType: 'PowerhouseArchitectAgent'
        };
    }
    
    constructor(config: PowerhouseArchitectAgentConfig, logger: ILogger, brain?: IAgentBrain) {
        super(config, logger, brain);
    }
    
    public async initialize(): Promise<void> {
        await super.initialize();
        // Initialize architect-specific resources
        this.logger.info(`${this.config.name}: Architect-specific initialization starting`);
        // TODO: Add architect-specific initialization
        this.logger.info(`${this.config.name}: Architect-specific initialization complete`);
    }
    
    public async shutdown(): Promise<void> {
        // Cleanup architect resources
        this.logger.info(`${this.config.name}: Cleaning up architect resources`);
        // TODO: Add architect-specific cleanup
        await super.shutdown();
    }
    }
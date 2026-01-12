import { AgentBase, type ILogger } from "../AgentBase.js";
import type { PowerhouseArchitectAgentConfig } from "../../types.js";
import type { IAgentBrain } from "../IAgentBrain.js";
import { BrainType, type BrainConfig } from "../BrainFactory.js";
import type { AgentBrainPromptContext } from "../../types/prompt-context.js";

/**
 *  The PowerhouseArchitectAgent creates and manages a variety of architecture-related 
 *  documents, and it delegates tasks to its ReactorPackageAgent and in the future others,
 *  to develop and roll out Powerhouse-based cloud platforms. 
 */
export class PowerhouseArchitectAgent extends AgentBase<PowerhouseArchitectAgentConfig> {
    
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
    static getPromptTemplatePaths(): string[] {
        return [
            'prompts/AgentBase.md',
            'prompts/PowerhouseArchitectAgent.md'
        ];
    }
    
    /**
     * Build the prompt context for PowerhouseArchitectAgent
     */
    static buildPromptContext(
        config: PowerhouseArchitectAgentConfig,
        serverPort: number,
        mcpServers: string[] = []
    ): AgentBrainPromptContext {
        const baseContext = AgentBase.buildPromptContext(config, serverPort, mcpServers);
        
        return {
            ...baseContext,
            agentType: 'PowerhouseArchitectAgent',
            capabilities: [
                'architecture-analysis',
                'blueprint-generation',
                'design-documentation',
                'task-delegation'
            ]
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
    
    // Architect-specific methods
    public async analyzeArchitecture() {
        // TODO: Implement architecture analysis
        throw new Error('analyzeArchitecture not yet implemented');
    }
    
    public async generateBlueprint() {
        // TODO: Implement blueprint generation  
        throw new Error('generateBlueprint not yet implemented');
    }
    
    /**
     * Handle updates to the inbox document
     * This is where architecture requests and feedback arrive
     */
    protected async handleInboxUpdate(_documentId: string, operations: any[]): Promise<void> {
        this.logger.info(`${this.config.name}: Processing inbox update with ${operations.length} operations`);
        
        // Use brain to describe the operations if available
        if (this.brain) {
            try {
                const description = await this.brain.describeInboxOperations(operations);
                this.logger.info(`${this.config.name}: Brain analysis: ${description}`);
            } catch (error) {
                this.logger.warn(`${this.config.name}: Failed to get brain analysis of inbox operations`);
            }
        }
        
        // TODO: Process inbox operations
        // - Extract architecture requests
        // - Process feedback on existing designs
        // - Create architecture tasks in WBS
    }
    
    /**
     * Handle updates to the WBS document
     * This is where architecture work progress is tracked
     */
    protected async handleWbsUpdate(_documentId: string, operations: any[]): Promise<void> {
        this.logger.info(`${this.config.name}: Processing WBS update with ${operations.length} operations`);
        
        // Use brain to describe the operations if available
        if (this.brain) {
            try {
                const description = await this.brain.describeWbsOperations(operations);
                this.logger.info(`${this.config.name}: Brain analysis: ${description}`);
            } catch (error) {
                this.logger.warn(`${this.config.name}: Failed to get brain analysis of WBS operations`);
            }
        }
        
        // TODO: Process WBS operations
        // - Monitor architecture design progress
        // - Coordinate with ReactorPackageAgent for implementation
        // - Update stakeholders on progress
    }
}
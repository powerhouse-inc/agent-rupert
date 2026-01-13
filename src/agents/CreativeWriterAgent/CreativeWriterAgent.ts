import { AgentBase, BaseAgentConfig, type ILogger } from "../AgentBase.js";
import type { IAgentBrain } from "../IAgentBrain.js";
import { BrainType, type BrainConfig } from "../BrainFactory.js";
import type { AgentBrainPromptContext } from "../../types/prompt-context.js";

export interface CreativeWriterConfig extends BaseAgentConfig {
    genre: 'thriller' | 'science-fiction' | 'slice-of-life' | 'horror';
}

/**
 * The CreativeWriterAgent handles creative writing tasks including
 * story creation, character development, and dialogue writing.
 * It can work in different genres based on configuration.
 */
export class CreativeWriterAgent extends AgentBase<CreativeWriterConfig> {
    
    /**
     * Get the brain configuration for CreativeWriterAgent
     * Uses Claude SDK brain for creative tasks
     */
    static getBrainConfig(apiKey?: string): BrainConfig | null {
        if (!apiKey) return null;
        
        return {
            type: BrainType.CLAUDE_SDK,  // Use Claude SDK for creative writing
            apiKey,
            model: 'claude-3-haiku-20240307'
        };
    }
    
    /**
     * Get the prompt template paths for CreativeWriterAgent
     */
    static getPromptTemplatePaths(): string[] {
        return [
            'prompts/agent-profiles/CreativeWriterAgent.md'
        ];
    }
    
    /**
     * Build the prompt context for CreativeWriterAgent
     */
    static buildPromptContext(
        config: CreativeWriterConfig,
        serverPort: number,
        mcpServers: string[] = []
    ): AgentBrainPromptContext {
        const baseContext = AgentBase.buildPromptContext(config, serverPort, mcpServers);
        
        return {
            ...baseContext,
            agentType: 'CreativeWriterAgent',
            genre: config.genre,  // Add genre as a direct property
            capabilities: [
                'creative-writing',
                'story-creation',
                'character-development',
                'dialogue-writing',
                `genre-${config.genre}`
            ]
        };
    }
    
    constructor(config: CreativeWriterConfig, logger: ILogger, brain?: IAgentBrain) {
        super(config, logger, brain);
    }
    
    /**
     * Get the current genre setting
     */
    public getGenre(): string {
        return this.config.genre;
    }
    
    /**
     * Write a creative piece based on a prompt
     */
    public async writeCreativePiece(prompt: string): Promise<string> {
        if (!this.brain?.sendMessage) {
            throw new Error('Brain not initialized or does not support sendMessage');
        }
        
        const genreContext = `Write in the ${this.config.genre} genre.`;
        const fullPrompt = `${genreContext}\n\n${prompt}`;
        
        const result = await this.brain.sendMessage(fullPrompt);
        return result.response;
    }
    
    /**
     * Handle updates to the inbox document
     * This is where creative writing requests and feedback arrive
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
        // - Extract writing requests
        // - Process feedback on stories
        // - Create writing tasks in WBS
    }
    
    /**
     * Handle updates to the WBS document
     * This is where creative writing progress is tracked
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
        // - Monitor writing progress
        // - Track completed stories and chapters
        // - Update stakeholders on progress
    }
}
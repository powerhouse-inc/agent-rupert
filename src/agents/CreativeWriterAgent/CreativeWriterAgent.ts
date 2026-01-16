import { AgentBase, BaseAgentConfig, type ILogger } from "../AgentBase/AgentBase.js";
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
export class CreativeWriterAgent extends AgentBase<IAgentBrain> {
    protected getConfig(): CreativeWriterConfig {
        return this.config as CreativeWriterConfig;
    }
    
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
    static getSystemPromptTemplatePaths(): string[] {
        return [
            'prompts/agent-profiles/CreativeWriterAgent.md'
        ];
    }
    
    /**
     * Get the default skill names for CreativeWriterAgent
     */
    static getDefaultSkillNames(): string[] {
        return [
            'short-story-writing'
        ];
    }
    
    /**
     * Build the prompt context for CreativeWriterAgent
     */
    static buildSystemPromptContext(
        config: BaseAgentConfig,
        serverPort: number,
        mcpServers: string[] = []
    ): AgentBrainPromptContext {
        const baseContext = AgentBase.buildSystemPromptContext(config, serverPort, mcpServers);
        
        return {
            ...baseContext,
            agentType: 'CreativeWriterAgent',
            genre: (config as CreativeWriterConfig).genre  // Add genre as a direct property
        };
    }
    
    constructor(config: CreativeWriterConfig, logger: ILogger, brain?: IAgentBrain) {
        super(config, logger, brain);
    }
    
    /**
     * Get the current genre setting
     */
    public getGenre(): string {
        return this.getConfig().genre;
    }
}
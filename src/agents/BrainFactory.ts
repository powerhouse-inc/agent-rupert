import { IAgentBrain, IBrainLogger } from './IAgentBrain.js';
import { AgentBrain } from './AgentBrain.js';
import { AgentClaudeBrain } from './AgentClaudeBrain.js';
import { PromptParser } from '../utils/PromptParser.js';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Brain type enumeration
 */
export enum BrainType {
    STANDARD = 'standard',    // Uses @anthropic-ai/sdk
    CLAUDE_SDK = 'claude-sdk' // Uses @anthropic-ai/claude-agent-sdk (future)
}

/**
 * Configuration for creating brain instances
 */
export interface BrainConfig {
    type: BrainType;
    apiKey: string;
    
    // Standard brain config
    model?: string;
    
    // Claude SDK brain config
    agentManagerMcpUrl?: string;
    workingDirectory?: string;
    allowedTools?: string[];
    fileSystemPaths?: {
        allowedReadPaths?: string[];
        allowedWritePaths?: string[];
    };
    maxTurns?: number;
}

/**
 * Factory class for creating brain instances
 */
export class BrainFactory {
    /**
     * Create a brain instance based on configuration
     * @param config Brain configuration
     * @param logger Optional logger for brain initialization
     * @param promptTemplatePaths Optional paths to prompt template files
     * @param promptContext Optional context data for prompt templates
     * @returns Promise<IAgentBrain> instance
     */
    static async create<TContext = any>(
        config: BrainConfig, 
        logger?: IBrainLogger,
        promptTemplatePaths?: string[],
        promptContext?: TContext
    ): Promise<IAgentBrain> {
        let brain: IAgentBrain;
        
        switch (config.type) {
            case BrainType.STANDARD:
                const anthropic = new Anthropic({ apiKey: config.apiKey });
                brain = new AgentBrain(anthropic);
                if (logger) {
                    brain.setLogger(logger);
                }
                break;
            
            case BrainType.CLAUDE_SDK:
                brain = new AgentClaudeBrain({
                    apiKey: config.apiKey,
                    agentManagerMcpUrl: config.agentManagerMcpUrl,
                    workingDirectory: config.workingDirectory || './agent-workspace',
                    allowedTools: config.allowedTools,
                    fileSystemPaths: config.fileSystemPaths,
                    model: config.model as any,
                    maxTurns: config.maxTurns
                }, logger);
                break;
            
            default:
                throw new Error(`Unknown brain type: ${config.type}`);
        }
        
        // If prompt templates are provided, parse and set system prompt
        if (promptTemplatePaths && promptTemplatePaths.length > 0 && promptContext) {
            const parser = new PromptParser<TContext>();
            const systemPrompt = await parser.parseMultiple(promptTemplatePaths, promptContext);
            if (brain.setSystemPrompt) {
                // Extract agent name from context if available
                const agentName = (promptContext as any).agentName;
                brain.setSystemPrompt(systemPrompt, agentName);
            }
        }
        
        return brain;
    }
}
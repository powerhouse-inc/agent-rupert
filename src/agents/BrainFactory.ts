import { IAgentBrain, IBrainLogger } from './IAgentBrain.js';
import { AgentBrain } from './AgentBrain.js';
import { AgentClaudeBrain } from './AgentClaudeBrain.js';
import { PromptParser } from '../utils/PromptParser.js';
import { MarkdownClaudeLogger } from '../logging/MarkdownClaudeLogger.js';
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
     * @param systemPromptTemplatePaths Optional paths to prompt template files
     * @param systemPromptContext Optional context data for prompt templates
     * @returns Promise<IAgentBrain> instance
     */
    static async create<TContext = any>(
        config: BrainConfig, 
        logger?: IBrainLogger,
        systemPromptTemplatePaths?: string[],
        systemPromptContext?: TContext
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
                // Create Claude logger for session tracking
                const claudeLogger = new MarkdownClaudeLogger();
                
                brain = new AgentClaudeBrain({
                    apiKey: config.apiKey,
                    agentManagerMcpUrl: config.agentManagerMcpUrl,
                    workingDirectory: config.workingDirectory || '../projects',
                    allowedTools: config.allowedTools,
                    fileSystemPaths: config.fileSystemPaths,
                    model: config.model as any,
                    maxTurns: config.maxTurns
                }, logger, claudeLogger);
                break;
            
            default:
                throw new Error(`Unknown brain type: ${config.type}`);
        }
        
        // If prompt templates are provided, parse and set system prompt
        if (systemPromptTemplatePaths && systemPromptTemplatePaths.length > 0 && systemPromptContext) {
            const parser = new PromptParser<TContext>();
            const systemPrompt = await parser.parseMultiple(systemPromptTemplatePaths, systemPromptContext);
            if (brain.setSystemPrompt) {
                // Extract agent name from context if available
                const agentName = (systemPromptContext as any).agentName;
                brain.setSystemPrompt(systemPrompt, agentName);
            }
        }
        
        return brain;
    }
}
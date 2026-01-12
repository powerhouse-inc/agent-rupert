import { IAgentBrain, IBrainLogger } from './IAgentBrain.js';
import { AgentBrain } from './AgentBrain.js';
import { AgentClaudeBrain } from './AgentClaudeBrain.js';
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
     * @returns IAgentBrain instance
     */
    static create(config: BrainConfig, logger?: IBrainLogger): IAgentBrain {
        switch (config.type) {
            case BrainType.STANDARD:
                const anthropic = new Anthropic({ apiKey: config.apiKey });
                const standardBrain = new AgentBrain(anthropic);
                if (logger) {
                    standardBrain.setLogger(logger);
                }
                return standardBrain;
            
            case BrainType.CLAUDE_SDK:
                return new AgentClaudeBrain({
                    apiKey: config.apiKey,
                    agentManagerMcpUrl: config.agentManagerMcpUrl,
                    workingDirectory: config.workingDirectory || './agent-workspace',
                    allowedTools: config.allowedTools,
                    fileSystemPaths: config.fileSystemPaths,
                    model: config.model as any,
                    maxTurns: config.maxTurns
                }, logger);
            
            default:
                throw new Error(`Unknown brain type: ${config.type}`);
        }
    }
}
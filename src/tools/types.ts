import type { z } from 'zod';
import type { AgentBase } from '../agents/AgentBase.js';
import type { IAgentBrain } from '../agents/IAgentBrain.js';
import type { ILogger } from '../agents/AgentBase.js';

/**
 * Tool category for organization and permission management
 */
export type ToolCategory = 'system' | 'project' | 'mcp' | 'custom';

/**
 * Tool execution result
 */
export interface ToolResult {
    success: boolean;
    data?: any;
    error?: ToolError;
    metadata?: ExecutionMetadata;
}

/**
 * Tool error information
 */
export interface ToolError {
    code: string;
    message: string;
    details?: any;
    stack?: string;
}

/**
 * Execution metadata for tracking and debugging
 */
export interface ExecutionMetadata {
    startTime: Date;
    endTime: Date;
    duration: number;
    toolName: string;
    toolCategory: ToolCategory;
    agentName: string;
}

/**
 * Tool permissions for access control
 */
export interface ToolPermissions {
    requiresApproval?: boolean;
    allowedAgents?: string[];
    deniedAgents?: string[];
    maxExecutionsPerMinute?: number;
    requiresAuthentication?: boolean;
}

/**
 * Context provided to tools during execution
 */
export interface ToolContext {
    agent: AgentBase<any>;
    brain: IAgentBrain;
    logger: ILogger;
    permissions: ToolPermissions;
    metadata: Partial<ExecutionMetadata>;
}

/**
 * Base interface for all Claude agent tools
 */
export interface ClaudeAgentTool {
    /**
     * Unique name for the tool
     */
    name: string;
    
    /**
     * Human-readable description of what the tool does
     */
    description: string;
    
    /**
     * Category for organization and permissions
     */
    category: ToolCategory;
    
    /**
     * Zod schema for input validation
     */
    schema: z.ZodSchema;
    
    /**
     * Execute the tool with validated arguments
     */
    execute: (args: any, context: ToolContext) => Promise<ToolResult>;
    
    /**
     * Optional permissions for this tool
     */
    permissions?: ToolPermissions;
    
    /**
     * Optional examples of tool usage
     */
    examples?: ToolExample[];
}

/**
 * Example of tool usage for documentation
 */
export interface ToolExample {
    description: string;
    input: any;
    expectedOutput?: any;
}

/**
 * Tool registration options
 */
export interface ToolRegistrationOptions {
    override?: boolean;
    validateSchema?: boolean;
    autoRegisterMcp?: boolean;
}

/**
 * MCP tool configuration
 */
export interface McpToolConfig {
    serverName: string;
    toolName: string;
    mcpSchema?: any; // MCP-specific schema format
}

/**
 * Factory function type for creating tools
 */
export type ToolFactory<T = any> = (config: T) => ClaudeAgentTool;
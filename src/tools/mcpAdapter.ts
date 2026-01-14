/**
 * MCP Adapter for Tool Infrastructure
 * Converts ClaudeAgentTool to MCP format for SDK integration
 */

import { z } from 'zod';
import type { ClaudeAgentTool, ToolContext, ToolResult } from './types.js';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { ILogger } from '../agents/AgentBase.js';

/**
 * Convert a Zod schema to MCP-compatible format
 * The SDK's tool() function expects Zod schemas directly
 */
export function adaptSchemaToMcp(schema: z.ZodSchema): z.ZodSchema {
    // The SDK already uses Zod, so we can pass through directly
    return schema;
}

/**
 * Adapt a ClaudeAgentTool to MCP tool format
 * Creates an SDK-compatible tool definition
 */
export function adaptToolToMcp(
    toolDef: ClaudeAgentTool,
    context?: ToolContext
) {
    // The SDK expects an object with named parameters
    // If the schema is already an object, use it directly
    // Otherwise, wrap it in an object with a single 'input' parameter
    const paramsSchema = toolDef.schema instanceof z.ZodObject 
        ? toolDef.schema.shape
        : { input: toolDef.schema };
    
    return tool(
        toolDef.name,
        toolDef.description,
        paramsSchema as any,
        async (args: any) => {
            try {
                // If no context provided, we can't execute tools that require it
                if (!context) {
                    throw new Error('Tool context is required for MCP adapter');
                }
                
                // Execute the tool with provided context
                const result = await toolDef.execute(args, context);

                // Convert ToolResult to MCP response format
                return {
                    content: [{
                        type: 'text' as const,
                        text: typeof result.data === 'string' 
                            ? result.data 
                            : JSON.stringify(result.data, null, 2)
                    }]
                };
            } catch (error) {
                // Handle errors in MCP format
                const errorMessage = error instanceof Error 
                    ? error.message 
                    : 'Unknown error occurred';
                
                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify({
                            error: true,
                            message: errorMessage
                        })
                    }]
                };
            }
        }
    );
}

/**
 * Create a collection of MCP tools from ClaudeAgentTool definitions
 */
export function createMcpToolCollection(
    tools: ClaudeAgentTool[],
    context?: ToolContext
) {
    return tools.map(tool => adaptToolToMcp(tool, context));
}

/**
 * Helper to build an MCP server configuration from tool registry
 */
export interface McpServerConfig {
    name: string;
    version: string;
    tools: ClaudeAgentTool[];
    context?: ToolContext;
    logger?: ILogger;
}

/**
 * Build MCP server tools from configuration
 * This prepares tools for use with createSdkMcpServer
 * Note: Context must be provided if tools require it
 */
export function buildMcpServerTools(config: McpServerConfig) {
    config.logger?.info(`Building MCP server tools for ${config.name}`);
    
    const mcpTools = createMcpToolCollection(config.tools, config.context);
    
    config.logger?.info(`Created ${mcpTools.length} MCP tools for ${config.name}`);
    
    return mcpTools;
}
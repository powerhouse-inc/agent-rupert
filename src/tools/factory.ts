import { z } from 'zod';
import { ClaudeAgentToolBase } from './claudeAgentToolBase.js';
import type { 
    ClaudeAgentTool, 
    ToolCategory, 
    ToolContext,
    ToolPermissions,
    ToolExample,
    McpToolConfig 
} from './types.js';

/**
 * Configuration for creating a simple tool
 */
export interface SimpleToolConfig {
    name: string;
    description: string;
    category: ToolCategory;
    schema: z.ZodSchema;
    handler: (args: any, context: ToolContext) => Promise<any>;
    permissions?: ToolPermissions;
    examples?: ToolExample[];
}

/**
 * Simple tool implementation using the factory pattern
 */
class SimpleTool extends ClaudeAgentToolBase {
    name: string;
    description: string;
    category: ToolCategory;
    schema: z.ZodSchema;
    permissions?: ToolPermissions;
    examples?: ToolExample[];
    private handler: (args: any, context: ToolContext) => Promise<any>;
    
    constructor(config: SimpleToolConfig) {
        super();
        this.name = config.name;
        this.description = config.description;
        this.category = config.category;
        this.schema = config.schema;
        this.handler = config.handler;
        this.permissions = config.permissions;
        this.examples = config.examples;
    }
    
    protected async executeInternal(args: any, context: ToolContext): Promise<any> {
        return this.handler(args, context);
    }
}

/**
 * Create a generic tool with custom handler
 */
export function createTool(config: SimpleToolConfig): ClaudeAgentTool {
    return new SimpleTool(config);
}

/**
 * Create an MCP-specific tool
 */
export function createMcpTool(
    mcpConfig: McpToolConfig,
    handler: (args: any, context: ToolContext) => Promise<any>,
    schema: z.ZodSchema,
    permissions?: ToolPermissions
): ClaudeAgentTool {
    return createTool({
        name: `mcp_${mcpConfig.serverName}_${mcpConfig.toolName}`,
        description: `MCP tool: ${mcpConfig.toolName} from server ${mcpConfig.serverName}`,
        category: 'mcp',
        schema,
        handler,
        permissions
    });
}

/**
 * Create a project management tool
 */
export function createProjectTool(
    name: string,
    description: string,
    schema: z.ZodSchema,
    handler: (args: any, context: ToolContext) => Promise<any>,
    permissions?: ToolPermissions
): ClaudeAgentTool {
    return createTool({
        name: `project_${name}`,
        description,
        category: 'project',
        schema,
        handler,
        permissions
    });
}

/**
 * Create a system tool
 */
export function createSystemTool(
    name: string,
    description: string,
    schema: z.ZodSchema,
    handler: (args: any, context: ToolContext) => Promise<any>,
    permissions?: ToolPermissions
): ClaudeAgentTool {
    return createTool({
        name: `system_${name}`,
        description,
        category: 'system',
        schema,
        handler,
        permissions: permissions ? {
            requiresApproval: true,
            ...permissions
        } : {
            requiresApproval: true
        }
    });
}

/**
 * Helper function to create a tool from a class that extends ClaudeAgentToolBase
 */
export function instantiateTool<T extends ClaudeAgentToolBase>(
    ToolClass: new (...args: any[]) => T,
    ...args: any[]
): T {
    return new ToolClass(...args);
}

/**
 * Create a batch of tools from configurations
 */
export function createToolBatch(configs: SimpleToolConfig[]): ClaudeAgentTool[] {
    return configs.map(config => createTool(config));
}

/**
 * Validation helper for tool names
 */
export function validateToolName(name: string): boolean {
    // Tool names should be lowercase with underscores
    const pattern = /^[a-z][a-z0-9_]*$/;
    return pattern.test(name);
}

/**
 * Create a tool with automatic retry logic
 */
export function createRetryableTool(
    config: SimpleToolConfig,
    maxRetries: number = 3,
    retryDelay: number = 1000
): ClaudeAgentTool {
    const originalHandler = config.handler;
    
    const retryHandler = async (args: any, context: ToolContext): Promise<any> => {
        let lastError: any;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await originalHandler(args, context);
            } catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    context.logger.warn(`Tool ${config.name} attempt ${attempt} failed, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }
        
        throw lastError;
    };
    
    return createTool({
        name: config.name,
        description: config.description,
        category: config.category,
        schema: config.schema,
        handler: retryHandler,
        permissions: config.permissions,
        examples: config.examples
    });
}

/**
 * Create a tool with caching capabilities
 */
export function createCachedTool(
    config: SimpleToolConfig,
    cacheKey: (args: any) => string,
    cacheTTL: number = 60000 // 1 minute default
): ClaudeAgentTool {
    const cache = new Map<string, { data: any; timestamp: number }>();
    const originalHandler = config.handler;
    
    const cachedHandler = async (args: any, context: ToolContext): Promise<any> => {
        const key = cacheKey(args);
        const cached = cache.get(key);
        
        if (cached && Date.now() - cached.timestamp < cacheTTL) {
            context.logger.debug(`Tool ${config.name} returning cached result for key: ${key}`);
            return cached.data;
        }
        
        const result = await originalHandler(args, context);
        cache.set(key, { data: result, timestamp: Date.now() });
        
        // Clean up old cache entries
        for (const [k, v] of cache.entries()) {
            if (Date.now() - v.timestamp > cacheTTL) {
                cache.delete(k);
            }
        }
        
        return result;
    };
    
    return createTool({
        name: config.name,
        description: config.description,
        category: config.category,
        schema: config.schema,
        handler: cachedHandler,
        permissions: config.permissions,
        examples: config.examples
    });
}
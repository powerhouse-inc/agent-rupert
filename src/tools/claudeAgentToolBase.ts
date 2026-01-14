import { z } from 'zod';
import type { 
    ClaudeAgentTool, 
    ToolResult, 
    ToolError, 
    ToolContext, 
    ToolCategory, 
    ToolPermissions,
    ToolExample,
    ExecutionMetadata 
} from './types.js';

/**
 * Abstract base class for Claude agent tools
 * Provides common functionality like validation, error handling, and logging
 */
export abstract class ClaudeAgentToolBase implements ClaudeAgentTool {
    /**
     * Unique name for the tool
     */
    abstract name: string;
    
    /**
     * Human-readable description
     */
    abstract description: string;
    
    /**
     * Tool category for organization
     */
    abstract category: ToolCategory;
    
    /**
     * Zod schema for input validation
     */
    abstract schema: z.ZodSchema;
    
    /**
     * Optional permissions
     */
    permissions?: ToolPermissions;
    
    /**
     * Optional usage examples
     */
    examples?: ToolExample[];
    
    /**
     * Internal execution logic to be implemented by subclasses
     */
    protected abstract executeInternal(args: any, context: ToolContext): Promise<any>;
    
    /**
     * Execute the tool with validation and error handling
     */
    async execute(args: any, context: ToolContext): Promise<ToolResult> {
        const startTime = new Date();
        const metadata: ExecutionMetadata = {
            startTime,
            endTime: new Date(),
            duration: 0,
            toolName: this.name,
            toolCategory: this.category,
            agentName: context.agent.getName()
        };
        
        try {
            // Log execution start
            context.logger.debug(`[Tool:${this.name}] Execution started by ${context.agent.getName()}`);
            
            // Validate permissions
            this.validatePermissions(context);
            
            // Validate input against schema
            const validatedArgs = await this.validateInput(args, context);
            
            // Execute the tool's internal logic
            const result = await this.executeInternal(validatedArgs, context);
            
            // Calculate execution time
            metadata.endTime = new Date();
            metadata.duration = metadata.endTime.getTime() - metadata.startTime.getTime();
            
            // Log success
            context.logger.debug(`[Tool:${this.name}] Execution completed in ${metadata.duration}ms`);
            
            return {
                success: true,
                data: result,
                metadata
            };
            
        } catch (error) {
            // Calculate execution time even for errors
            metadata.endTime = new Date();
            metadata.duration = metadata.endTime.getTime() - metadata.startTime.getTime();
            
            // Create tool error
            const toolError: ToolError = this.createToolError(error);
            
            // Log error
            context.logger.error(`[Tool:${this.name}] Execution failed: ${toolError.message}`);
            
            return {
                success: false,
                error: toolError,
                metadata
            };
        }
    }
    
    /**
     * Validate input arguments against the tool's schema
     */
    protected async validateInput(args: any, context: ToolContext): Promise<any> {
        try {
            // Parse and validate using Zod schema
            const validated = await this.schema.parseAsync(args);
            context.logger.debug(`[Tool:${this.name}] Input validation successful`);
            return validated;
        } catch (error) {
            if (error instanceof z.ZodError) {
                const issues = error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ');
                throw new Error(`Validation failed: ${issues}`);
            }
            throw error;
        }
    }
    
    /**
     * Validate permissions for tool execution
     */
    protected validatePermissions(context: ToolContext): void {
        if (!this.permissions) return;
        
        const agentName = context.agent.getName();
        
        // Check denied agents
        if (this.permissions.deniedAgents?.includes(agentName)) {
            throw new Error(`Agent '${agentName}' is not allowed to use tool '${this.name}'`);
        }
        
        // Check allowed agents (if specified, only those agents can use it)
        if (this.permissions.allowedAgents && !this.permissions.allowedAgents.includes(agentName)) {
            throw new Error(`Agent '${agentName}' is not in the allowed list for tool '${this.name}'`);
        }
        
        // Check if approval is required
        if (this.permissions.requiresApproval) {
            context.logger.warn(`[Tool:${this.name}] This tool requires approval (not implemented yet)`);
        }
        
        // Check rate limiting (simplified - real implementation would track actual usage)
        if (this.permissions.maxExecutionsPerMinute) {
            context.logger.debug(`[Tool:${this.name}] Rate limit: ${this.permissions.maxExecutionsPerMinute}/min`);
        }
    }
    
    /**
     * Create a standardized tool error from any error type
     */
    protected createToolError(error: any): ToolError {
        if (error instanceof Error) {
            return {
                code: 'TOOL_EXECUTION_ERROR',
                message: error.message,
                stack: error.stack,
                details: {
                    toolName: this.name,
                    toolCategory: this.category
                }
            };
        }
        
        return {
            code: 'UNKNOWN_ERROR',
            message: String(error),
            details: {
                toolName: this.name,
                toolCategory: this.category,
                rawError: error
            }
        };
    }
    
    /**
     * Get a formatted description including examples if available
     */
    getFullDescription(): string {
        let desc = this.description;
        
        if (this.examples && this.examples.length > 0) {
            desc += '\n\nExamples:';
            for (const example of this.examples) {
                desc += `\n- ${example.description}`;
                if (example.expectedOutput !== undefined) {
                    desc += ` � ${JSON.stringify(example.expectedOutput)}`;
                }
            }
        }
        
        return desc;
    }
    
    /**
     * Convert the tool to MCP format for SDK registration
     */
    toMcpFormat(): any {
        // This will be implemented when integrating with Claude SDK's MCP server
        return {
            name: this.name,
            description: this.description,
            inputSchema: this.schema,
            // Additional MCP-specific fields will be added here
        };
    }
}
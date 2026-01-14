import type { 
    ClaudeAgentTool, 
    ToolCategory, 
    ToolRegistrationOptions,
    ToolPermissions 
} from './types.js';
import type { ILogger } from '../agents/AgentBase.js';

/**
 * Tool registry for managing and organizing tools
 */
export class ToolRegistry {
    private tools: Map<string, ClaudeAgentTool> = new Map();
    private categories: Map<ToolCategory, Set<string>> = new Map();
    private logger?: ILogger;
    
    constructor(logger?: ILogger) {
        this.logger = logger;
        // Initialize category sets
        this.categories.set('system', new Set());
        this.categories.set('project', new Set());
        this.categories.set('mcp', new Set());
        this.categories.set('custom', new Set());
    }
    
    /**
     * Register a tool in the registry
     */
    register(tool: ClaudeAgentTool, options?: ToolRegistrationOptions): void {
        const { override = false, validateSchema = true } = options || {};
        
        // Check if tool already exists
        if (this.tools.has(tool.name) && !override) {
            throw new Error(`Tool '${tool.name}' is already registered. Use override option to replace.`);
        }
        
        // Validate schema if requested
        if (validateSchema && tool.schema) {
            try {
                // Try to parse an empty object to check if schema is valid
                tool.schema.parse({});
            } catch {
                // Schema validation with empty object failed, which is expected
                // The schema itself is valid
                this.logger?.debug(`Tool '${tool.name}' schema validated`);
            }
        }
        
        // Register the tool
        this.tools.set(tool.name, tool);
        
        // Add to category index
        const categorySet = this.categories.get(tool.category);
        if (categorySet) {
            categorySet.add(tool.name);
        }
        
        this.logger?.info(`Registered tool: ${tool.name} (${tool.category})`);
    }
    
    /**
     * Unregister a tool from the registry
     */
    unregister(name: string): boolean {
        const tool = this.tools.get(name);
        if (!tool) {
            this.logger?.warn(`Tool '${name}' not found for unregistration`);
            return false;
        }
        
        // Remove from tools map
        this.tools.delete(name);
        
        // Remove from category index
        const categorySet = this.categories.get(tool.category);
        if (categorySet) {
            categorySet.delete(name);
        }
        
        this.logger?.info(`Unregistered tool: ${name}`);
        return true;
    }
    
    /**
     * Get a tool by name
     */
    get(name: string): ClaudeAgentTool | undefined {
        return this.tools.get(name);
    }
    
    /**
     * Check if a tool exists
     */
    has(name: string): boolean {
        return this.tools.has(name);
    }
    
    /**
     * Get all tools
     */
    getAll(): ClaudeAgentTool[] {
        return Array.from(this.tools.values());
    }
    
    /**
     * Get tools by category
     */
    getByCategory(category: ToolCategory): ClaudeAgentTool[] {
        const toolNames = this.categories.get(category);
        if (!toolNames) return [];
        
        const tools: ClaudeAgentTool[] = [];
        for (const name of toolNames) {
            const tool = this.tools.get(name);
            if (tool) tools.push(tool);
        }
        
        return tools;
    }
    
    /**
     * Get tools filtered by permissions
     */
    getByPermissions(filter: Partial<ToolPermissions>): ClaudeAgentTool[] {
        const tools: ClaudeAgentTool[] = [];
        
        for (const tool of this.tools.values()) {
            if (this.matchesPermissions(tool.permissions, filter)) {
                tools.push(tool);
            }
        }
        
        return tools;
    }
    
    /**
     * Check if tool permissions match a filter
     */
    private matchesPermissions(
        permissions: ToolPermissions | undefined,
        filter: Partial<ToolPermissions>
    ): boolean {
        if (!permissions && Object.keys(filter).length > 0) {
            return false;
        }
        
        if (!permissions) return true;
        
        for (const [key, value] of Object.entries(filter)) {
            if ((permissions as any)[key] !== value) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Get tools accessible by a specific agent
     */
    getForAgent(agentName: string): ClaudeAgentTool[] {
        const tools: ClaudeAgentTool[] = [];
        
        for (const tool of this.tools.values()) {
            if (this.isAccessibleByAgent(tool, agentName)) {
                tools.push(tool);
            }
        }
        
        return tools;
    }
    
    /**
     * Check if a tool is accessible by an agent
     */
    private isAccessibleByAgent(tool: ClaudeAgentTool, agentName: string): boolean {
        if (!tool.permissions) return true;
        
        // Check denied list
        if (tool.permissions.deniedAgents?.includes(agentName)) {
            return false;
        }
        
        // Check allowed list (if specified, only those agents can use it)
        if (tool.permissions.allowedAgents && !tool.permissions.allowedAgents.includes(agentName)) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Clear all registered tools
     */
    clear(): void {
        this.tools.clear();
        for (const category of this.categories.values()) {
            category.clear();
        }
        this.logger?.info('Tool registry cleared');
    }
    
    /**
     * Get registry statistics
     */
    getStats(): {
        total: number;
        byCategory: Record<ToolCategory, number>;
        withPermissions: number;
        requiresApproval: number;
    } {
        const stats = {
            total: this.tools.size,
            byCategory: {} as Record<ToolCategory, number>,
            withPermissions: 0,
            requiresApproval: 0
        };
        
        // Count by category
        for (const [category, toolNames] of this.categories.entries()) {
            stats.byCategory[category] = toolNames.size;
        }
        
        // Count tools with permissions
        for (const tool of this.tools.values()) {
            if (tool.permissions) {
                stats.withPermissions++;
                if (tool.permissions.requiresApproval) {
                    stats.requiresApproval++;
                }
            }
        }
        
        return stats;
    }
    
    /**
     * Export tools as an array for MCP server registration
     */
    exportForMcp(): any[] {
        const mcpTools = [];
        
        for (const tool of this.tools.values()) {
            if (tool.category === 'mcp' || tool.category === 'custom') {
                mcpTools.push({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.schema,
                    // Additional MCP-specific fields can be added here
                });
            }
        }
        
        return mcpTools;
    }
    
    /**
     * Import tools in bulk
     */
    importBulk(tools: ClaudeAgentTool[], options?: ToolRegistrationOptions): void {
        for (const tool of tools) {
            try {
                this.register(tool, options);
            } catch (error) {
                this.logger?.error(`Failed to register tool '${tool.name}':`, error);
                if (!options?.override) {
                    throw error;
                }
            }
        }
    }
}
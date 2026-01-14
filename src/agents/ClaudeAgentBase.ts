import { AgentBase } from './AgentBase.js';
import { AgentClaudeBrain } from './AgentClaudeBrain.js';
import type { ILogger } from './AgentBase.js';
import type { BaseAgentConfig } from '../types.js';
import type { BrainConfig } from './BrainFactory.js';
import { ToolRegistry } from '../tools/registry.js';
import type { ClaudeAgentTool, ToolContext } from '../tools/types.js';

/**
 * Base class for agents that use Claude as their brain.
 * Extends AgentBase with AgentClaudeBrain as the brain type.
 * Provides tool registration and management capabilities.
 */
export abstract class ClaudeAgentBase extends AgentBase<AgentClaudeBrain> {
    protected toolRegistry: ToolRegistry;
    
    constructor(config: BaseAgentConfig, logger: ILogger, brain?: AgentClaudeBrain) {
        super(config, logger, brain);
        this.toolRegistry = new ToolRegistry(logger);
    }
    
    /**
     * Create a Claude brain instance
     * Subclasses should override to customize brain configuration
     */
    protected createBrain(config: BrainConfig): AgentClaudeBrain | null {
        if (!config.apiKey) {
            this.logger.warn(`${this.config.name}: No API key provided, brain will not be created`);
            return null;
        }
        
        // Default implementation - subclasses can override for customization
        return new AgentClaudeBrain({
            apiKey: config.apiKey,
            workingDirectory: config.workingDirectory || './agent-workspace',
            model: (config.model || 'haiku') as 'opus' | 'sonnet' | 'haiku',
            maxTurns: config.maxTurns || 100,
            allowedTools: config.allowedTools,
            fileSystemPaths: config.fileSystemPaths
        }, this.logger);
    }
    
    /**
     * Register a tool that the agent can use
     * @param tool The tool to register
     * @param override Whether to override existing tool
     */
    protected registerTool(tool: ClaudeAgentTool, override: boolean = false): void {
        this.toolRegistry.register(tool, { override });
        this.logger.debug(`${this.config.name}: Registered tool '${tool.name}'`);
        
        // TODO: In Phase 3, this will also register the tool with the MCP server
    }
    
    /**
     * Unregister a tool
     * @param name The name of the tool to unregister
     */
    protected unregisterTool(name: string): void {
        const success = this.toolRegistry.unregister(name);
        if (success) {
            this.logger.debug(`${this.config.name}: Unregistered tool '${name}'`);
        }
        
        // TODO: In Phase 3, this will also unregister the tool from the MCP server
    }
    
    /**
     * Get all registered tools
     * @returns Array of registered tools
     */
    protected getRegisteredTools(): ClaudeAgentTool[] {
        return this.toolRegistry.getAll();
    }
    
    /**
     * Get a specific registered tool by name
     * @param name The name of the tool
     * @returns The tool if found, undefined otherwise
     */
    protected getTool(name: string): ClaudeAgentTool | undefined {
        return this.toolRegistry.get(name);
    }
    
    /**
     * Get tools accessible by this agent
     * @returns Array of tools this agent can use
     */
    protected getAccessibleTools(): ClaudeAgentTool[] {
        return this.toolRegistry.getForAgent(this.config.name);
    }
    
    /**
     * Register tools for this agent
     * Called during initialization after brain is created
     * Subclasses should override to register their specific tools
     */
    protected registerTools(): void {
        // Base implementation can register common tools
        // Subclasses will override and call super.registerTools() to add their own
        this.logger.debug(`${this.config.name}: Base tool registration (no default tools)`);
    }
    
    /**
     * Clean up tools before shutdown
     * Called during agent shutdown
     */
    protected cleanupTools(): void {
        const stats = this.toolRegistry.getStats();
        this.logger.debug(`${this.config.name}: Cleaning up ${stats.total} tools`);
        this.toolRegistry.clear();
    }
    
    /**
     * Initialize the agent - extends base initialization with tool registration
     */
    public async initialize(): Promise<void> {
        await super.initialize();
        
        // Register tools after reactor is initialized
        this.registerTools();
        const stats = this.toolRegistry.getStats();
        this.logger.info(`${this.config.name}: Registered ${stats.total} tools`);
    }
    
    /**
     * Shutdown the agent - extends base shutdown with tool cleanup
     */
    public async shutdown(): Promise<void> {
        this.cleanupTools();
        await super.shutdown();
    }
    
    /**
     * Execute a tool by name
     * @param toolName The name of the tool to execute
     * @param args Arguments to pass to the tool
     * @returns The result of the tool execution
     */
    public async executeTool(toolName: string, args: any): Promise<any> {
        const tool = this.getTool(toolName);
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found`);
        }
        
        // Create tool context
        const context: ToolContext = {
            agent: this,
            brain: this.brain!,
            logger: this.logger,
            permissions: tool.permissions || {},
            metadata: {
                toolName,
                toolCategory: tool.category,
                agentName: this.config.name
            }
        };
        
        this.logger.debug(`${this.config.name}: Executing tool '${toolName}'`);
        const result = await tool.execute(args, context);
        
        if (result.success) {
            this.logger.debug(`${this.config.name}: Tool '${toolName}' executed successfully`);
            return result.data;
        } else {
            this.logger.error(`${this.config.name}: Tool '${toolName}' execution failed`, result.error);
            throw new Error(result.error?.message || 'Tool execution failed');
        }
    }
}
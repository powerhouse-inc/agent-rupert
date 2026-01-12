import { query } from '@anthropic-ai/claude-agent-sdk';
import type { HookJSONOutput, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { IAgentBrain, IBrainLogger } from './IAgentBrain.js';
import * as path from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const WRITE_PROMPT_TO_FILE = true;

/**
 * Configuration for AgentClaudeBrain
 */
export interface AgentClaudeBrainConfig {
    apiKey: string;
    agentManagerMcpUrl?: string;  // Optional MCP server URL from agent manager
    workingDirectory: string;
    allowedTools?: string[];
    fileSystemPaths?: {
        allowedReadPaths?: string[];
        allowedWritePaths?: string[];
    };
    model?: 'opus' | 'sonnet' | 'haiku';
    maxTurns?: number;
}

/**
 * MCP Server configuration
 */
export interface McpServerConfig {
    type: 'http' | 'stdio' | 'sse';
    url?: string;
    command?: string;
    args?: string[];
    headers?: Record<string, string>;
}

/**
 * Brain implementation using Claude Agent SDK with MCP server support
 */
export class AgentClaudeBrain implements IAgentBrain {
    private config: AgentClaudeBrainConfig;
    private mcpServers: Map<string, McpServerConfig> = new Map();
    private logger?: IBrainLogger;
    private systemPrompt?: string;

    constructor(config: AgentClaudeBrainConfig, logger?: IBrainLogger) {
        this.config = config;
        this.logger = logger;
        
        // Set API key for the SDK
        process.env.ANTHROPIC_API_KEY = config.apiKey;
        
        if (this.logger) {
            this.logger.debug(`   AgentClaudeBrain: Initializing with model: ${config.model || 'haiku'}, working directory: ${config.workingDirectory}`);
        }
        
        // Add agent manager MCP server if provided
        if (config.agentManagerMcpUrl) {
            this.addMcpServer('agent-manager-drive', {
                type: 'http',
                url: config.agentManagerMcpUrl,
                headers: {}
            });
        }
    }

    /**
     * Set the logger for this brain implementation
     */
    public setLogger(logger: IBrainLogger): void {
        this.logger = logger;
        if (this.logger) {
            this.logger.debug(`   AgentClaudeBrain: Logger updated`);
        }
    }

    /**
     * Set the system prompt for this brain
     */
    public setSystemPrompt(prompt: string, agentName?: string): void {
        this.systemPrompt = prompt;
        if (this.logger) {
            this.logger.debug(`   AgentClaudeBrain: System prompt set (${prompt.length} chars)`);
        }
        
        if (WRITE_PROMPT_TO_FILE) {
            try {
                const promptsDir = path.join(process.cwd(), 'tmp', 'prompts');
                mkdirSync(promptsDir, { recursive: true });
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const agentPart = agentName ? `_${agentName.replace(/\s+/g, '')}` : '';
                const filename = path.join(promptsDir, `C${agentPart}_${timestamp}.md`);
                writeFileSync(filename, prompt, 'utf-8');
                console.log(`   DEBUG: Claude brain system prompt written to ${filename}`);
            } catch (error) {
                console.error('   DEBUG: Failed to write Claude brain prompt to file:', error);
            }
        }
    }

    /**
     * Get the current system prompt
     */
    public getSystemPrompt(): string | undefined {
        return this.systemPrompt;
    }

    /**
     * Add an MCP server
     * @param name Unique name for the server
     * @param config Server configuration
     */
    public addMcpServer(name: string, config: McpServerConfig): void {
        const existingServer = this.mcpServers.get(name);
        this.mcpServers.set(name, config);
        
        if (this.logger) {
            if (existingServer) {
                this.logger.info(`   AgentClaudeBrain: Updated MCP server '${name}' - Type: ${config.type}, URL: ${config.url || 'N/A'}`);
            } else {
                this.logger.info(`   AgentClaudeBrain: Added MCP server '${name}' - Type: ${config.type}, URL: ${config.url || 'N/A'}`);
            }
        }
    }

    /**
     * Remove an MCP server
     * @param name Name of the server to remove
     * @returns true if server was removed, false if not found
     */
    public removeMcpServer(name: string): boolean {
        const removed = this.mcpServers.delete(name);
        
        if (this.logger) {
            if (removed) {
                this.logger.info(`   AgentClaudeBrain: Removed MCP server '${name}'`);
            } else {
                this.logger.warn(`   AgentClaudeBrain: Attempted to remove non-existent MCP server '${name}'`);
            }
        }
        
        return removed;
    }

    /**
     * List all configured MCP servers
     * @returns Array of server names
     */
    public listMcpServers(): string[] {
        return Array.from(this.mcpServers.keys());
    }

    /**
     * Get MCP server configuration
     * @param name Name of the server
     * @returns Server configuration or undefined if not found
     */
    public getMcpServer(name: string): McpServerConfig | undefined {
        return this.mcpServers.get(name);
    }

    /**
     * Describe WBS operations in natural language using Agent SDK
     */
    async describeWbsOperations(operations: any[]): Promise<string> {
        try {
            const prompt = `Analyze these Work Breakdown Structure (WBS) operations and describe what changes occurred in simple, clear English. Focus on the business meaning, not technical details.

Operations data:
${JSON.stringify(operations, null, 2)}

Provide a concise summary of what happened.`;

            let description = "";
            
            for await (const message of this.queryStream(prompt)) {
                if (message.type === 'assistant' && message.message) {
                    const textContent = message.message.content.find((c: any) => c.type === 'text');
                    if (textContent && 'text' in textContent) {
                        description += textContent.text;
                    }
                }
            }

            return description || "WBS document was updated";
        } catch (error) {
            if (this.logger) {
                this.logger.error("   AgentClaudeBrain: Failed to describe WBS operations", error);
            }
            return `WBS document was updated with ${operations.length} operation(s)`;
        }
    }

    /**
     * Describe inbox operations in natural language using Agent SDK
     */
    async describeInboxOperations(operations: any[]): Promise<string> {
        try {
            const prompt = `Analyze these inbox document operations and describe what messages or requests were received in simple, clear English. Focus on the business meaning.

Operations data:
${JSON.stringify(operations, null, 2)}

Provide a concise summary of what was received.`;

            let description = "";
            
            for await (const message of this.queryStream(prompt)) {
                if (message.type === 'assistant' && message.message) {
                    const textContent = message.message.content.find((c: any) => c.type === 'text');
                    if (textContent && 'text' in textContent) {
                        description += textContent.text;
                    }
                }
            }

            return description || "Inbox received new content";
        } catch (error) {
            if (this.logger) {
                this.logger.error("   AgentClaudeBrain: Failed to describe inbox operations", error);
            }
            return `Inbox received ${operations.length} operation(s)`;
        }
    }

    /**
     * Stream query results from Claude Agent SDK
     */
    private async *queryStream(prompt: string): AsyncIterable<SDKMessage> {
        // Build MCP servers configuration from the map
        const mcpServers: any = {};
        
        // Add all configured MCP servers
        for (const [name, config] of this.mcpServers) {
            mcpServers[name] = config;
        }

        const q = query({
            prompt,
            options: {
                settingSources: [],  // No filesystem config lookups
                maxTurns: this.config.maxTurns || 1,  // Single turn for descriptions
                cwd: this.config.workingDirectory,
                model: this.config.model || 'haiku',
                allowedTools: this.config.allowedTools || [],  // No tools needed for description tasks
                mcpServers,
                hooks: this.createFileSystemHooks(),
                systemPrompt: this.systemPrompt  // Add system prompt if available
            }
        });

        for await (const message of q) {
            yield message;
        }
    }

    /**
     * Create file system access control hooks
     */
    private createFileSystemHooks(): any {
        if (!this.config.fileSystemPaths) {
            return {};
        }

        const allowedReadPaths = this.config.fileSystemPaths.allowedReadPaths || [];
        const allowedWritePaths = this.config.fileSystemPaths.allowedWritePaths || [];

        return {
            PreToolUse: [
                {
                    matcher: "Read|Grep|Glob",
                    hooks: [
                        async (input: any): Promise<HookJSONOutput> => {
                            const toolName = input.tool_name;
                            const toolInput = input.tool_input;

                            if (!['Read', 'Grep', 'Glob'].includes(toolName)) {
                                return { continue: true };
                            }

                            let filePath = '';
                            if (toolName === 'Read') {
                                filePath = toolInput.file_path || '';
                            } else if (toolName === 'Grep' || toolName === 'Glob') {
                                filePath = toolInput.path || '.';
                            }

                            // Check if path is in allowed read paths
                            const isAllowed = allowedReadPaths.length === 0 || 
                                allowedReadPaths.some(allowed => {
                                    const resolvedAllowed = path.resolve(allowed);
                                    const resolvedPath = path.resolve(filePath);
                                    return resolvedPath.startsWith(resolvedAllowed);
                                });

                            if (!isAllowed) {
                                return {
                                    decision: 'block',
                                    stopReason: `Read access denied. Path "${filePath}" is not in allowed read paths: ${allowedReadPaths.join(', ')}`,
                                    continue: false
                                };
                            }

                            return { continue: true };
                        }
                    ]
                },
                {
                    matcher: "Write|Edit|MultiEdit",
                    hooks: [
                        async (input: any): Promise<HookJSONOutput> => {
                            const toolName = input.tool_name;
                            const toolInput = input.tool_input;

                            if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
                                return { continue: true };
                            }

                            let filePath = '';
                            if (toolName === 'Write' || toolName === 'Edit') {
                                filePath = toolInput.file_path || '';
                            } else if (toolName === 'MultiEdit') {
                                filePath = toolInput.file_path || '';
                            }

                            // Check if path is in allowed write paths
                            const isAllowed = allowedWritePaths.length === 0 || 
                                allowedWritePaths.some(allowed => {
                                    const resolvedAllowed = path.resolve(allowed);
                                    const resolvedPath = path.resolve(filePath);
                                    return resolvedPath.startsWith(resolvedAllowed);
                                });

                            if (!isAllowed) {
                                return {
                                    decision: 'block',
                                    stopReason: `Write access denied. Path "${filePath}" is not in allowed write paths: ${allowedWritePaths.join(', ')}`,
                                    continue: false
                                };
                            }

                            return { continue: true };
                        }
                    ]
                }
            ]
        };
    }
}
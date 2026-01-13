import { query } from '@anthropic-ai/claude-agent-sdk';
import type { HookJSONOutput, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { IAgentBrain, IBrainLogger } from './IAgentBrain.js';
import * as path from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

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
        
        // Ensure node is in PATH for Claude Agent SDK
        if (!process.env.PATH?.includes('/usr/local/bin')) {
            process.env.PATH = `/usr/local/bin:${process.env.PATH}`;
        }
        // Add common node locations to PATH
        const nodePaths = [
            '/usr/bin',
            '/bin',
            '/home/wouter/.nvm/versions/node/v22.13.1/bin'
        ];
        for (const nodePath of nodePaths) {
            if (!process.env.PATH?.includes(nodePath)) {
                process.env.PATH = `${nodePath}:${process.env.PATH}`;
            }
        }
        
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
        console.log("   AgentClaudeBrain: describeWbsOperations called with", operations.length, "operations");
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
            console.error("ERROR in describeWbsOperations:", error);
            if (this.logger) {
                this.logger.error(`   AgentClaudeBrain: Failed to describe WBS operations: ${error instanceof Error ? error.message : String(error)}`, error);
            }
            return `WBS document was updated with ${operations.length} operation(s)`;
        }
    }

    /**
     * Describe inbox operations in natural language using Agent SDK
     */
    async describeInboxOperations(operations: any[]): Promise<string> {
        console.log("   AgentClaudeBrain: describeInboxOperations called with", operations.length, "operations");
        try {
            const prompt = `
A data update to your inbox document was synchronized:

---
${JSON.stringify(operations, null, 2)}
---

Fetch your inbox document in agent-manager-drive through the MCP to have the full picture.
- Mark new stakeholder messages always as read immediately in your inbox document so that the stakeholder knows you're on it.
- Reply to new stakeholder messages if needed. Consider submitting other operations through the MCP, other than just SEND_AGENT_MESSAGE. Esp. workflow changes.
- Apply stakeholder requests to your WBS document where needed.
- Consider updating your WBS document by breaking down goals.
- Make sure your agent profile in the inbox doc is up-to-date.

Reply to this prompt with a very short sentence summary of what you did.
`;

            let description = "";
            
            // Use full turns since we're asking the agent to perform actions
            for await (const message of this.queryStream(prompt, true)) {
                if (message.type === 'assistant' && message.message) {
                    const textContent = message.message.content.find((c: any) => c.type === 'text');
                    if (textContent && 'text' in textContent) {
                        description += textContent.text;
                    }
                }
            }

            return description || "Inbox received new content";
        } catch (error) {
            console.error("ERROR in describeInboxOperations:", error);
            if (this.logger) {
                this.logger.error(`   AgentClaudeBrain: Failed to describe inbox operations: ${error instanceof Error ? error.message : String(error)}`, error);
            }
            return `Inbox received ${operations.length} operation(s)`;
        }
    }

    /**
     * Stream query results from Claude Agent SDK
     */
    private async *queryStream(prompt: string, useFullTurns: boolean = false): AsyncIterable<SDKMessage> {
        // Build MCP servers configuration from the map
        const mcpServers: any = {};
        
        // Add all configured MCP servers
        for (const [name, config] of this.mcpServers) {
            mcpServers[name] = config;
        }

        // Ensure working directory exists
        const workingDir = this.config.workingDirectory;
        if (!existsSync(workingDir)) {
            mkdirSync(workingDir, { recursive: true });
        }
        
        const q = query({
            prompt,
            options: {
                settingSources: [],  // No filesystem config lookups
                maxTurns: useFullTurns ? (this.config.maxTurns || 100) : 1,  // Use full turns for action tasks
                cwd: workingDir,
                model: this.config.model || 'haiku',
                allowedTools: useFullTurns ? this.config.allowedTools : [],  // Enable tools for action tasks
                mcpServers,
                hooks: this.createFileSystemHooks(),
                systemPrompt: this.systemPrompt,  // Add system prompt if available
                // Workaround for spawn node ENOENT issue
                env: {
                    PATH: process.env.PATH,
                    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
                    HOME: process.env.HOME,
                    USER: process.env.USER
                },
                permissionMode: 'default'  // Changed from bypassPermissions as suggested
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
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { HookJSONOutput, SDKMessage, McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk';
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
    bypassPermissions?: boolean;  // For testing - bypasses tool permission requests
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
                // Debug: Claude brain system prompt written to file
            } catch (error) {
                // Debug: Failed to write Claude brain prompt to file
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
            const configDetails = this.getMcpServerDetails(config);
            if (existingServer) {
                this.logger.info(`   AgentClaudeBrain: Updated MCP server '${name}' - ${configDetails}`);
            } else {
                this.logger.info(`   AgentClaudeBrain: Added MCP server '${name}' - ${configDetails}`);
            }
        }
    }

    /**
     * Get descriptive details about MCP server config for logging
     */
    private getMcpServerDetails(config: McpServerConfig): string {
        if ('type' in config && config.type === 'http') {
            return `Type: http, URL: ${config.url}`;
        } else if ('type' in config && config.type === 'sse') {
            return `Type: sse, URL: ${config.url}`;
        } else if ('type' in config && config.type === 'sdk') {
            return `Type: sdk, Name: ${config.name}`;
        } else if ('command' in config) {
            return `Type: stdio, Command: ${config.command}`;
        }
        return `Type: unknown`;
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

    public setWorkDir(workPath: string) {
        console.log("Updating workdir / file system paths... BEFORE", this.config.workingDirectory, this.config.fileSystemPaths)

        // Ensure the path is absolute
        const absolutePath = path.resolve(workPath);
        
        // Ensure the directory exists
        if (!existsSync(absolutePath)) {
            mkdirSync(absolutePath, { recursive: true });
        }
        
        // Update the working directory for the SDK
        //this.config.workingDirectory = absolutePath;
        
        // Preserve existing read paths and add the new working directory
        const existingReadPaths = this.config.fileSystemPaths?.allowedReadPaths || [];
        
        // Ensure all paths are absolute for consistency
        const absoluteReadPaths = existingReadPaths.map(p => path.resolve(p));
        
        // Add the new working directory to read paths if not already present
        if (!absoluteReadPaths.includes(absolutePath)) {
            absoluteReadPaths.push(absolutePath);
        }
        
        this.config.fileSystemPaths = {
            allowedReadPaths: absoluteReadPaths,
            allowedWritePaths: [ absolutePath ],
        };

        console.log("Updating workdir / file system paths... AFTER", this.config.workingDirectory, this.config.fileSystemPaths)
        
        if (this.logger) {
            this.logger.info(`   AgentClaudeBrain: Working directory updated to: ${absolutePath}`);
        }
    }

    /**
     * Create file system access control hooks
     */
    private createFileSystemHooks(): Record<string, unknown> {
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
                        async (input: { tool_name: string; tool_input: Record<string, unknown> }): Promise<HookJSONOutput> => {
                            try {
                                const toolName = input.tool_name;
                                const toolInput = input.tool_input;

                                if (!['Read', 'Grep', 'Glob'].includes(toolName)) {
                                    return { continue: true };
                                }

                                let filePath = '';
                                if (toolName === 'Read') {
                                    filePath = (toolInput.file_path as string) || '';
                                } else if (toolName === 'Grep' || toolName === 'Glob') {
                                    filePath = (toolInput.path as string) || '.';
                                }

                                // Check if path is in allowed read paths
                                const isAllowed = allowedReadPaths.length === 0 || 
                                    allowedReadPaths.some(allowed => {
                                        const resolvedAllowed = path.resolve(allowed);
                                        const resolvedPath = path.resolve(filePath);
                                        if (resolvedPath.startsWith(resolvedAllowed)) {
                                            console.log('Allowing read path', resolvedPath);
                                            return true;
                                        }
                                    });

                                if (!isAllowed) {
                                    console.log('Blocking read path', filePath);
                                    return {
                                        decision: 'block',
                                        stopReason: `Read access denied. Path "${filePath}" is not in allowed read paths: ${allowedReadPaths.join(', ')}`,
                                        continue: false
                                    };
                                }

                                return { continue: true };

                            } catch(e) {
                                console.error(e);
                                throw e;
                            }
                        }
                    ]
                },
                {
                    matcher: "Write|Edit|MultiEdit",
                    hooks: [
                        async (input: { tool_name: string; tool_input: Record<string, unknown> }): Promise<HookJSONOutput> => {
                            try { 
                                const toolName = input.tool_name;
                                const toolInput = input.tool_input;

                                if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
                                    return { continue: true };
                                }

                                let filePath = '';
                                if (toolName === 'Write' || toolName === 'Edit') {
                                    filePath = (toolInput.file_path as string) || '';
                                } else if (toolName === 'MultiEdit') {
                                    filePath = (toolInput.file_path as string) || '';
                                }

                                // Check if path is in allowed write paths
                                const isAllowed = allowedWritePaths.length === 0 || 
                                    allowedWritePaths.some(allowed => {
                                        const resolvedAllowed = path.resolve(allowed);
                                        const resolvedPath = path.resolve(filePath);
                                        if (resolvedPath.startsWith(resolvedAllowed)) {
                                            console.log('Allowing write path', resolvedPath);
                                            return true;
                                        }
                                    });

                                if (!isAllowed) {
                                    console.log('Blocking write path', filePath);
                                    return {
                                        decision: 'block',
                                        stopReason: `Write access denied. Path "${filePath}" is not in allowed write paths: ${allowedWritePaths.join(', ')}`,
                                        continue: false
                                    };
                                }

                                return { continue: true };
                            } catch(e) {
                                console.error(e);
                                throw e;
                            }
                        }
                    ]
                }
            ]
        };
    }

    /**
     * Send a message to Claude for processing
     */
    public async sendMessage(message: string, sessionId?: string, options?: { maxTurns?: number }): Promise<{response: string; sessionId?: string}> {
        if (this.logger) {
            this.logger.debug(`   AgentClaudeBrain: Sending message (${message.length} chars)`);
        }

        // Log conversation to tmp directory for debugging
        const tmpDir = path.join(process.cwd(), 'tmp', 'conversations');
        mkdirSync(tmpDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logFile = path.join(tmpDir, `conversation_${timestamp}.md`);

        try {
            // Build MCP servers configuration
            const mcpServers: Record<string, McpServerConfig> = {};
            for (const [name, config] of this.mcpServers) {
                // Check if this is an SDK server with instance (McpSdkServerConfigWithInstance)
                if ('type' in config && config.type === 'sdk' && 'instance' in config) {
                    // The SDK expects the full config with instance for SDK servers
                    mcpServers[name] = config;
                } else {
                    // Regular config-based servers
                    mcpServers[name] = config;
                }
            }

            // Ensure working directory exists
            const workingDir = this.config.workingDirectory;
            if (!existsSync(workingDir)) {
                mkdirSync(workingDir, { recursive: true });
            }
            
            // Log the request
            let logContent = `# Conversation Log - ${new Date().toISOString()}\n\n`;
            logContent += `## System Prompt\n\`\`\`\n${this.systemPrompt || 'No system prompt'}\n\`\`\`\n\n`;
            logContent += `## User Message\n\`\`\`\n${message}\n\`\`\`\n\n`;
            logContent += `## Configuration\n`;
            logContent += `- Model: ${this.config.model || 'haiku'}\n`;
            logContent += `- MaxTurns: ${options?.maxTurns || 5}\n`;
            logContent += `- Session: ${sessionId ? `Resuming ${sessionId}` : 'New session'}\n`;
            logContent += `- AllowedTools: none\n\n`;

            // Build options with resume if sessionId provided
            const queryOptions: Options = {
                settingSources: [],  // No filesystem config lookups
                maxTurns: options?.maxTurns || 5,  // Use provided maxTurns or default to 5
                cwd: workingDir,
                model: this.config.model || 'haiku',
                allowedTools: this.config.allowedTools || [],  // Use configured allowed tools
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
                    permissionMode: this.config.bypassPermissions ? 'bypassPermissions' : 'default'
                };
            
            // Add resume option if sessionId is provided
            if (sessionId) {
                queryOptions.resume = sessionId;
            }

            //console.log("QUARGS (sendMessage)", message.substring(0, 100) + "...", queryOptions);
            
            // MCP servers being passed to query (debugging disabled)
            
            const q = query({
                prompt: message,
                options: queryOptions
            });

            // Collect the response
            let response = '';
            let capturedSessionId: string | undefined;
            let messageCount = 0;
            logContent += `## Messages Stream\n`;
            
            for await (const msg of q) {
                messageCount++;
                logContent += `\n### Message ${messageCount} (type: ${msg.type})\n`;
                
                // Log error messages for debugging
                if (msg.type === 'result' && 'subtype' in msg && msg.subtype !== 'success') {
                    console.error('Claude SDK Error Message:', msg);
                    logContent += `#### ERROR:\n${JSON.stringify(msg, null, 2)}\n`;
                    if (this.logger) {
                        this.logger.error(`   AgentClaudeBrain: Claude SDK error:`, msg);
                    }
                }
                
                // Log full message details
                if (msg.type === 'assistant' && msg.message) {
                    logContent += `Assistant message with ${msg.message.content.length} content blocks\n`;
                    for (const block of msg.message.content) {
                        if (block.type === 'text') {
                            response += block.text;
                            logContent += `#### Text block:\n${block.text}\n`;
                        } else if (block.type === 'tool_use') {
                            logContent += `#### Tool use block:\n`;
                            logContent += `- Tool: ${block.name}\n`;
                            logContent += `- Input: ${JSON.stringify(block.input, null, 2)}\n`;
                        } else {
                            logContent += `#### ${block.type} block:\n`;
                            logContent += `${JSON.stringify(block, null, 2)}\n`;
                        }
                    }
                } else if (msg.type === 'user' && 'message' in msg) {
                    logContent += `User message:\n`;
                    const userMsg = (msg as SDKMessage & { message: unknown }).message;
                    if (typeof userMsg === 'string') {
                        logContent += `${userMsg}\n`;
                    } else {
                        logContent += `${JSON.stringify(userMsg, null, 2)}\n`;
                    }
                } else if (msg.type === 'system') {
                    logContent += `System message:\n`;
                    const systemMsg = msg as SDKMessage & { subtype?: string; session_id?: string; content?: unknown };
                    if (systemMsg.subtype) {
                        logContent += `- Subtype: ${systemMsg.subtype}\n`;
                        // Capture session ID from init message
                        if (systemMsg.subtype === 'init' && systemMsg.session_id) {
                            capturedSessionId = systemMsg.session_id;
                            logContent += `- Session ID: ${capturedSessionId}\n`;
                        }
                    }
                    if (systemMsg.content) {
                        logContent += `- Content: ${JSON.stringify(systemMsg.content, null, 2)}\n`;
                    }
                } else if (msg.type === 'result') {
                    logContent += `Result message:\n`;
                    const resultMsg = msg as SDKMessage & { 
                        subtype?: string; 
                        is_error?: boolean;
                        errors?: string[];
                        permission_denials?: unknown[];
                        content?: unknown;
                    };
                    if (resultMsg.subtype) {
                        logContent += `- Subtype: ${resultMsg.subtype}\n`;
                    }
                    
                    // Check for errors in result message
                    if (resultMsg.is_error) {
                        console.error('Claude SDK Result Error:', {
                            subtype: resultMsg.subtype,
                            errors: resultMsg.errors,
                            permission_denials: resultMsg.permission_denials,
                            fullMessage: resultMsg
                        });
                        if (this.logger) {
                            this.logger.error(`   AgentClaudeBrain: Result error: ${resultMsg.errors?.join(', ')}`);
                        }
                        logContent += `- ERRORS: ${resultMsg.errors?.join(', ')}\n`;
                    }
                    
                    if (resultMsg.content) {
                        logContent += `- Content: ${JSON.stringify(resultMsg.content, null, 2).substring(0, 500)}...\n`;
                    }
                } else {
                    // Log any other message type
                    logContent += `Full message: ${JSON.stringify(msg, null, 2).substring(0, 1000)}...\n`;
                }
            }
            
            logContent += `\n## Final Response\n\`\`\`\n${response || 'No response generated'}\n\`\`\`\n`;
            logContent += `\nTotal messages: ${messageCount}\n`;
            logContent += `Response length: ${response.length} chars\n`;
            
            // Write log file
            writeFileSync(logFile, logContent);
            // Conversation logged to file
            
            if (this.logger) {
                this.logger.debug(`   AgentClaudeBrain: Received ${messageCount} messages, response length: ${response.length}`);
            }

            return {
                response: response || 'No response generated',
                sessionId: capturedSessionId
            };
        } catch (error) {
            if (this.logger) {
                this.logger.error(`   AgentClaudeBrain: Error sending message`, error);
            }
            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    public async cleanup(): Promise<void> {
        // Clear any references that might prevent garbage collection
        this.mcpServers.clear();
        this.systemPrompt = undefined;
        
        if (this.logger) {
            this.logger.debug('   AgentClaudeBrain: Cleaned up resources');
        }
    }
}
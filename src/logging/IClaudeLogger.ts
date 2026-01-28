/**
 * Configuration for an MCP server (matches SDK types)
 */
export type McpServerConfig = 
    | McpStdioServerConfig 
    | McpHttpServerConfig 
    | McpSSEServerConfig
    | { type?: string; [key: string]: any }; // Fallback for unknown types

/**
 * Standard I/O MCP server configuration
 */
export interface McpStdioServerConfig {
    type?: 'stdio';
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

/**
 * HTTP MCP server configuration
 */
export interface McpHttpServerConfig {
    type: 'http';
    url: string;
    headers?: Record<string, string>;
}

/**
 * Server-Sent Events MCP server configuration
 */
export interface McpSSEServerConfig {
    type: 'sse';
    url: string;
    headers?: Record<string, string>;
}

/**
 * Information about a tool use
 */
export interface ToolUseInfo {
    id: string;
    name: string;
    input: any;
    timestamp: Date;
}

/**
 * Information about a tool result
 */
export interface ToolResultInfo {
    toolUseId: string;
    output: any;
    error?: string;
    timestamp: Date;
}

/**
 * Interface for logging Claude-based agent interactions
 */
export interface IClaudeLogger {
    /**
     * Start a new logging session with initial configuration
     * @param sessionId Unique identifier for the session
     * @param systemPrompt The system prompt for this session
     * @param mcpServers Initial MCP servers configured (map of name to config)
     * @param agentName Optional name of the agent
     * @param metadata Optional metadata including maxTurns
     */
    startSession(sessionId: string, systemPrompt: string, mcpServers: Map<string, McpServerConfig>, agentName?: string, metadata?: { maxTurns?: number }): void;

    /**
     * End a logging session
     * @param sessionId Session identifier to end
     */
    endSession(sessionId: string): void;

    /**
     * Log when an MCP server is added
     * @param sessionId Session identifier
     * @param name The server name
     * @param server The added server configuration
     */
    logMcpServerAdded(sessionId: string, name: string, server: McpServerConfig): void;

    /**
     * Log when an MCP server is removed
     * @param sessionId Session identifier
     * @param serverName Name of the removed server
     */
    logMcpServerRemoved(sessionId: string, serverName: string): void;

    /**
     * Log a user message
     * @param sessionId Session identifier
     * @param message The user's message
     * @param maxTurns Optional max turns for this request
     */
    logUserMessage(sessionId: string, message: string, maxTurns?: number): void;

    /**
     * Log an assistant message
     * @param sessionId Session identifier
     * @param message The assistant's response
     * @param isFinal Whether this is the final response
     */
    logAssistantMessage(sessionId: string, message: string, isFinal?: boolean): void;

    /**
     * Log tool use
     * @param sessionId Session identifier
     * @param tool Tool use information
     */
    logToolUse(sessionId: string, tool: ToolUseInfo): void;

    /**
     * Log tool result
     * @param sessionId Session identifier
     * @param result Tool result information
     */
    logToolResult(sessionId: string, result: ToolResultInfo): void;

    /**
     * Log an error
     * @param sessionId Session identifier
     * @param error The error that occurred
     */
    logError(sessionId: string, error: Error): void;

    /**
     * Log query result with metrics
     * @param sessionId Session identifier
     * @param result The complete result message from the query
     */
    logQueryResult(sessionId: string, result: {
        num_turns?: number;
        total_cost_usd?: number;
        usage?: {
            input_tokens?: number;
            output_tokens?: number;
        };
        modelUsage?: Record<string, {
            inputTokens?: number;
            outputTokens?: number;
            costUSD?: number;
        }>;
        duration_ms?: number;
        result?: string;
    }): void;

    /**
     * Optional cleanup method
     */
    cleanup?(): Promise<void>;
}
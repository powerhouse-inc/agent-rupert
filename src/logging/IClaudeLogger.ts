/**
 * Configuration for an MCP server
 */
export interface McpServerConfig {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
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
     * @param mcpServers Initial MCP servers configured
     * @param agentName Optional name of the agent
     */
    startSession(sessionId: string, systemPrompt: string, mcpServers: McpServerConfig[], agentName?: string): void;

    /**
     * End a logging session
     * @param sessionId Session identifier to end
     */
    endSession(sessionId: string): void;

    /**
     * Log when an MCP server is added
     * @param sessionId Session identifier
     * @param server The added server configuration
     */
    logMcpServerAdded(sessionId: string, server: McpServerConfig): void;

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
     */
    logUserMessage(sessionId: string, message: string): void;

    /**
     * Log an assistant message
     * @param sessionId Session identifier
     * @param message The assistant's response
     */
    logAssistantMessage(sessionId: string, message: string): void;

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
     * Optional cleanup method
     */
    cleanup?(): Promise<void>;
}
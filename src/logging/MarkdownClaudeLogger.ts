import { IClaudeLogger, McpServerConfig, McpStdioServerConfig, McpHttpServerConfig, McpSSEServerConfig, ToolUseInfo, ToolResultInfo } from './IClaudeLogger.js';
import { mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

/**
 * Session state for tracking active sessions
 */
interface SessionState {
    filePath: string;
    startTime: Date;
    agentName?: string;
    isActive: boolean;
    messageCount: number;
    toolUseCount: number;
}

/**
 * Options for configuring the MarkdownClaudeLogger
 */
export interface MarkdownLoggerOptions {
    directory?: string;
}

/**
 * Markdown-based implementation of IClaudeLogger
 * Creates one markdown file per session with append-only logging
 */
export class MarkdownClaudeLogger implements IClaudeLogger {
    private sessions: Map<string, SessionState>;
    private directory: string;
    private agentCounters: Map<string, number>;

    constructor(options: MarkdownLoggerOptions = {}) {
        this.sessions = new Map();
        this.directory = options.directory || process.env.CLAUDE_LOG_DIR || 'tmp/sessions';
        this.agentCounters = new Map();
    }

    /**
     * Start a new logging session with initial configuration
     */
    public startSession(sessionId: string, systemPrompt: string, mcpServers: Map<string, McpServerConfig>, agentName?: string, metadata?: { maxTurns?: number }): void {
        if (this.sessions.has(sessionId)) {
            console.warn(`Session ${sessionId} already exists`);
            return;
        }

        // Format timestamp as YYYYMMDD_HHMM
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timestamp = `${year}${month}${day}_${hours}${minutes}`;
        
        // Create agent-specific directory and get counter
        const agentDir = agentName ? agentName.replace(/\s+/g, '') : 'unknown-agent';
        
        // Get and increment the counter for this agent
        const currentCounter = this.agentCounters.get(agentDir) || 0;
        const nextCounter = currentCounter + 1;
        this.agentCounters.set(agentDir, nextCounter);
        
        // Format counter as 3 digits
        const counterStr = String(nextCounter).padStart(3, '0');
        const filename = `${timestamp}_${counterStr}.md`;
        const fullDir = join(this.directory, agentDir);
        const filePath = join(fullDir, filename);

        // Ensure agent directory exists synchronously
        try {
            mkdirSync(fullDir, { recursive: true });
        } catch (err) {
            console.error(`Failed to create directory ${fullDir}:`, err);
        }

        const startTime = new Date();

        this.sessions.set(sessionId, {
            filePath,
            startTime,
            agentName,
            isActive: true,
            messageCount: 0,
            toolUseCount: 0
        });

        // Write session header
        let content = `# Session: ${agentName || 'Agent'}
**Session ID**: ${sessionId}
**Started**: ${startTime.toISOString()}
${metadata?.maxTurns ? `**Max Turns**: ${metadata.maxTurns}\n` : ''}
`;

        // Write system prompt
        content += `# System Prompt
\`\`\`\`md
${systemPrompt}
\`\`\`\`

`;

        // Write initial MCP servers if any
        if (mcpServers.size > 0) {
            content += '# Initial MCP Servers\n';
            for (const [name, server] of mcpServers) {
                content += `- **${name}**: ${this.formatMcpServer(server)}\n`;
            }
            content += '\n';
        }

        appendFileSync(filePath, content);
    }

    /**
     * End a logging session
     */
    public endSession(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`Session ${sessionId} not found`);
            return;
        }

        if (!session.isActive) {
            console.warn(`Session ${sessionId} already ended`);
            return;
        }

        const endTime = new Date();
        const duration = endTime.getTime() - session.startTime.getTime();
        const durationStr = this.formatDuration(duration);

        // Write session summary
        const summary = `
# Session Summary
**Ended**: ${endTime.toISOString()}
**Duration**: ${durationStr}
**Messages**: ${session.messageCount}
**Tool Uses**: ${session.toolUseCount}
`;
        appendFileSync(session.filePath, summary);
        session.isActive = false;
        
        // Keep the session until stream is closed (for cleanup to wait)
        // Don't delete it here - let cleanup handle final removal
    }


    /**
     * Log when an MCP server is added
     */
    public logMcpServerAdded(sessionId: string, name: string, server: McpServerConfig): void {
        const session = this.sessions.get(sessionId);
        if (!session?.isActive) return;

        const content = `## MCP Server Added
**Server**: ${name} - ${this.formatMcpServer(server)}
**Time**: ${new Date().toISOString()}

`;
        appendFileSync(session.filePath, content);
    }

    /**
     * Log when an MCP server is removed
     */
    public logMcpServerRemoved(sessionId: string, serverName: string): void {
        const session = this.sessions.get(sessionId);
        if (!session?.isActive) return;

        const content = `## MCP Server Removed
**Server**: ${serverName}
**Time**: ${new Date().toISOString()}

`;
        appendFileSync(session.filePath, content);
    }

    /**
     * Log a user message
     */
    public logUserMessage(sessionId: string, message: string): void {
        const session = this.sessions.get(sessionId);
        if (!session?.isActive) return;

        // Start conversation log if this is the first message
        if (session.messageCount === 0) {
            appendFileSync(session.filePath, '# Conversation Log\n\n');
        }

        const timestamp = new Date().toISOString();
        const content = `## User Message
**Time**: ${timestamp}
**Type**: user_request
\`\`\`\`md
${message}
\`\`\`\`

`;
        appendFileSync(session.filePath, content);
        session.messageCount++;
    }

    /**
     * Log an assistant message
     */
    public logAssistantMessage(sessionId: string, message: string, isFinal: boolean = false): void {
        const session = this.sessions.get(sessionId);
        if (!session?.isActive) return;

        const timestamp = new Date().toISOString();
        const messageType = isFinal ? 'final_response' : 'assistant_response';
        const content = `## Assistant Message
**Time**: ${timestamp}
**Type**: ${messageType}
\`\`\`\`md
${message}
\`\`\`\`

`;
        appendFileSync(session.filePath, content);
        session.messageCount++;
    }

    /**
     * Log tool use
     */
    public logToolUse(sessionId: string, tool: ToolUseInfo): void {
        const session = this.sessions.get(sessionId);
        if (!session?.isActive) return;

        const timestamp = new Date().toISOString();
        const content = `## Tool Use: ${tool.name}
**Time**: ${timestamp}
**Tool ID**: ${tool.id}
**Input**:
\`\`\`\`json
${JSON.stringify(tool.input, null, 2)}
\`\`\`\`

`;
        appendFileSync(session.filePath, content);
        session.toolUseCount++;
    }

    /**
     * Log tool result
     */
    public logToolResult(sessionId: string, result: ToolResultInfo): void {
        const session = this.sessions.get(sessionId);
        if (!session?.isActive) return;

        const timestamp = new Date().toISOString();
        let content = `## Tool Result
**Time**: ${timestamp}\n`;
        
        if (result.error) {
            content += `**Error**: ${result.error}\n`;
        } else {
            content += `**Output**:\n\`\`\`\`json\n${JSON.stringify(result.output, null, 2)}\n\`\`\`\`\n`;
        }
        content += '\n';
        
        appendFileSync(session.filePath, content);
    }

    /**
     * Log an error
     */
    public logError(sessionId: string, error: Error): void {
        const session = this.sessions.get(sessionId);
        if (!session?.isActive) return;

        const content = `## Error
**Message**: ${error.message}
**Stack**:
\`\`\`\`
${error.stack || 'No stack trace available'}
\`\`\`\`

`;
        appendFileSync(session.filePath, content);
    }

    /**
     * Cleanup all active sessions
     */
    public async cleanup(): Promise<void> {
        // End all active sessions properly with summaries
        const sessionIds = Array.from(this.sessions.keys());
        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session?.isActive) {
                this.endSession(sessionId);
            }
        }
        
        // Clear all sessions
        this.sessions.clear();
    }

    /**
     * Format duration in human-readable format
     */
    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Format MCP server configuration for logging
     */
    private formatMcpServer(server: McpServerConfig): string {
        // Check if it's an HTTP server
        if ('type' in server && server.type === 'http') {
            const httpServer = server as McpHttpServerConfig;
            return `Type: http, URL: ${httpServer.url}`;
        }
        
        // Check if it's an SSE server
        if ('type' in server && server.type === 'sse') {
            const sseServer = server as McpSSEServerConfig;
            return `Type: sse, URL: ${sseServer.url}`;
        }
        
        // Check if it's a stdio server (or no type specified - default to stdio)
        if (!('type' in server) || server.type === 'stdio') {
            const stdioServer = server as McpStdioServerConfig;
            const args = stdioServer.args?.join(' ') || '';
            return `\`${stdioServer.command} ${args}\``.trim();
        }
        
        // Unknown type
        return `Type: ${(server as any).type || 'unknown'}`;
    }
}
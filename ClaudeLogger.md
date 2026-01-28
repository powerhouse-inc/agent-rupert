# ClaudeLogger Implementation Plan

## Overview
Implement a simple logging system for Claude-based agent interactions that captures entire conversation sessions from system prompt to completion. The design supports multiple concurrent sessions and separates logging concerns from the brain implementation.

## Architecture

### Core Interfaces

#### IClaudeLogger
```typescript
export interface IClaudeLogger {
    // Session management - includes initial configuration
    startSession(sessionId: string, systemPrompt: string, mcpServers: McpServerConfig[], agentName?: string): void;
    endSession(sessionId: string): void;
    
    // Logging methods
    logMcpServerAdded(sessionId: string, server: McpServerConfig): void;
    logMcpServerRemoved(sessionId: string, serverName: string): void;
    logUserMessage(sessionId: string, message: string): void;
    logAssistantMessage(sessionId: string, message: string): void;
    logToolUse(sessionId: string, tool: ToolUseInfo): void;
    logToolResult(sessionId: string, result: ToolResultInfo): void;
    logError(sessionId: string, error: Error): void;
    
    // Cleanup
    cleanup?(): Promise<void>;
}
```

#### Supporting Types
```typescript
export interface McpServerConfig {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

export interface ToolUseInfo {
    id: string;
    name: string;
    input: any;
    timestamp: Date;
}

export interface ToolResultInfo {
    toolUseId: string;
    output: any;
    error?: string;
    timestamp: Date;
}
```

### MarkdownClaudeLogger Implementation

#### File Structure
- Each agent has its own subdirectory: `tmp/sessions/<agentName>/`
- Each session creates a single markdown file: `<agentName>/<timestamp>_<counter>.md`
- Timestamp format: `YYYYMMDD_HHMM` for cleaner sorting
- Counter: 3-digit agent-scoped counter (001, 002, 003, etc.)
- Files are appended to throughout the session
- Session state tracked in memory Map

#### Session Management
```typescript
class MarkdownClaudeLogger implements IClaudeLogger {
    private sessions: Map<string, SessionState>;
    
    interface SessionState {
        filePath: string;
        stream: fs.WriteStream;
        startTime: Date;
        agentName?: string;
        isActive: boolean;
    }
}
```

#### Key Features
1. **Simple File Writes**: Direct append to markdown files
2. **Session Tracking**: Map to track active sessions and file paths
3. **Resource Management**: Close file streams on session end

## Implementation Details

### Session Lifecycle

1. **Session Start**
   - Generate unique filename with timestamp
   - Create write stream for markdown file
   - Write header with session metadata
   - Store session state in Map

2. **During Session**
   - All log methods check session exists and is active
   - Append formatted markdown sections for each event
   - Flush stream after each write for durability

3. **Session End**
   - Write session summary (duration, message count)
   - Close write stream
   - Remove from active sessions Map
   - Archive completed sessions if needed

### Markdown Format (Append-Only)

```markdown
# Session: <AgentName>
**Session ID**: <sessionId>
**Started**: <ISO timestamp>

# System Prompt
```
<system prompt content>
```

# Initial MCP Servers
- **Server 1**: `command args`
- **Server 2**: `command args`

# Conversation Log

## User
<user message>

## Assistant
<assistant response>

## Tool Use: <tool-name>
**Tool ID**: <id>
**Input**:
```json
<input JSON>
```

## Tool Result
**Output**:
```json
<output JSON>
```

## MCP Server Added
**Server**: <name> - `command args`
**Time**: <timestamp>

## MCP Server Removed
**Server**: <name>
**Time**: <timestamp>

## User
<next user message>

## Assistant
<next assistant response>

# Session Summary
**Ended**: <ISO timestamp>
**Duration**: <duration>
**Messages**: <count>
**Tool Uses**: <count>
```

## Integration with AgentClaudeBrain and PromptDriver

### Refactoring Steps

1. **Extract Logging Code**
   - Remove all file writing from AgentClaudeBrain
   - Remove conversation tracking logic
   - Keep only core Claude SDK interaction

2. **Inject Logger**
   ```typescript
   class AgentClaudeBrain {
       constructor(api: Anthropic, logger?: IClaudeLogger) {
           this.logger = logger;
       }
   }
   ```

3. **Log at Key Points**
   ```typescript
   public async sendMessage(message: string, sessionId?: string) {
       const activeSessionId = sessionId || this.generateSessionId();
       
       if (!this.hasActiveSession(activeSessionId)) {
           // Start session with all initial configuration
           this.logger?.startSession(
               activeSessionId, 
               this.systemPrompt,
               this.mcpServers,
               this.agentName
           );
       }
       
       this.logger?.logUserMessage(activeSessionId, message);
       
       // ... Claude interaction ...
       
       this.logger?.logAssistantMessage(activeSessionId, response);
       
       return { response, sessionId: activeSessionId };
   }
   ```

4. **Session Cleanup from PromptDriver**
   ```typescript
   class PromptDriver {
       async executeContext(context: string): Promise<string> {
           const { response, sessionId } = await this.brain.sendMessage(context);
           // ... process response ...
           return response;
       }
       
       // Call this method when the conversation is complete
       async endSession(): Promise<void> {
           if (this.currentSessionId) {
               await this.brain.endSession(this.currentSessionId);
               this.currentSessionId = undefined;
           }
       }
   }
   ```

5. **Update IAgentBrain Interface**
   ```typescript
   interface IAgentBrain {
       // ... existing methods ...
       
       /**
        * End a conversation session and trigger cleanup
        */
       endSession?(sessionId: string): Promise<void>;
   }
   ```

6. **Implement endSession in AgentClaudeBrain**
   ```typescript
   public async endSession(sessionId: string): Promise<void> {
       this.logger?.endSession(sessionId);
       // Clean up any session-specific resources
       this.activeSessions.delete(sessionId);
   }
   ```

## Testing Strategy

### Unit Tests
- Mock file system operations
- Test session lifecycle management
- Verify markdown formatting
- Test concurrent session handling
- Validate error recovery

### Integration Tests
- Real file system writes

## Migration Path

1. **Phase 1**: Implement IClaudeLogger and MarkdownClaudeLogger
2. **Phase 2**: Add logger to AgentClaudeBrain as optional dependency
3. **Phase 3**: Run both old and new logging in parallel for validation
4. **Phase 4**: Remove old logging code from AgentClaudeBrain
5. **Phase 5**: Make logger required, remove fallback code

## Configuration

### Environment Variables
```bash
CLAUDE_LOG_DIR=tmp/sessions          # Log directory
```

### Logger Options
```typescript
interface MarkdownLoggerOptions {
    directory?: string;
}
```

## Future Enhancements

1. **Structured Logging**
   - JSON format option alongside Markdown
   - Database backend option
   - Elasticsearch integration

2. **Analytics**
   - Token usage tracking
   - Response time metrics
   - Tool usage patterns
   - Error rate monitoring

3. **Session Management**
   - Session replay capability
   - Session branching/forking
   - Session search and filtering
   - Session compression

4. **Observability**
   - OpenTelemetry integration
   - Distributed tracing support
   - Metrics export to Prometheus
   - Real-time session monitoring UI

## Implementation Todo List

### Phase 1: Core Implementation
- [ ] Create IClaudeLogger interface in src/logging/IClaudeLogger.ts
- [ ] Create supporting types (McpServerConfig, ToolUseInfo, ToolResultInfo)
- [ ] Implement MarkdownClaudeLogger class with basic file operations
- [ ] Add session management Map and file stream handling
- [ ] Implement all logging methods (start/end session, log messages, etc.)

### Phase 2: AgentClaudeBrain Integration
- [ ] Add logger parameter to AgentClaudeBrain constructor
- [ ] Remove existing conversation logging code from AgentClaudeBrain
- [ ] Add endSession method to IAgentBrain interface
- [ ] Implement endSession in AgentClaudeBrain
- [ ] Add logger calls at appropriate points (system prompt, messages, tools)
- [ ] Update AgentBrain base class with endSession stub

### Phase 3: PromptDriver Integration
- [ ] Review endSession method in PromptDriver
- [ ] Call brain.endSession from PromptDriver.endSession
- [ ] Ensure endSession is called on conversation completion

### Phase 4: Testing and Validation
- [ ] Write unit tests for MarkdownClaudeLogger
- [ ] Test concurrent session handling
- [ ] Validate markdown file format and append behavior
- [ ] Test session lifecycle (start, log events, end)
- [ ] Integration test with AgentClaudeBrain and PromptDriver

### Phase 5: Cleanup and Documentation
- [ ] Remove old logging code completely
- [ ] Update documentation
- [ ] Add usage examples

## Success Criteria

1. Zero logging logic in AgentClaudeBrain
2. No lost messages during normal operation
3. Graceful handling of all error conditions
4. Support for 100+ concurrent sessions
5. Sub-millisecond logging overhead
6. Complete session reconstruction from logs
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MarkdownClaudeLogger } from '../../src/logging/MarkdownClaudeLogger.js';
import { McpServerConfig, McpStdioServerConfig, McpHttpServerConfig, ToolUseInfo, ToolResultInfo } from '../../src/logging/IClaudeLogger.js';
import { readFileSync, existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';

describe('MarkdownClaudeLogger', () => {
    const testDir = join(process.cwd(), 'tmp', 'test-sessions');
    let logger: MarkdownClaudeLogger;
    let sessionFiles: string[] = [];

    beforeEach(() => {
        // Clean up any existing test directory before each test
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
        // Create logger with test directory
        logger = new MarkdownClaudeLogger({ directory: testDir });
        sessionFiles = [];
    });

    afterEach(() => {
        // Clean up test directory completely after each test
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    function waitForFile(agentName: string | undefined, index: number, maxRetries: number = 50): string {
        const agentDir = agentName ? agentName.replace(/\s+/g, '') : 'unknown-agent';
        const searchDir = join(testDir, agentDir);
        
        for (let retry = 0; retry < maxRetries; retry++) {
            if (existsSync(searchDir)) {
                const files = readdirSync(searchDir)
                    .filter((f: string) => f.endsWith('.md'))
                    .sort(); // Sort to get files in order (001, 002, etc)
                
                if (files.length > index) {
                    const filePath = join(searchDir, files[index]);
                    sessionFiles.push(filePath);
                    return filePath;
                }
            }
            
            // Wait a bit before retrying (synchronous wait)
            const start = Date.now();
            while (Date.now() - start < 10) {
                // Busy wait 10ms
            }
        }
        
        throw new Error(`File not found for agent ${agentName} at index ${index} after ${maxRetries} retries`);
    }

    function readSessionContent(agentName?: string, index: number = 0): string {
        const filePath = waitForFile(agentName, index);
        return readFileSync(filePath, 'utf-8');
    }

    describe('startSession', () => {
        it('should create a markdown file with system prompt and MCP servers', () => {
            const sessionId = 'test-session-123';
            const systemPrompt = 'You are a helpful assistant specialized in testing.';
            const mcpServers = new Map<string, McpServerConfig>([
                ['server1', { command: 'node', args: ['server1.js', '--port', '3000'] } as McpStdioServerConfig],
                ['server2', { command: 'python', args: ['server2.py'] } as McpStdioServerConfig]
            ]);
            const agentName = 'TestAgent';

            logger.startSession(sessionId, systemPrompt, mcpServers, agentName);
            
            const content = readSessionContent(agentName);
            
            // Verify session header
            expect(content).toContain('# Session: TestAgent');
            expect(content).toContain(`**Session ID**: ${sessionId}`);
            expect(content).toContain('**Started**:');

            // Verify system prompt
            expect(content).toContain('# System Prompt');
            expect(content).toContain(systemPrompt);

            // Verify MCP servers
            expect(content).toContain('# Initial MCP Servers');
            expect(content).toContain('- **server1**: `node server1.js --port 3000`');
            expect(content).toContain('- **server2**: `python server2.py`');
        });

        it('should handle empty MCP servers array', () => {
            const sessionId = 'test-empty-servers';
            const systemPrompt = 'Test prompt without servers';
            
            logger.startSession(sessionId, systemPrompt, new Map(), 'Agent');
            
            const content = readSessionContent('Agent');
            
            expect(content).toContain('# System Prompt');
            expect(content).toContain(systemPrompt);
            expect(content).not.toContain('# Initial MCP Servers');
        });
    });

    describe('conversation logging', () => {
        it('should log a complete conversation flow', () => {
            const sessionId = 'conversation-test';
            logger.startSession(sessionId, 'Be helpful', new Map(), 'ConvoAgent');
            
            // Log user message
            logger.logUserMessage(sessionId, 'What is 2 + 2?');
            
            // Log tool use
            const toolUse: ToolUseInfo = {
                id: 'calc-123',
                name: 'calculator',
                input: { operation: 'add', a: 2, b: 2 },
                timestamp: new Date()
            };
            logger.logToolUse(sessionId, toolUse);
            
            // Log tool result
            const toolResult: ToolResultInfo = {
                toolUseId: 'calc-123',
                output: { result: 4 },
                timestamp: new Date()
            };
            logger.logToolResult(sessionId, toolResult);
            
            // Log assistant response
            logger.logAssistantMessage(sessionId, '2 + 2 equals 4.');
            
            // End session
            logger.endSession(sessionId);
            
            const content = readSessionContent('ConvoAgent');
            
            // Verify conversation flow
            expect(content).toContain('# Conversation Log');
            expect(content).toContain('## User Message');
            expect(content).toContain('What is 2 + 2?');
            expect(content).toContain('## Tool Use: calculator');
            expect(content).toContain('**Tool ID**: calc-123');
            expect(content).toContain('"operation": "add"');
            expect(content).toContain('"a": 2');
            expect(content).toContain('"b": 2');
            expect(content).toContain('## Tool Result');
            expect(content).toContain('"result": 4');
            expect(content).toContain('## Assistant Message');
            expect(content).toContain('2 + 2 equals 4.');
            
            // Verify session summary
            expect(content).toContain('# Session Summary');
            expect(content).toContain('**Messages**: 2');
            expect(content).toContain('**Tool Uses**: 1');
        });
    });

    describe('MCP server management', () => {
        it('should log MCP server additions and removals', () => {
            const sessionId = 'mcp-test';
            const initialServers = new Map<string, McpServerConfig>([
                ['initial', { command: 'node', args: ['initial.js'] } as McpStdioServerConfig]
            ]);
            
            logger.startSession(sessionId, 'Test', initialServers, 'MCPAgent');
            
            // Add a server
            const newServer: McpStdioServerConfig = {
                command: 'python',
                args: ['dynamic.py', '--mode', 'test']
            };
            logger.logMcpServerAdded(sessionId, 'dynamic-server', newServer);
            
            // Log a message
            logger.logUserMessage(sessionId, 'Test message');
            
            // Remove a server
            logger.logMcpServerRemoved(sessionId, 'initial');
            
            logger.endSession(sessionId);
            
            const content = readSessionContent('MCPAgent');
            
            // Check initial servers
            expect(content).toContain('# Initial MCP Servers');
            expect(content).toContain('- **initial**: `node initial.js`');
            
            // Check server addition (should appear in conversation flow)
            expect(content).toContain('## MCP Server Added');
            expect(content).toContain('**Server**: dynamic-server - `python dynamic.py --mode test`');
            
            // Check server removal
            expect(content).toContain('## MCP Server Removed');
            expect(content).toContain('**Server**: initial');
            
            // Verify order - server changes should be interspersed with messages
            const mcpAddIndex = content.indexOf('## MCP Server Added');
            const userMsgIndex = content.indexOf('Test message');
            const mcpRemoveIndex = content.indexOf('## MCP Server Removed');
            
            expect(mcpAddIndex).toBeLessThan(userMsgIndex);
            expect(userMsgIndex).toBeLessThan(mcpRemoveIndex);
        });

        it('should log timestamps and message types', () => {
            const sessionId = 'timestamp-test';
            logger.startSession(sessionId, 'Test', new Map(), 'TimestampAgent', { maxTurns: 10 });
            
            logger.logUserMessage(sessionId, 'Test user message', 10);
            logger.logAssistantMessage(sessionId, 'Intermediate response');
            logger.logAssistantMessage(sessionId, 'Final response', true);
            
            logger.endSession(sessionId);
            
            const content = readSessionContent('TimestampAgent');
            
            // Check for max turns
            expect(content).toContain('**Max Turns**: 10');
            
            // Check user message format
            expect(content).toContain('## User Message');
            expect(content).toContain('**Time**:');
            expect(content).toContain('**Type**: user_request');
            expect(content).toContain('**Max Turns**: 10');
            
            // Check assistant messages
            expect(content).toContain('**Type**: assistant_response');
            expect(content).toContain('**Type**: final_response');
            expect(content).toContain('Final response');
        });

        it('should handle different MCP server types', () => {
            const sessionId = 'mcp-types-test';
            const mixedServers = new Map<string, McpServerConfig>([
                ['stdio-server', { command: 'node', args: ['server.js'] } as McpStdioServerConfig],
                ['http-server', { type: 'http', url: 'http://localhost:8080/mcp' } as McpHttpServerConfig]
            ]);
            
            logger.startSession(sessionId, 'Test', mixedServers, 'MCPTypesAgent');
            logger.endSession(sessionId);
            
            const content = readSessionContent('MCPTypesAgent');
            
            // Check different server formats
            expect(content).toContain('# Initial MCP Servers');
            expect(content).toContain('- **stdio-server**: `node server.js`');
            expect(content).toContain('- **http-server**: Type: http, URL: http://localhost:8080/mcp');
        });
    });

    describe('error logging', () => {
        it('should log errors with stack traces', () => {
            const sessionId = 'error-stack-test';
            logger.startSession(sessionId, 'Test', new Map(), 'ErrorAgent');
            
            logger.logUserMessage(sessionId, 'Please divide by zero');
            
            const error = new Error('Division by zero');
            error.stack = 'Error: Division by zero\n    at Calculator.divide (calc.js:42:15)\n    at test.js:10:20';
            logger.logError(sessionId, error);
            
            logger.logAssistantMessage(sessionId, 'I encountered an error while processing your request.');
            
            logger.endSession(sessionId);
            
            const content = readSessionContent('ErrorAgent');
            
            expect(content).toContain('## Error');
            expect(content).toContain('**Message**: Division by zero');
            expect(content).toContain('**Stack**:');
            expect(content).toContain('at Calculator.divide (calc.js:42:15)');
        });

        it('should log tool errors', () => {
            const sessionId = 'tool-error-result-test';
            logger.startSession(sessionId, 'Test', new Map(), 'Agent');
            
            const toolResult: ToolResultInfo = {
                toolUseId: 'tool-456',
                output: null,
                error: 'Network timeout',
                timestamp: new Date()
            };
            
            logger.logToolResult(sessionId, toolResult);
            logger.endSession(sessionId);
            
            const content = readSessionContent('Agent');
            
            expect(content).toContain('## Tool Result');
            expect(content).toContain('**Error**: Network timeout');
            expect(content).not.toContain('**Output**:');
        });
    });

    describe('session lifecycle', () => {
        it('should track message and tool counts', () => {
            const sessionId = 'count-test';
            logger.startSession(sessionId, 'Test', new Map(), 'Agent');
            
            // Add multiple messages
            logger.logUserMessage(sessionId, 'First question');
            logger.logAssistantMessage(sessionId, 'First answer');
            logger.logUserMessage(sessionId, 'Second question');
            logger.logAssistantMessage(sessionId, 'Second answer');
            
            // Add multiple tool uses
            for (let i = 1; i <= 3; i++) {
                logger.logToolUse(sessionId, {
                    id: `tool-${i}`,
                    name: `tool${i}`,
                    input: {},
                    timestamp: new Date()
                });
            }
            
            logger.endSession(sessionId);
            
            const content = readSessionContent('Agent');
            
            expect(content).toContain('**Messages**: 4');
            expect(content).toContain('**Tool Uses**: 3');
        });

        it('should format duration correctly', (done) => {
            const sessionId = 'duration-test';
            logger.startSession(sessionId, 'Test', new Map(), 'Agent');
            
            // Wait a bit to have measurable duration
            setTimeout(() => {
                logger.endSession(sessionId);
                
                const content = readSessionContent('Agent');
                
                // Should have a duration in the summary
                expect(content).toMatch(/\*\*Duration\*\*: \d+s/);
                done();
            }, 1100); // Wait just over 1 second
        }, 5000); // Increase timeout for this test
    });

    describe('concurrent sessions', () => {
        it('should handle multiple sessions independently', () => {
            const session1 = 'concurrent-1';
            const session2 = 'concurrent-2';
            
            // Start both sessions
            logger.startSession(session1, 'Agent 1 prompt', new Map(), 'Agent1');
            logger.startSession(session2, 'Agent 2 prompt', new Map(), 'Agent2');
            
            // Interleave messages
            logger.logUserMessage(session1, 'Hello from session 1');
            logger.logUserMessage(session2, 'Hello from session 2');
            logger.logAssistantMessage(session1, 'Response to session 1');
            logger.logAssistantMessage(session2, 'Response to session 2');
            
            // End only session 1
            logger.endSession(session1);
            
            // Session 2 should still be active
            logger.logUserMessage(session2, 'Another message for session 2');
            
            logger.endSession(session2);
            
            // Check both files
            const content1 = readSessionContent('Agent1');
            const content2 = readSessionContent('Agent2');
            
            // Session 1 should only have its messages
            expect(content1).toContain('Hello from session 1');
            expect(content1).toContain('Response to session 1');
            expect(content1).not.toContain('Hello from session 2');
            expect(content1).toContain('# Session Summary'); // Should be ended
            
            // Session 2 should have all its messages
            expect(content2).toContain('Hello from session 2');
            expect(content2).toContain('Response to session 2');
            expect(content2).toContain('Another message for session 2');
            expect(content2).not.toContain('Hello from session 1');
            expect(content2).toContain('# Session Summary'); // Should be ended
        });
    });

    describe('edge cases', () => {
        it('should warn when session already exists', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const sessionId = 'duplicate-session';
            
            logger.startSession(sessionId, 'prompt', new Map());
            logger.startSession(sessionId, 'prompt', new Map());
            
            expect(consoleSpy).toHaveBeenCalledWith(`Session ${sessionId} already exists`);
            
            logger.endSession(sessionId);
            consoleSpy.mockRestore();
        });

        it('should handle logging to non-existent session gracefully', () => {
            // Should not throw
            expect(() => {
                logger.logUserMessage('non-existent', 'Test');
                logger.logAssistantMessage('non-existent', 'Test');
                logger.logToolUse('non-existent', {
                    id: 'test',
                    name: 'test',
                    input: {},
                    timestamp: new Date()
                });
            }).not.toThrow();
        });
    });

    describe('cleanup', () => {
        it('should end all active sessions on cleanup', async () => {
            const sessions = ['cleanup-test-1', 'cleanup-test-2', 'cleanup-test-3'];
            
            for (const sessionId of sessions) {
                logger.startSession(sessionId, 'Test', new Map(), 'Agent');
                logger.logUserMessage(sessionId, 'Test message');
            }
            
            // Cleanup should properly wait for all streams to finish
            await logger.cleanup();
            
            // All sessions should have summaries
            // Since they all use 'Agent', we have 3 files (001, 002, 003)
            for (let i = 0; i < sessions.length; i++) {
                const content = readSessionContent('Agent', i);
                expect(content).toContain('# Session Summary');
                expect(content).toContain('**Ended**:');
                expect(content).toContain('**Messages**: 1');
            }
        });
    });
});
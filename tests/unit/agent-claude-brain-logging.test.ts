import { AgentClaudeBrain } from '../../src/agents/AgentClaudeBrain.js';
import type { IBrainLogger } from '../../src/agents/IAgentBrain.js';

describe('AgentClaudeBrain Logging', () => {
    const mockApiKey = 'sk-ant-test-key';
    let brain: AgentClaudeBrain;
    let mockLogger: IBrainLogger;
    let loggedMessages: { level: string; message: string; error?: any }[];
    
    beforeEach(() => {
        loggedMessages = [];
        
        // Create mock logger that captures messages
        mockLogger = {
            info: (message: string) => {
                loggedMessages.push({ level: 'info', message });
            },
            error: (message: string, error?: any) => {
                loggedMessages.push({ level: 'error', message, error });
            },
            warn: (message: string) => {
                loggedMessages.push({ level: 'warn', message });
            },
            debug: (message: string) => {
                loggedMessages.push({ level: 'debug', message });
            }
        };
        
        brain = new AgentClaudeBrain({
            apiKey: mockApiKey,
            workingDirectory: '/tmp/test-workspace'
        }, mockLogger);
    });
    
    describe('MCP Server Logging', () => {
        it('should log initialization details', () => {
            expect(loggedMessages).toContainEqual({
                level: 'debug',
                message: '   AgentClaudeBrain: Initializing with model: haiku, working directory: /tmp/test-workspace'
            });
        });
        
        it('should log when adding a new MCP server', () => {
            brain.addMcpServer('test-server', {
                type: 'http',
                url: 'http://localhost:4001/mcp'
            });
            
            expect(loggedMessages).toContainEqual({
                level: 'info',
                message: "   AgentClaudeBrain: Added MCP server 'test-server' - Type: http, URL: http://localhost:4001/mcp"
            });
        });
        
        it('should log when updating an existing MCP server', () => {
            brain.addMcpServer('test-server', {
                type: 'http',
                url: 'http://localhost:4001/mcp'
            });
            
            brain.addMcpServer('test-server', {
                type: 'http',
                url: 'http://localhost:4002/mcp'
            });
            
            expect(loggedMessages).toContainEqual({
                level: 'info',
                message: "   AgentClaudeBrain: Updated MCP server 'test-server' - Type: http, URL: http://localhost:4002/mcp"
            });
        });
        
        it('should log when removing an existing MCP server', () => {
            brain.addMcpServer('test-server', {
                type: 'stdio',
                command: 'mcp-server'
            });
            
            brain.removeMcpServer('test-server');
            
            expect(loggedMessages).toContainEqual({
                level: 'info',
                message: "   AgentClaudeBrain: Removed MCP server 'test-server'"
            });
        });
        
        it('should log warning when removing non-existent MCP server', () => {
            brain.removeMcpServer('non-existent');
            
            expect(loggedMessages).toContainEqual({
                level: 'warn',
                message: "   AgentClaudeBrain: Attempted to remove non-existent MCP server 'non-existent'"
            });
        });
        
        it('should handle MCP server operations without logger', () => {
            // Create brain without logger
            const brainNoLogger = new AgentClaudeBrain({
                apiKey: mockApiKey,
                workingDirectory: '/tmp/test-workspace'
            });
            
            // These should not throw errors
            expect(() => {
                brainNoLogger.addMcpServer('test', { type: 'http', url: 'http://test' });
                brainNoLogger.removeMcpServer('test');
            }).not.toThrow();
        });
    });
});
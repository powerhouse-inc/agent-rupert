import { AgentClaudeBrain } from '../../src/agents/AgentClaudeBrain.js';

describe('AgentClaudeBrain', () => {
    const mockApiKey = 'sk-ant-test-key';
    
    describe('MCP Server Management', () => {
        let brain: AgentClaudeBrain;
        
        beforeEach(() => {
            brain = new AgentClaudeBrain({
                apiKey: mockApiKey,
                workingDirectory: '/tmp/test-workspace'
            });
        });

        it('should start with no MCP servers when no agent manager URL provided', () => {
            expect(brain.listMcpServers()).toEqual([]);
        });

        it('should include agent-manager server when agent manager URL provided', () => {
            const brainWithManager = new AgentClaudeBrain({
                apiKey: mockApiKey,
                workingDirectory: '/tmp/test-workspace',
                agentManagerMcpUrl: 'http://localhost:3100/mcp'
            });
            
            expect(brainWithManager.listMcpServers()).toContain('agent-manager');
            const config = brainWithManager.getMcpServer('agent-manager');
            expect(config).toBeDefined();
            expect(config?.type).toBe('http');
            expect(config?.url).toBe('http://localhost:3100/mcp');
        });

        it('should add MCP server', () => {
            brain.addMcpServer('vetra', {
                type: 'http',
                url: 'http://localhost:4001/mcp',
                headers: { 'Authorization': 'Bearer token' }
            });

            expect(brain.listMcpServers()).toContain('vetra');
            const config = brain.getMcpServer('vetra');
            expect(config).toBeDefined();
            expect(config?.type).toBe('http');
            expect(config?.url).toBe('http://localhost:4001/mcp');
            expect(config?.headers).toEqual({ 'Authorization': 'Bearer token' });
        });

        it('should remove MCP server', () => {
            brain.addMcpServer('test-server', {
                type: 'stdio',
                command: 'test-mcp',
                args: ['--port', '3000']
            });

            expect(brain.listMcpServers()).toContain('test-server');
            
            const removed = brain.removeMcpServer('test-server');
            expect(removed).toBe(true);
            expect(brain.listMcpServers()).not.toContain('test-server');
        });

        it('should return false when removing non-existent server', () => {
            const removed = brain.removeMcpServer('non-existent');
            expect(removed).toBe(false);
        });

        it('should handle multiple MCP servers', () => {
            brain.addMcpServer('server1', {
                type: 'http',
                url: 'http://localhost:4001/mcp'
            });
            
            brain.addMcpServer('server2', {
                type: 'sse',
                url: 'http://localhost:4002/events'
            });
            
            brain.addMcpServer('server3', {
                type: 'stdio',
                command: 'mcp-server',
                args: ['--mode', 'stdio']
            });

            const servers = brain.listMcpServers();
            expect(servers).toHaveLength(3);
            expect(servers).toContain('server1');
            expect(servers).toContain('server2');
            expect(servers).toContain('server3');
        });

        it('should overwrite existing server when adding with same name', () => {
            brain.addMcpServer('vetra', {
                type: 'http',
                url: 'http://localhost:4001/mcp'
            });

            brain.addMcpServer('vetra', {
                type: 'http',
                url: 'http://localhost:4002/mcp'
            });

            expect(brain.listMcpServers()).toHaveLength(1);
            const config = brain.getMcpServer('vetra');
            expect(config?.url).toBe('http://localhost:4002/mcp');
        });
    });
});
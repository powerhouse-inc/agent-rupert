import { driveUrlToMcpUrl } from '../../src/utils/url-utils.js';

describe('URL Utils', () => {
    describe('driveUrlToMcpUrl', () => {
        it('should transform drive URL to MCP URL', () => {
            const driveUrl = 'http://localhost:4001/d/preview-10e97b52';
            const mcpUrl = driveUrlToMcpUrl(driveUrl);
            expect(mcpUrl).toBe('http://localhost:4001/mcp');
        });

        it('should handle URLs with different paths', () => {
            const driveUrl = 'https://example.com:8080/drives/some-id/documents';
            const mcpUrl = driveUrlToMcpUrl(driveUrl);
            expect(mcpUrl).toBe('https://example.com:8080/mcp');
        });

        it('should handle URLs without port', () => {
            const driveUrl = 'https://api.example.com/d/12345';
            const mcpUrl = driveUrlToMcpUrl(driveUrl);
            expect(mcpUrl).toBe('https://api.example.com/mcp');
        });

        it('should return undefined for undefined input', () => {
            const mcpUrl = driveUrlToMcpUrl(undefined);
            expect(mcpUrl).toBeUndefined();
        });

        it('should return undefined for invalid URL', () => {
            const mcpUrl = driveUrlToMcpUrl('not-a-valid-url');
            expect(mcpUrl).toBeUndefined();
        });

        it('should preserve protocol', () => {
            const httpUrl = 'http://localhost:3000/d/test';
            expect(driveUrlToMcpUrl(httpUrl)).toBe('http://localhost:3000/mcp');
            
            const httpsUrl = 'https://localhost:3000/d/test';
            expect(driveUrlToMcpUrl(httpsUrl)).toBe('https://localhost:3000/mcp');
        });
    });
});
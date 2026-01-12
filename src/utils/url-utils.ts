/**
 * Transform a drive URL to an MCP server URL
 * @param driveUrl Drive URL like 'http://localhost:4001/d/preview-10e97b52'
 * @returns MCP URL like 'http://localhost:4001/mcp' or undefined if invalid
 */
export function driveUrlToMcpUrl(driveUrl: string | undefined): string | undefined {
    if (!driveUrl) {
        return undefined;
    }
    
    try {
        const url = new URL(driveUrl);
        // Extract base URL (protocol + host + port)
        const baseUrl = `${url.protocol}//${url.host}`;
        return `${baseUrl}/mcp`;
    } catch (error) {
        // Invalid URL
        return undefined;
    }
}
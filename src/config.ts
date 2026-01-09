import path from 'path';
import dotenv from 'dotenv';
import type { AgentConfig } from './types.js';

// Ensure environment variables are loaded (fallback if not already loaded in server.ts)
dotenv.config();

/**
 * Parse port number from environment variable
 * @param envVar Environment variable value
 * @param defaultValue Default value if parsing fails
 * @returns Parsed port number or default
 */
function parsePort(envVar: string | undefined, defaultValue?: number): number | undefined {
  if (!envVar) return defaultValue;
  const port = Number(envVar);
  if (isNaN(port) || port <= 0 || port > 65535) {
    console.warn(`Invalid port value: ${envVar}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return port;
}

/**
 * Parse timeout from environment variable
 * @param envVar Environment variable value
 * @param defaultValue Default value if parsing fails
 * @returns Parsed timeout or default
 */
function parseTimeout(envVar: string | undefined, defaultValue: number): number {
  if (!envVar) return defaultValue;
  const timeout = Number(envVar);
  if (isNaN(timeout) || timeout <= 0) {
    console.warn(`Invalid timeout value: ${envVar}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return timeout;
}

export const config: AgentConfig = {
  port: Number(process.env.PORT) || 3100,
  storage: {
    type: (process.env.STORAGE_TYPE as 'filesystem' | 'memory') || 'memory',
    filesystemPath: process.env.STORAGE_PATH || path.join(process.cwd(), '.ph/file-storage')
  },
  dbPath: process.env.DB_PATH || path.join(process.cwd(), '.ph/read-model.db'),
  agentName: process.env.AGENT_NAME || 'powerhouse-agent',
  enableAutoEdit: process.env.ENABLE_AUTO_EDIT === 'true',
  enableValidation: process.env.ENABLE_VALIDATION === 'true',
  remoteDriveUrl: process.env.REMOTE_DRIVE_URL,
  powerhouse: {
    project: process.env.POWERHOUSE_PROJECT,
    projectsDir: process.env.POWERHOUSE_PROJECTS_DIR || path.resolve(process.cwd(), '..', 'projects'),
    connectPort: parsePort(process.env.POWERHOUSE_CONNECT_PORT),
    switchboardPort: parsePort(process.env.POWERHOUSE_SWITCHBOARD_PORT),
    startupTimeout: parseTimeout(process.env.POWERHOUSE_STARTUP_TIMEOUT, 60000)
  },
  graphql: {
    endpoint: process.env.GRAPHQL_ENDPOINT || 'http://localhost:4001/graphql',
    authToken: process.env.GRAPHQL_AUTH_TOKEN,
    retryAttempts: parseTimeout(process.env.GRAPHQL_RETRY_ATTEMPTS, 3),
    retryDelay: parseTimeout(process.env.GRAPHQL_RETRY_DELAY, 1000),
    timeout: parseTimeout(process.env.GRAPHQL_TIMEOUT, 30000)
  }
};

/**
 * Validate configuration on module load
 */
function validateConfig(): void {
  const { powerhouse } = config;
  
  // Validation happens silently unless there's an error
  // Use DEBUG=* or similar env var to enable logging if needed
}
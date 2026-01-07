import path from 'path';
import type { AgentConfig } from './types.js';

export const config: AgentConfig = {
  port: Number(process.env.PORT) || 3100,
  storage: {
    type: (process.env.STORAGE_TYPE as 'filesystem' | 'memory') || 'memory',
    filesystemPath: process.env.STORAGE_PATH || path.join(process.cwd(), '.ph/file-storage')
  },
  dbPath: process.env.DB_PATH || path.join(process.cwd(), '.ph/read-model.db'),
  agentName: process.env.AGENT_NAME || 'powerhouse-agent',
  enableAutoEdit: process.env.ENABLE_AUTO_EDIT === 'true',
  enableValidation: process.env.ENABLE_VALIDATION === 'true'
};
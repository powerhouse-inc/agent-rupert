import type { IDocumentDriveServer } from 'document-drive';

export type StorageOptions = {
  type: 'filesystem' | 'memory';
  filesystemPath?: string;
};

export type AgentConfig = {
  port: number;
  storage: StorageOptions;
  dbPath?: string;
  agentName: string;
  enableAutoEdit: boolean;
  enableValidation: boolean;
  remoteDriveUrl?: string;
};

export type ReactorInstance = {
  driveServer: IDocumentDriveServer;
  reactor: any; // Will be properly typed when we implement the queue system
  client: any;  // Will be properly typed when we implement the queue system
};
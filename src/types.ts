import type { IDocumentDriveServer } from 'document-drive';

export type StorageOptions = {
  type: 'filesystem' | 'memory';
  filesystemPath?: string;
};

export type ReactorPackageConfig = {
  /** Name of the Powerhouse project to auto-start on server startup */
  project?: string;
  /** Directory containing all Powerhouse projects (default: ../projects) */
  projectsDir: string;
  /** Optional override for Connect Studio port */
  connectPort?: number;
  /** Optional override for Vetra Switchboard port */
  switchboardPort?: number;
  /** Timeout for waiting for project startup in milliseconds (default: 60000) */
  startupTimeout: number;
};

export type GraphQLConfig = {
  endpoint: string;
  authToken?: string;
  retryAttempts: number;
  retryDelay: number;
  timeout: number;
};

export type AgentConfig = {
  port: number;
  storage: StorageOptions;
  dbPath?: string;
  agentName: string;
  enableAutoEdit: boolean;
  enableValidation: boolean;
  remoteDriveUrl?: string;
  powerhouse: ReactorPackageConfig;
  graphql: GraphQLConfig;
};

export type ServerConfig = {
  agents: {
    reactorPackageAgents: {

    },
    powerhouseArchitectAgents: {

    }
  }
}

type WorkDocument = {
  documentType: string;
  documentId: string;
}

type BaseAgentConfig = {
  name: string;
  reactor: {
    storage: StorageOptions;
    driveUrl: string;
    documents: {
      inbox: WorkDocument;
      wbs: WorkDocument;
    },
  }
}

export type ReactorPackageAgentConfig = BaseAgentConfig & {
  projectDir: string;
  defaultProject: string;
  
}

export type PowerhouseArchitectAgentConfig = BaseAgentConfig & {
  
}

export type ReactorInstance = {
  driveServer: IDocumentDriveServer;
  reactor: any; // Will be properly typed when we implement the queue system
  client: any;  // Will be properly typed when we implement the queue system
};
import type { IDocumentDriveServer } from 'document-drive';

export type StorageOptions = {
  type: 'filesystem' | 'memory';
  filesystemPath?: string;
  filesystemDbPath?: string;
};

export type ReactorPackageConfig = {
  /** Name of the Powerhouse project to auto-start on server startup */
  project?: string;
  /** Directory containing all Powerhouse projects (default: ../projects/reactor-packages) */
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
  serverPort: number;
  anthropicApiKey: string | null;
  agents: {
    reactorPackageDev: ReactorPackageDevAgentConfig;
    powerhouseArchitect: PowerhouseArchitectAgentConfig;
  }
}

type AgentWorkDocument = {
  documentType: string;
  documentId: string | null;
}

export type BaseAgentConfig = {
  name: string;
  workDrive: {
    reactorStorage: StorageOptions;
    driveUrl: string | null;
    documents: {
      inbox: AgentWorkDocument;
      wbs: AgentWorkDocument;
    },
  }
}

export type ReactorPackageDevAgentConfig = BaseAgentConfig & {
  reactorPackages: {
    projectsDir: string;
    defaultProjectName: string;
    autoStartDefaultProject: boolean;
  };
  vetraConfig: {
    connectPort: number;
    switchboardPort: number;
    startupTimeout: number;
  };
}

export type PowerhouseArchitectAgentConfig = BaseAgentConfig & {}
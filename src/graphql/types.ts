export enum ProjectStatus {
  MISSING = 'MISSING',
  INITIALIZING = 'INITIALIZING',
  STOPPED = 'STOPPED',
  RUNNING = 'RUNNING',
  DELETED = 'DELETED'
}

export enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR'
}

export enum LogSource {
  SYSTEM = 'SYSTEM',
  APPLICATION = 'APPLICATION',
  USER = 'USER'
}

export interface ProjectRuntime {
  pid?: number;
  startedAt?: string;
  driveUrl?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  source: LogSource;
  metadata?: Record<string, any>;
}

export interface AgentProject {
  id: string;
  name: string;
  path: string;
  port?: number;
  status: ProjectStatus;
  autoStart: boolean;
  commandTimeout: number;
  runtime?: ProjectRuntime;
  logs: LogEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  id?: string;
  name: string;
  path: string;
  port?: number;
  autoStart?: boolean;
  commandTimeout?: number;
}

export interface RunProjectInput {
  id: string;
}

export interface StopProjectInput {
  id: string;
}

export interface DeleteProjectInput {
  id: string;
}

export interface UpdateProjectStatusInput {
  id: string;
  status: ProjectStatus;
}

export interface UpdateProjectRuntimeInput {
  id: string;
  runtime: ProjectRuntime;
}

export interface UpdateProjectConfigInput {
  id: string;
  port?: number;
  autoStart?: boolean;
  commandTimeout?: number;
}

export interface AddLogEntryInput {
  projectId: string;
  level: LogLevel;
  message: string;
  source: LogSource;
  metadata?: Record<string, any>;
}

export interface RegisterProjectInput {
  path: string;
}

export interface GraphQLResponse<T> {
  success: boolean;
  message?: string;
  document?: T;
}

export interface GraphQLError {
  message: string;
  path?: string[];
  extensions?: Record<string, any>;
}
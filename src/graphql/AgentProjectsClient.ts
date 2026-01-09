import { DocumentNode, print } from 'graphql';

import {
  AgentProject,
  CreateProjectInput,
  RunProjectInput,
  StopProjectInput,
  DeleteProjectInput,
  UpdateProjectStatusInput,
  UpdateProjectRuntimeInput,
  UpdateProjectConfigInput,
  AddLogEntryInput,
  RegisterProjectInput,
  GraphQLResponse,
  LogLevel,
  LogSource
} from './types.js';
import {
  CREATE_PROJECT,
  RUN_PROJECT,
  STOP_PROJECT,
  DELETE_PROJECT,
  UPDATE_PROJECT_STATUS,
  UPDATE_PROJECT_RUNTIME,
  UPDATE_PROJECT_CONFIG,
  ADD_LOG_ENTRY,
  REGISTER_PROJECT,
  GET_PROJECT,
  GET_ALL_PROJECTS
} from './operations.js';

export interface AgentProjectsClientConfig {
  endpoint: string;
  headers?: Record<string, string>;
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}

interface QueuedMutation {
  operation: DocumentNode;
  variables: Record<string, any>;
  timestamp: number;
  retries: number;
}

export class AgentProjectsClient {
  private config: Required<AgentProjectsClientConfig>;
  private mutationQueue: QueuedMutation[] = [];
  private isProcessingQueue = false;
  private queueTimer?: NodeJS.Timeout;

  constructor(config: AgentProjectsClientConfig) {
    this.config = {
      endpoint: config.endpoint,
      headers: config.headers || {},
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      timeout: config.timeout ?? 30000
    };
  }

  private async executeGraphQL<T>(
    operation: DocumentNode,
    variables?: Record<string, any>,
    retryCount = 0
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    const requestBody = {
      query: print(operation),
      variables
    };
    
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        // Silently handle HTTP errors - they'll be thrown as exceptions
        throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
      }

      const data = await response.json();

      if (data.errors && data.errors.length > 0) {
        const error = new Error(data.errors[0].message);
        (error as any).graphQLErrors = data.errors;
        throw error;
      }

      return data.data;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }

      if (retryCount < this.config.retryAttempts) {
        await this.delay(this.config.retryDelay * Math.pow(2, retryCount));
        return this.executeGraphQL<T>(operation, variables, retryCount + 1);
      }

      throw error;
    }
  }

  private async executeWithQueue<T>(
    operation: DocumentNode,
    variables?: Record<string, any>
  ): Promise<T> {
    try {
      return await this.executeGraphQL<T>(operation, variables);
    } catch (error) {
      // Add failed mutation to queue for retry
      this.addToQueue(operation, variables || {});
      throw error;
    }
  }

  private addToQueue(operation: DocumentNode, variables: Record<string, any>) {
    this.mutationQueue.push({
      operation,
      variables,
      timestamp: Date.now(),
      retries: 0
    });
    this.scheduleQueueProcessing();
  }

  private scheduleQueueProcessing() {
    if (this.queueTimer) {
      clearTimeout(this.queueTimer);
    }
    this.queueTimer = setTimeout(() => this.processQueue(), 5000);
  }

  private async processQueue() {
    if (this.isProcessingQueue || this.mutationQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    const queue = [...this.mutationQueue];
    this.mutationQueue = [];

    for (const item of queue) {
      try {
        await this.executeGraphQL(item.operation, item.variables);
        // Successfully processed queued mutation
      } catch (error) {
        item.retries++;
        if (item.retries < this.config.retryAttempts) {
          this.mutationQueue.push(item);
        } else {
          // Failed to process queued mutation after max retries
        }
      }
    }

    this.isProcessingQueue = false;

    if (this.mutationQueue.length > 0) {
      this.scheduleQueueProcessing();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async createProject(input: CreateProjectInput): Promise<GraphQLResponse<AgentProject>> {
    const result = await this.executeWithQueue<{ createProject: GraphQLResponse<AgentProject> }>(
      CREATE_PROJECT,
      { input }
    );
    return result?.createProject;
  }

  async runProject(id: string): Promise<GraphQLResponse<AgentProject>> {
    const input: RunProjectInput = { id };
    const result = await this.executeWithQueue<{ runProject: GraphQLResponse<AgentProject> }>(
      RUN_PROJECT,
      { input }
    );
    return result?.runProject;
  }

  async stopProject(id: string): Promise<GraphQLResponse<AgentProject>> {
    const input: StopProjectInput = { id };
    const result = await this.executeWithQueue<{ stopProject: GraphQLResponse<AgentProject> }>(
      STOP_PROJECT,
      { input }
    );
    return result?.stopProject;
  }

  async deleteProject(id: string): Promise<GraphQLResponse<void>> {
    const input: DeleteProjectInput = { id };
    const result = await this.executeWithQueue<{ deleteProject: GraphQLResponse<void> }>(
      DELETE_PROJECT,
      { input }
    );
    return result?.deleteProject;
  }

  async updateProjectStatus(
    id: string,
    status: UpdateProjectStatusInput['status']
  ): Promise<GraphQLResponse<AgentProject>> {
    const input: UpdateProjectStatusInput = { id, status };
    const result = await this.executeWithQueue<{ updateProjectStatus: GraphQLResponse<AgentProject> }>(
      UPDATE_PROJECT_STATUS,
      { input }
    );
    return result?.updateProjectStatus;
  }

  async updateProjectRuntime(
    id: string,
    runtime: UpdateProjectRuntimeInput['runtime']
  ): Promise<GraphQLResponse<AgentProject>> {
    const input: UpdateProjectRuntimeInput = { id, runtime };
    const result = await this.executeWithQueue<{ updateProjectRuntime: GraphQLResponse<AgentProject> }>(
      UPDATE_PROJECT_RUNTIME,
      { input }
    );
    return result?.updateProjectRuntime;
  }

  async updateProjectConfig(
    id: string,
    config: Omit<UpdateProjectConfigInput, 'id'>
  ): Promise<GraphQLResponse<AgentProject>> {
    const input: UpdateProjectConfigInput = { id, ...config };
    const result = await this.executeWithQueue<{ updateProjectConfig: GraphQLResponse<AgentProject> }>(
      UPDATE_PROJECT_CONFIG,
      { input }
    );
    return result?.updateProjectConfig;
  }

  async addLogEntry(
    projectId: string,
    level: LogLevel,
    message: string,
    source: LogSource = LogSource.SYSTEM,
    metadata?: Record<string, any>
  ): Promise<GraphQLResponse<AgentProject>> {
    const input: AddLogEntryInput = {
      projectId,
      level,
      message,
      source,
      metadata
    };
    const result = await this.executeWithQueue<{ addLogEntry: GraphQLResponse<AgentProject> }>(
      ADD_LOG_ENTRY,
      { input }
    );
    return result?.addLogEntry;
  }

  async registerProject(path: string): Promise<GraphQLResponse<AgentProject>> {
    const input: RegisterProjectInput = { path };
    const result = await this.executeWithQueue<{ registerProject: GraphQLResponse<AgentProject> }>(
      REGISTER_PROJECT,
      { input }
    );
    return result?.registerProject;
  }

  async getProject(id: string): Promise<AgentProject | null> {
    try {
      const result = await this.executeGraphQL<{ getDocument: AgentProject }>(
        GET_PROJECT,
        { id }
      );
      return result?.getDocument || null;
    } catch (error) {
      // Return null if project fetch fails
      return null;
    }
  }

  async getAllProjects(): Promise<AgentProject[]> {
    try {
      const result = await this.executeGraphQL<{ getDocuments: AgentProject[] }>(
        GET_ALL_PROJECTS
      );
      return result?.getDocuments || [];
    } catch (error) {
      // Return empty array if projects fetch fails
      return [];
    }
  }

  async flushQueue(): Promise<void> {
    if (this.queueTimer) {
      clearTimeout(this.queueTimer);
      this.queueTimer = undefined;
    }
    await this.processQueue();
  }

  getQueueSize(): number {
    return this.mutationQueue.length;
  }
}
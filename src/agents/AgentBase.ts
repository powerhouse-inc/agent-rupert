
import { InMemoryCache, MemoryStorage, ReactorBuilder, driveDocumentModelModule } from 'document-drive';
import type { IDriveOperationStorage } from 'document-drive/storage/types';
import type { ReactorInstance, BaseAgentConfig } from '../types.js';
import { documentModels } from 'powerhouse-agent';
import { documentModelDocumentModelModule } from 'document-model';
import { FilesystemStorage } from 'document-drive/storage/filesystem';
import type { IAgentBrain } from './IAgentBrain.js';
import type { BrainConfig } from './BrainFactory.js';
import type { AgentBrainPromptContext } from '../types/prompt-context.js';

// Logger interface for dependency injection
export interface ILogger {
    info(message: string): void;
    error(message: string, error?: any): void;
    warn(message: string): void;
    debug(message: string): void;
}

// Re-export BaseAgentConfig type for convenience
export type { BaseAgentConfig } from '../types.js';

/**
 *  The AgentBase class implements a Powerhouse Agent which operates as follows: 
 * 
 *  - The agent has a Claude agent as brain and runs a Powerhouse Reactor with a 
 *    number of work documents that it uses for communication, planning and delegation of tasks.
 * 
 *  - The Powerhouse Agent:
 *      (1) maintains a powerhouse/messages document with message threads with stakeholders
 *      (2) maintains a powerhouse/work-breakdown-structure (WBS) with its goals and their status
 *      (3) can determine if it's capable of achieving a goal by 
 *          (a) breaking it down in subgoals
 *          (b) perform a task directly
 *          (c) or delegate a task to an underling
 *      (3) has zero or more tools that it can use to perform tasks by itself
 *      (4) has zero or more underling agents that it can delegate tasks to
 *      (5) has an execution loop which is detailed below
 * 
 *  - In its execution loop, the Powerhouse Agent: 
 *      (1) Reviews its WBS for context to understand what it is working on
 *      (2) Processes unread messages by extracting and categorizing requests and replies from stakeholders: 
 *          - Stakeholder responses to earlier feedback requests are applied to the WBS. It determines if 
 *            a stakeholder response unblocks the goal it's related to.
 *              - If so, it unblocks the goal in the WBS
 *              - If not, it adds a note to the WBS goal and asks the stakeholder another question
 *          - New work requests are applied to the WBS
 *              - New goals can be created in as draft or ready mode. If a goal is in draft mode, the Agent 
 *                may request additional stakeholder info.
 *              - Goals can be marked as WONT_DO to remove them from scope
 *              - The goal hierarchy can be reshuffled by moving goals and subgoals around
 *          - New information requests from stakeholders are:
 *              - either replied to directly, if the agent can reply based on its WBS
 *              - or simply acknowledged if the question needs to be delegated to an underling
 *      (3) Extracts 0 to N next active_work_steps from the active WBS goals and works on them
 *          - If a goal is In Review, that gets priority
 *          - If a goal is In Progress, that gets worked on next
 *          - If a goal is Delegated, the Agent will check on its status
 *      (4) If active_work_steps < N the Agent will decide what to work on next
 *          - A goal can be moved from TODO to IN_PROGRESS
 *          - A goal can be moved from TODO to DELEGATED
 *      
 */
export abstract class AgentBase<TConfig extends BaseAgentConfig = BaseAgentConfig> {
    protected reactor?: ReactorInstance;
    protected config: TConfig;
    protected logger: ILogger;
    protected brain?: IAgentBrain;
    
    /**
     * Get the brain configuration for this agent type
     * @param apiKey Optional Anthropic API key
     * @returns BrainConfig or null if no brain is needed
     */
    static getBrainConfig(apiKey?: string): BrainConfig | null {
        // Default implementation returns null (no brain)
        // Subclasses should override this to provide their specific configuration
        return null;
    }
    
    /**
     * Get the prompt template paths for this agent type
     * @returns Array of template file paths or empty array if no templates
     */
    static getPromptTemplatePaths(): string[] {
        // Default implementation returns base template only
        return ['prompts/AgentBase.md'];
    }
    
    /**
     * Build the prompt context for this agent
     * @param config Agent configuration
     * @param serverPort Server port number
     * @param mcpServers List of MCP server names
     * @returns Prompt context data
     */
    static buildPromptContext(
        config: BaseAgentConfig,
        serverPort: number,
        mcpServers: string[] = []
    ): AgentBrainPromptContext {
        // Base implementation builds minimal context
        return {
            serverPort,
            anthropicApiKey: false, // Will be set by subclass or manager
            agentName: config.name,
            agentType: 'ReactorPackageDevAgent', // Will be overridden by subclasses
            timestamp: new Date().toISOString(),
            mcpServers,
            model: 'haiku',
            driveUrl: config.workDrive?.driveUrl || undefined,
            documentIds: {
                inbox: config.workDrive?.documents?.inbox?.documentId || undefined,
                wbs: config.workDrive?.documents?.wbs?.documentId || undefined
            },
            storageType: config.workDrive?.reactorStorage?.type
        };
    }
    
    constructor(config: TConfig, logger: ILogger, brain?: IAgentBrain) {
        this.config = config;
        this.logger = logger;
        this.brain = brain;
        
        // Set logger on brain if provided
        if (brain) {
            brain.setLogger(logger);
        }
        
        this.logger.info(`${config.name}: Initialized${brain ? ' with brain' : ''}`);
    }
    
    /**
     * Initialize the agent's reactor with custom configuration
     * Each agent can override to customize document models, storage, etc.
     */
    private async initializeReactor(): Promise<void> {
        this.logger.info(`${this.config.name}: Starting reactor initialization`);
        
        // Core reactor initialization logic moved from reactor-setup.ts
        // Get document models (can be customized by subclasses)
        const models = this.getDocumentModels();
        this.logger.debug(`${this.config.name}: Loaded ${models.length} document models`);
        
        // Create ReactorBuilder with document models
        const builder = new ReactorBuilder(models as any)
            .withCache(await this.createCache())
            .withStorage(await this.createStorage());
        
        // Build reactor
        const driveServer = builder.build();
        await driveServer.initialize();
        this.logger.info(`${this.config.name}: Reactor built and initialized`);
        
        // Store reactor instance
        this.reactor = {
            driveServer,
            reactor: null as any, // Will be implemented when needed for queue system
            client: null as any   // Will be implemented when needed for queue system
        };
        
        // Connect to remote drives if configured
        if (this.config.workDrive.driveUrl) {
            await this.connectRemoteDrive(this.config.workDrive.driveUrl);
        }
        
        // Set up document event listeners
        this.setupDocumentEventListeners();
    }
    
    /**
     * Connect to a remote drive
     */
    private async connectRemoteDrive(remoteDriveUrl: string): Promise<void> {
        if (!this.reactor?.driveServer) {
            throw new Error('Reactor not initialized');
        }
        
        // Temporarily suppress console errors from the document-drive library
        const originalConsoleError = console.error;
        const originalProcessStderr = process.stderr.write;
        
        try {
            this.logger.info(`${this.config.name}: Connecting to remote drive: ${remoteDriveUrl}`);
            
            // Suppress error logging during addRemoteDrive
            console.error = () => {};
            process.stderr.write = () => true;
            
            await this.reactor.driveServer.addRemoteDrive(remoteDriveUrl, {
                sharingType: "public",
                availableOffline: true,
                listeners: [
                    {
                        block: true,
                        callInfo: {
                            data: remoteDriveUrl,
                            name: "switchboard-push",
                            transmitterType: "SwitchboardPush",
                        },
                        filter: {
                            branch: ["main"],
                            documentId: ["*"],
                            documentType: ["*"],
                            scope: ["global"],
                        },
                        label: "Switchboard Sync",
                        listenerId: crypto.randomUUID(),
                        system: true,
                    },
                ],
                triggers: [],
            });
            this.logger.info(`${this.config.name}: ✅ Successfully connected to remote drive`);
        } catch (error) {
            // Extract meaningful error message
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const isConnectionRefused = errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Connection refused');
            const isDriveNotFound = errorMessage.includes("Couldn't find drive info");
            
            if (isConnectionRefused) {
                this.logger.warn(`${this.config.name}: 💡 Remote drive service not available - continuing in local mode`);
            } else if (isDriveNotFound) {
                this.logger.warn(`${this.config.name}: 💡 Remote drive not found - continuing in local mode`);
            } else {
                this.logger.warn(`${this.config.name}: 💡 Unable to connect to remote drive - continuing in local mode`);
            }
            // Don't throw - allow agent to continue without remote drive
        } finally {
            // Restore console logging
            console.error = originalConsoleError;
            process.stderr.write = originalProcessStderr;
        }
    }
    
    protected getDocumentModels(): any[] {
            // ReactorPackageAgent uses powerhouse document models
            return [
                ...documentModels,
                driveDocumentModelModule,
                documentModelDocumentModelModule
            ];
        }
    
    /**
     * Override in subclasses to provide custom cache (optional)
     * Defaults to InMemoryCache
     */
    protected async createCache(): Promise<any> {
        return new InMemoryCache();
    }
    
    /**
     * Override in subclasses to customize storage
     */
    protected async createStorage(): Promise<IDriveOperationStorage> {
        const storage = this.config.workDrive.reactorStorage;
        if (storage?.type === 'filesystem' && storage.filesystemPath) {
            this.logger.info(`${this.config.name}: Using filesystem storage at ${storage.filesystemPath}`);
            return new FilesystemStorage(storage.filesystemPath);
        } else {
            this.logger.info(`${this.config.name}: Using in-memory storage`);
            return new MemoryStorage();
        }
    }
    
    /**
     * Initialize the agent - must be called before using the agent
     */
    public async initialize(): Promise<void> {
        this.logger.info(`${this.config.name}: Beginning initialization`);
        await this.initializeReactor();
        this.logger.info(`${this.config.name}: Initialization complete`);
    }
    
    /**
     * Shutdown the agent and clean up resources
     */
    public async shutdown(): Promise<void> {
        this.logger.info(`${this.config.name}: Shutting down`);
        return Promise.resolve();
    }
    
    /**
     * Get the reactor instance
     */
    protected getReactor(): ReactorInstance {
        if (!this.reactor) {
            throw new Error('Reactor not initialized - call initialize() first');
        }

        return this.reactor;
    }

    public getName(): string {
        return this.config.name;
    }
    
    /**
     * Set up event listeners for document updates
     * Listens for operations on configured inbox and WBS documents
     */
    private setupDocumentEventListeners(): void {
        if (!this.reactor?.driveServer) return;
        
        const { inbox, wbs } = this.config.workDrive.documents;
        
        this.logger.info(`${this.config.name}: Setting up document event listeners`);
        
        // Listen for operations on documents
        this.reactor.driveServer.on('operationsAdded', (documentId: string, operations: any[]) => {
            // Check if this is our inbox document
            if (inbox?.documentId && documentId === inbox.documentId) {
                this.logger.info(`${this.config.name}: Inbox document updated - ${operations.length} operations`);
                this.handleInboxUpdate(documentId, operations);
            }
            // Check if this is our WBS document
            else if (wbs?.documentId && documentId === wbs.documentId) {
                this.logger.info(`${this.config.name}: WBS document updated - ${operations.length} operations`);
                this.handleWbsUpdate(documentId, operations);
            }
        });
        
        // Listen for new documents added
        this.reactor.driveServer.on('documentAdded', (document: any) => {
            // Check if it's a document type we care about
            if (inbox && document.documentType === inbox.documentType) {
                this.logger.info(`${this.config.name}: New inbox document added: ${document.id}`);
                // Could update config if this is our first inbox document
            } else if (wbs && document.documentType === wbs.documentType) {
                this.logger.info(`${this.config.name}: New WBS document added: ${document.id}`);
                // Could update config if this is our first WBS document
            }
        });
    }
    
    /**
     * Abstract method - must be implemented by subclasses
     * Called when the agent's inbox document receives updates
     */
    protected abstract handleInboxUpdate(documentId: string, operations: any[]): void | Promise<void>;
    
    /**
     * Abstract method - must be implemented by subclasses  
     * Called when the agent's WBS document receives updates
     */
    protected abstract handleWbsUpdate(documentId: string, operations: any[]): void | Promise<void>;
}
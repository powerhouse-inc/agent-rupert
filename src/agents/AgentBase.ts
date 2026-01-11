
import { InMemoryCache, MemoryStorage, ReactorBuilder, logger, driveDocumentModelModule } from 'document-drive';
import type { IDriveOperationStorage } from 'document-drive/storage/types';
import type { ReactorInstance } from '../types.js';
import { documentModels } from 'powerhouse-agent';
import { documentModelDocumentModelModule } from 'document-model';
import { FilesystemStorage } from 'document-drive/storage/filesystem';
import path from 'path';

// Configuration types
export interface ReactorConfig {
    remoteDriveUrl?: string;
    storage?: {
        type: 'filesystem' | 'memory';
        filesystemPath?: string;
    };
}

export interface AgentConfig {
    reactor?: ReactorConfig;
}

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
export abstract class AgentBase {
    protected reactor?: ReactorInstance;
    protected reactorConfig?: ReactorConfig;
    
    constructor(config?: AgentConfig) {
        this.reactorConfig = config?.reactor;
    }
    
    /**
     * Initialize the agent's reactor with custom configuration
     * Each agent can override to customize document models, storage, etc.
     */
    private async initializeReactor(): Promise<void> {
        // Core reactor initialization logic moved from reactor-setup.ts
        // Get document models (can be customized by subclasses)
        const models = this.getDocumentModels();
        
        // Create ReactorBuilder with document models
        const builder = new ReactorBuilder(models as any)
            .withCache(await this.createCache())
            .withStorage(await this.createStorage());
        
        // Build reactor
        const driveServer = builder.build();
        await driveServer.initialize();
        
        // Store reactor instance
        this.reactor = {
            driveServer,
            reactor: null as any, // Will be implemented when needed for queue system
            client: null as any   // Will be implemented when needed for queue system
        };
        
        // Connect to remote drives if configured
        if (this.reactorConfig?.remoteDriveUrl) {
            await this.connectRemoteDrive(this.reactorConfig.remoteDriveUrl);
        }
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
            logger.info(`🔗 Connecting to remote drive: ${remoteDriveUrl}`);
            
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
            logger.info(`✅ Successfully connected to remote drive`);
        } catch (error) {
            // Extract meaningful error message
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const isConnectionRefused = errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Connection refused');
            const isDriveNotFound = errorMessage.includes("Couldn't find drive info");
            
            if (isConnectionRefused) {
                logger.info(`💡 Remote drive service not available - continuing in local mode`);
            } else if (isDriveNotFound) {
                logger.info(`💡 Remote drive not found - continuing in local mode`);
            } else {
                logger.info(`💡 Unable to connect to remote drive - continuing in local mode`);
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
        // Use filesystem storage for ReactorPackageAgent if configured
        if (this.reactorConfig?.storage?.type === 'filesystem') {
            const storagePath = this.reactorConfig.storage.filesystemPath || 
                path.join(process.cwd(), '.ph', 'file-storage');
            
            return new FilesystemStorage(storagePath);
        }

        return new MemoryStorage();
    }
    
    /**
     * Initialize the agent - must be called before using the agent
     */
    public async initialize(): Promise<void> {
        return this.initializeReactor();
    }
    
    /**
     * Shutdown the agent and clean up resources
     */
    public async shutdown(): Promise<void> {
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
}
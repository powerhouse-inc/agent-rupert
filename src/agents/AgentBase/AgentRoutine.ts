import { ScenarioExecutionResult, SkillExecutionResult, TaskResponse } from "../../prompts/PromptDriver.js";
import { IScenarioFlow } from "../../prompts/flows/IScenarioFlow.js";
import { ISkillFlow } from "../../prompts/flows/ISkillFlow.js";
import { AgentInboxDocument } from "powerhouse-agent/document-models/agent-inbox";
import { WorkBreakdownStructureDocument } from "powerhouse-agent/document-models/work-breakdown-structure";
import { InboxRoutineHandler } from "./InboxHandlingFlow.js";
import { WbsRoutineHandler } from "./WbsHandler.js";
import { AgentBase, ILogger } from "./AgentBase.js";
import type { IDocumentDriveServer } from 'document-drive';
import type { BaseAgentConfig } from '../../types.js';
import type { InboxHandlingFlowContext } from './InboxHandlingFlowContext.js';

export type WorkItemType = 'skill' | 'scenario' | 'task' | 'idle';

export type WorkItemParams<TContext = any> = {
    skillName: string,
    scenarioId?: string,
    taskId?: string,
    context?: TContext,
    options?: {
        maxTurns?: number;
        sessionId?: string;
        captureSession?: boolean;
    },
    skillFlow?: ISkillFlow,
    scenarioFlow?: IScenarioFlow,
};

export type AgentRoutineWorkItem<TContext = any> = {
    type: WorkItemType,
    status: 'queued' | 'in-progress' | 'succeeded' | 'failed' | 'terminated',
    params: WorkItemParams<TContext>,
    result: TaskResponse | ScenarioExecutionResult | SkillExecutionResult | null,
}

export class WorkItemValidationErrors extends Error {
    public validationErrors: string[];

    constructor(errors: string[]) {
        super("Invalid agent work item");
        this.validationErrors = errors;
    }
}

export class AgentRoutine {

    // Routine is ready to be started, running, or in the process of stopping gracefully
    private status: 'ready' | 'running' | 'stopping' = 'ready';

    // Minimum duration of a full iteration, including work and idle time
    private minimumIterationMs: number = 30000;

    // Minimum idle time after iteration work is finished
    private minimumIdleTimeMs: number = 5000;

    // Agent executing this routine
    private agent: AgentBase;
    
    // References to agent resources
    private reactor?: IDocumentDriveServer;
    private config: BaseAgentConfig;
    private logger: ILogger;

    // Flag indicating if new inbox messages are waiting
    private unreadMessagesPending: boolean = false;
    
    // Processing flags for inbox updates
    private nextUpdatePending: boolean = false;
    private processing: boolean = false;

    // Document storage
    protected documents: {
        inbox: AgentInboxDocument;
        wbs: WorkBreakdownStructureDocument;
    };

    // Queued work items
    private queue: AgentRoutineWorkItem[] = [];

    // Routine only starts when initial inbox and WBS are resolved
    public constructor(
        agent: AgentBase, 
        reactor: IDocumentDriveServer | undefined,
        config: BaseAgentConfig,
        logger: ILogger,
        inbox: AgentInboxDocument, 
        wbs: WorkBreakdownStructureDocument
    ) {
        this.agent = agent;
        this.reactor = reactor;
        this.config = config;
        this.logger = logger;
        this.documents = {
            inbox,
            wbs
        };
        
        // Set up event listeners if we have a reactor
        if (this.reactor) {
            this.setupDocumentEventListeners();
        }
    }

    // Start the routine loop
    public async start(): Promise<void> {

        // Iterate until stopped {
        //  Start iteration timer
        //  Call this.loop()
        //  Wait for MIN(minimumIdleTimeMs, minimumIterationMs - iterationTimer.ms())
        // }

        throw new Error("Not implemented yet");
    }

    // Stop the routine loop gracefully after finishing the current work, or immediately
    public async stop(gracefully = true): Promise<void> {
        throw new Error("Not implemented yet");
    }

    /**
     * Set up event listeners for document updates
     * Listens for operations on configured inbox and WBS documents
     */
    private setupDocumentEventListeners(): void {
        if (!this.reactor) return;
        
        const { inbox, wbs } = this.config.workDrive.documents;
        
        this.logger.info(`${this.config.name}: Setting up document event listeners in AgentRoutine`);
        
        // Listen for operations on documents
        this.reactor.on('operationsAdded', async (documentId: string, operations: any[]) => {
            // Check if this is our inbox document
            if (inbox?.documentId && documentId === inbox.documentId) {
                this.logger.info(`${this.config.name}: Inbox document updated - ${operations.length} operations`);
                if (this.reactor) {
                    const doc = await this.reactor.getDocument(inbox.documentId);
                    if (inbox.documentType == 'powerhouse/agent-inbox') {
                        this.updateInbox(doc as AgentInboxDocument);
                    }
                }
            }
            // Check if this is our WBS document
            else if (wbs?.documentId && documentId === wbs.documentId) {
                this.logger.info(`${this.config.name}: WBS document updated - ${operations.length} operations`);
                if (this.reactor) {
                    const doc = await this.reactor.getDocument(wbs.documentId);
                    if (wbs.documentType == 'powerhouse/work-breakdown-structure') {
                        this.updateWbs(doc as WorkBreakdownStructureDocument);
                    }
                }
            }
        });
        
        // Listen for new documents added
        this.reactor.on('documentAdded', (document: any) => {
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
     * Strongly typed method for processing inbox document updates
     * Processes one unread message at a time to avoid conflicts
     */
    public async updateInbox(inbox: AgentInboxDocument): Promise<void> {
        this.logger.info(" UPDATE INBOX ");
        this.documents.inbox = inbox;
        this.unreadMessagesPending = InboxRoutineHandler.hasUnreadMessages(inbox);
        
        // Only process if we have a brain and promptDriver on the agent
        if (!this.agent.getBrain() || !this.agent.getPromptDriver()) {
            this.logger.info(`${this.config.name}: Skipping inbox processing - no brain configured`);
            return;
        }

        // If already processing, ignore this update to prevent concurrent execution
        if (this.processing) {
            this.nextUpdatePending = true;
            this.logger.info(`${this.config.name}: Already processing a message, skipping this inbox update`);
            return;
        }

        do {
            this.nextUpdatePending = false; // Will be set to true async if new updates come in
            
            try {
                this.processing = true;
                const nextMessage = InboxRoutineHandler.getNextUnreadMessage(this.documents.inbox, this.config.workDrive);

                if (nextMessage === null) {
                    this.logger.info(`${this.config.name}: All messages processed. No more unread messages.`);

                } else {
                    this.logger.info(`${this.config.name}: Processing message from ${nextMessage.stakeholder.name}: ${nextMessage.message.content.substring(0, 100)}...`);
                    
                    const result = await this.agent.executeSkill<InboxHandlingFlowContext>(
                        'handle-stakeholder-message',
                        nextMessage,
                        {
                            maxTurns: 50,
                            sendSkillPreamble: true,
                        }
                    );
                    
                    if (result.success) {
                        this.logger.info(`${this.config.name}: Successfully processed message ${nextMessage.message.id}`);
                    } else {
                        this.logger.error(`${this.config.name}: Failed to process message ${nextMessage.message.id}`, result.error);
                    }                    
                }

            } catch (error) {
                this.logger.error(`${this.config.name}: Error processing next inbox update`, error);

            } finally {
                this.processing = false;
            }

        } while(this.nextUpdatePending);
    }

    /**
     * Strongly typed method for processing WBS document updates  
     */
    public updateWbs(wbs: WorkBreakdownStructureDocument): void {
        this.documents.wbs = wbs;
    }

    public queueWorkItem<TContext = any>(type: WorkItemType, params: WorkItemParams<TContext>) {
        const validationErrors = this.validateWorkItemParams(type, params);

        if (validationErrors.length > 0) {
            throw new WorkItemValidationErrors(validationErrors);
        }

        this.queue.push({
            type,
            status: "queued",
            params: params,
            result: null,
        });
    }

    // Add a skill to the work queue
    public queueSkill<TContext = any>(
        skillName: string,
        context?: TContext,
        options?: {
            maxTurns?: number;
            sessionId?: string;
            sendSkillPreamble?: boolean;
        },
        flow?: ISkillFlow,
    ): Promise<SkillExecutionResult> {
        throw new Error("Not yet implemented");
    }

    // Add a scenario to the work queue
    public queueScenario<TContext = any>(
        skillName: string,
        scenarioId: string,
        context?: TContext,
        options?: {
            maxTurns?: number;
            sessionId?: string;
        },
        flow?: IScenarioFlow
    ): Promise<ScenarioExecutionResult> {
        throw new Error("Not yet implemented");
    }

    // Add a task to the work queue
    public queueTask<TContext = any>(
        skillName: string,
        scenarioId: string,
        taskId: string,
        context?: TContext,
        options?: {
            maxTurns?: number;
            sessionId?: string;
            captureSession?: boolean;
        }
    ): Promise<TaskResponse> {
        throw new Error("Not implement yet");
    }

    private validateWorkItemParams(type: WorkItemType, params: WorkItemParams): string[] {
        const errors: string[] = [];

        switch(type) {
            case "skill":

            case "scenario":

            case "task":

            case "idle":
        }

        return errors;
    }

    private async run(): Promise<IterationResult | null> {

        if (this.unreadMessagesPending) {
            this.unreadMessagesPending = false;
            const workItem = InboxRoutineHandler.getNextWorkItem(this.documents.inbox);
            if (workItem !== null) {
                this.queueWorkItem(workItem.type, workItem.params);
            }
        } 
        
        if (!this.hasWorkPending()) {
            const workItem = WbsRoutineHandler.getNextWorkItem(this.documents.wbs);
            if (workItem !== null) {
                this.queueWorkItem(workItem.type, workItem.params);
            }
        }

        return this.hasWorkPending() ? this.executeNextWorkItem() : null;
    }

    private async executeNextWorkItem(): Promise<IterationResult> {
        throw new Error("Not yet implemented");
    }

    private hasWorkPending(): boolean {
        return false;
    }

    // TODO: add logger
    // TODO: add event listeners
}

interface IterationResult {

}
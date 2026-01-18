import { ScenarioExecutionResult, SkillExecutionResult, TaskResponse } from "../../prompts/PromptDriver.js";
import { IScenarioFlow } from "../../prompts/flows/IScenarioFlow.js";
import { ISkillFlow } from "../../prompts/flows/ISkillFlow.js";
import { AgentInboxDocument } from "powerhouse-agent/document-models/agent-inbox";
import { WorkBreakdownStructureDocument } from "powerhouse-agent/document-models/work-breakdown-structure";
import { InboxRoutineHandler } from "./InboxHandlingFlow.js";
import { WbsRoutineHandler } from "./WbsHandler.js";
import { AgentBase, ILogger } from "./AgentBase.js";
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
    private status: 'init' | 'ready' | 'running' | 'stopping' = 'init';

    // Minimum duration of a full iteration, including work and idle time
    private minimumIterationMs: number = 30000;

    // Minimum idle time after iteration work is finished
    private minimumIdleTimeMs: number = 5000;

    // Agent executing this routine
    private agent: AgentBase;
    
    // Logger reference
    private logger: ILogger;

    // Flag indicating if new inbox messages are waiting
    private unreadMessagesPending: boolean = false;
    
    // Processing flags for inbox updates
    private nextUpdatePending: boolean = false;
    private processing: boolean = false;

    private inbox: {
        id: string;
        document: AgentInboxDocument | null;
    };
        
    private wbs: {
        id: string;
        document: WorkBreakdownStructureDocument | null;
    };

    // Queued work items
    private queue: AgentRoutineWorkItem[] = [];

    // Routine only starts when initial inbox and WBS are resolved
    public constructor(
        agent: AgentBase,
        inboxDocumentId: string,
        wbsDocumentId: string,
        logger: ILogger
    ) {
        this.agent = agent;
        this.logger = logger;
        
        this.inbox = {
            id: inboxDocumentId,
            document: null,
        };

        this.wbs = {
            id: wbsDocumentId,
            document: null,
        }
    }

    public async initialize(): Promise<void> {
        return new Promise((resolve) => {
            const reactor = this.agent.getReactor();
            if (!reactor) {
                throw new Error('No reactor available for AgentRoutine initialization');
            }
            
            // Set up listeners and resolve when both documents are loaded
            this.setupDocumentEventListeners(resolve);
        });
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
     * Strongly typed method for processing inbox document updates
     * Processes one unread message at a time to avoid conflicts
     */
    public async updateInbox(inbox: AgentInboxDocument): Promise<void> {
        this.logger.info(" UPDATE INBOX ");
        this.inbox.document = inbox;
        this.unreadMessagesPending = InboxRoutineHandler.hasUnreadMessages(inbox);
        
        const agentName = this.agent.getName();
        
        // Only process if we have a brain and promptDriver on the agent
        if (!this.agent.getBrain() || !this.agent.getPromptDriver()) {
            this.logger.info(`${agentName}: Skipping inbox processing - no brain configured`);
            return;
        }

        // If already processing, ignore this update to prevent concurrent execution
        if (this.processing) {
            this.nextUpdatePending = true;
            this.logger.info(`${agentName}: Already processing a message, skipping this inbox update`);
            return;
        }

        do {
            this.nextUpdatePending = false; // Will be set to true async if new updates come in
            
            try {
                this.processing = true;
                
                // Ensure we have inbox document
                if (!this.inbox.document) {
                    this.logger.error(`${agentName}: No inbox document available for processing`);
                    break;
                }
                
                // Get the drive URL and WBS ID for the message context
                const driveUrl = this.agent.getReactorDriveUrl() || '';
                const nextMessage = InboxRoutineHandler.getNextUnreadMessage(this.inbox.document, driveUrl, this.wbs.id);

                if (nextMessage === null) {
                    this.logger.info(`${agentName}: All messages processed. No more unread messages.`);

                } else {
                    this.logger.info(`${agentName}: Processing message from ${nextMessage.stakeholder.name}: ${nextMessage.message.content.substring(0, 100)}...`);
                    
                    const result = await this.agent.executeSkill<InboxHandlingFlowContext>(
                        'handle-stakeholder-message',
                        nextMessage,
                        {
                            maxTurns: 50,
                            sendSkillPreamble: true,
                        }
                    );
                    
                    if (result.success) {
                        this.logger.info(`${agentName}: Successfully processed message ${nextMessage.message.id}`);
                    } else {
                        this.logger.error(`${agentName}: Failed to process message ${nextMessage.message.id}`, result.error);
                    }                    
                }

            } catch (error) {
                this.logger.error(`${agentName}: Error processing next inbox update`, error);

            } finally {
                this.processing = false;
            }

        } while(this.nextUpdatePending);
    }

    /**
     * Strongly typed method for processing WBS document updates  
     */
    public updateWbs(wbs: WorkBreakdownStructureDocument): void {
        this.wbs.document = wbs;
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

    
    /**
     * Set up event listeners for document updates
     * Listens for operations on configured inbox and WBS documents
     */
    private setupDocumentEventListeners(onReady?: () => void): void {
        const reactor = this.agent.getReactor();
        if (!reactor) return;
        
        // Get document IDs
        const inboxId = this.inbox.id;
        const wbsId = this.wbs.id;
        const agentName = this.agent.getName();
        
        this.logger.info(`${agentName}: Setting up document event listeners in AgentRoutine`);
        
        // Listen for operations on documents
        reactor.on('operationsAdded', async (documentId: string, operations: any[]) => {
            // Check if this is our inbox document
            if (inboxId && documentId === inboxId) {
                this.logger.info(`${agentName}: Inbox document updated - ${operations.length} operations`);
                const currentReactor = this.agent.getReactor();
                if (currentReactor) {
                    const doc = await currentReactor.getDocument(inboxId);
                    if (doc && doc.header.documentType === 'powerhouse/agent-inbox') {
                        this.updateInbox(doc as AgentInboxDocument);
                    }
                }
            }
            // Check if this is our WBS document
            else if (wbsId && documentId === wbsId) {
                this.logger.info(`${agentName}: WBS document updated - ${operations.length} operations`);
                const currentReactor = this.agent.getReactor();
                if (currentReactor) {
                    const doc = await currentReactor.getDocument(wbsId);
                    if (doc && doc.header.documentType === 'powerhouse/work-breakdown-structure') {
                        this.updateWbs(doc as WorkBreakdownStructureDocument);
                    }
                }
            }

            // Check if we've transitioned from init to ready
            if (this.inbox.document && this.wbs.document && this.status === 'init') {
                this.status = 'ready';
                this.logger.info(`${agentName}: AgentRoutine is ready - both documents loaded`);
                if (onReady) {
                    onReady();
                }
            }
        });
        
        // Listen for new documents added
        reactor.on('documentAdded', (document: any) => {
            // Check if it's a document type we care about
            if (document.documentType === 'powerhouse/agent-inbox') {
                this.logger.info(`${agentName}: New inbox document added: ${document.id}`);
            } else if (document.documentType === 'powerhouse/work-breakdown-structure') {
                this.logger.info(`${agentName}: New WBS document added: ${document.id}`);
            }
        });
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

        if (this.unreadMessagesPending && this.inbox.document) {
            this.unreadMessagesPending = false;
            const workItem = InboxRoutineHandler.getNextWorkItem(this.inbox.document);
            if (workItem !== null) {
                this.queueWorkItem(workItem.type, workItem.params);
            }
        } 
        
        if (!this.hasWorkPending() && this.wbs.document) {
            const workItem = WbsRoutineHandler.getNextWorkItem(this.wbs.document);
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
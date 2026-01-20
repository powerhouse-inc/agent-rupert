import { PromptDriver, ScenarioExecutionResult, SkillExecutionResult, TaskResponse } from "../../prompts/PromptDriver.js";
import { AgentInboxDocument } from "powerhouse-agent/document-models/agent-inbox";
import { WorkBreakdownStructureDocument } from "powerhouse-agent/document-models/work-breakdown-structure";
import { InboxRoutineHandler } from "./InboxRoutineHandler.js";
import { WbsRoutineHandler } from "./WbsRoutineHandler.js";
import { AgentBase, ILogger } from "./AgentBase.js";
import { AgentRoutineContext } from "./AgentRoutineContext.js";
import { 
    WorkItemType, 
    WorkItemParams, 
    AgentRoutineWorkItem, 
    WorkItemValidationErrors 
} from "./WorkItemTypes.js";

export class AgentRoutine {

    // Routine is ready to be started, running, or in the process of stopping gracefully
    private status: 'init' | 'ready' | 'running' | 'stopping' = 'init';

    // Minimum duration of a full iteration, including work and idle time
    private minimumIterationMs: number = 2000;

    // Minimum idle time after iteration work is finished
    private minimumIdleTimeMs: number = 500;

    // Agent executing this routine
    private agent: AgentBase;
    
    // Logger reference
    private logger: ILogger;

    // Flag indicating if new inbox messages are waiting
    private unreadMessagesPending: boolean = false;

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

    // Current execution context for WBS goal-driven work
    private currentContext: AgentRoutineContext | null = null;

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
        if (this.status === 'running') {
            this.logger.warn(`${this.agent.getName()}: AgentRoutine already running`);
            return;
        }
        
        if (this.status !== 'ready') {
            throw new Error(`Cannot start AgentRoutine - status is '${this.status}', expected 'ready'`);
        }
        
        this.status = 'running';
        this.logger.info(`${this.agent.getName()}: Starting AgentRoutine loop`);
        
        // Run the main loop
        while (this.status === 'running') {
            this.logger.info(".");
            const iterationStart = Date.now();
            
            try {
                // Execute one iteration of work
                await this.run();
            } catch (error) {
                this.logger.error(`${this.agent.getName()}: Error in routine iteration`, error);
            }
            
            // Calculate how long to wait
            const iterationDuration = Date.now() - iterationStart;
            const remainingTime = Math.max(0, this.minimumIterationMs - iterationDuration);
            const idleTime = Math.max(this.minimumIdleTimeMs, remainingTime);
            
            // Wait before next iteration (unless we're stopping)
            if (this.status === 'running' && idleTime > 0) {
                //this.logger.debug(`${this.agent.getName()}: Waiting ${idleTime}ms before next iteration`);
                await new Promise(resolve => setTimeout(resolve, idleTime));
            }
        }
        
        this.logger.info(`${this.agent.getName()}: AgentRoutine loop stopped`);
        
        // Reset status to ready if we were stopping
        if (this.status === 'stopping') {
            this.status = 'ready';
        }
    }

    // Stop the routine loop gracefully after finishing the current work, or immediately
    public async stop(gracefully = true): Promise<void> {
        if (this.status !== 'running') {
            this.logger.warn(`${this.agent.getName()}: AgentRoutine not running, cannot stop`);
            return;
        }
        
        this.logger.info(`${this.agent.getName()}: Stopping AgentRoutine ${gracefully ? 'gracefully' : 'immediately'}`);
        this.status = 'stopping';
        
        if (!gracefully) {
            // TODO: Cancel any in-progress work items
            this.status = 'ready';
        } else {
            // Wait for current work to complete
            // The main loop will exit when status is not 'running'
            // Status will be set back to 'ready' after loop exits
        }
    }

    /**
     * Strongly typed method for processing inbox document updates
     * Simply updates the inbox state - processing happens in the main loop
     */
    public updateInbox(inbox: AgentInboxDocument): void {
        const agentName = this.agent.getName();
        this.inbox.document = inbox;
        this.unreadMessagesPending = this.unreadMessagesPending || InboxRoutineHandler.hasUnreadMessages(inbox);

        this.logger.info(
            `${agentName}: Inbox document updated.` + (
                this.unreadMessagesPending ? 
                ' Unread messages are pending.' : 
                ' All unread messages are processed.'
            )
        );
    }

    /**
     * Strongly typed method for processing WBS document updates  
     */
    public updateWbs(wbs: WorkBreakdownStructureDocument): void {
        this.wbs.document = wbs;
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

    private queueWorkItem<TContext = any>(
        type: WorkItemType, 
        params: WorkItemParams<TContext>,
        callbacks?: {
            onSuccess?: () => void | Promise<void>;
            onFailure?: () => void | Promise<void>;
        }
    ) {
        const validationErrors = this.validateWorkItemParams(type, params);

        if (validationErrors.length > 0) {
            throw new WorkItemValidationErrors(validationErrors);
        }

        this.queue.push({
            type,
            status: "queued",
            params: params,
            result: null,
            callbacks
        });
    }

    private validateWorkItemParams(type: WorkItemType, params: WorkItemParams): string[] {
        const errors: string[] = [];

        switch(type) {
            case "task":
                if (!params.taskId) {
                    errors.push('taskId is required for task work items');
                }
                // Fall through to next case

            case "scenario":
                if (type === "scenario" && !params.scenarioId) {
                    errors.push('scenarioId is required for scenario work items');
                }
                // Fall through to next case

            case "skill":
                if (type === "skill" && !params.skillName) {
                    errors.push('skillName is required for skill work items');
                }
                break;

            case "idle":
                // No validation needed for idle
                break;
                
            default:
                errors.push(`Unknown work item type: ${type}`);
        }

        return errors;
    }

    private async run(): Promise<IterationResult | null> {
        if (this.unreadMessagesPending && this.inbox.document ) {
            this.unreadMessagesPending = false;
            const driveUrl = this.agent.getReactorDriveUrl() || '';
            const workItem = InboxRoutineHandler.getNextWorkItem(this.inbox.document, driveUrl, this.wbs.id);
            if (workItem !== null) {
                // InboxRoutineHandler doesn't provide callbacks, so pass undefined
                console.log("Queueing inbox task", workItem);
                this.queueWorkItem(workItem.type, workItem.params);
            }
        } 
        
        if (!this.hasWorkPending() && this.wbs.document) {
            const reactor = this.agent.getReactor();
            if (reactor) {
                // Get skills repository and brain if available
                const promptDriver = this.agent.getPromptDriver();
                const skillsRepository = promptDriver?.getRepository();
                const brain = this.agent.getBrain();

                if (skillsRepository && brain) {
                    const workItem = await WbsRoutineHandler.getNextWorkItem(this.wbs.document, reactor, skillsRepository, brain);
                    if (workItem !== null) {
                        if (workItem.type !== 'idle') {
                            console.log("Queueing WBS task...", workItem.params, workItem.params.context);
                        }
                        this.queueWorkItem(workItem.type, workItem.params, workItem.callbacks);
                    } else {
                        this.logger.info('WbsRoutineHandler did not provide new work item.');
                    }
                } else {
                    const missingItems = [ 
                        skillsRepository ? false : 'SkillsRepository',
                        brain ? false : 'AgentBrain'
                    ].filter(m => !!m).join(' and ');

                    this.logger.warn(`AgentRoutine for ${this.agent.getName()} is missing ${missingItems}. WBS will not be processed.`);
                }

            } else {
                this.logger.warn(`AgentRoutine for ${this.agent.getName()} is missing Reactor. WBS will not be processed.`);
            }
        }

        if (this.hasWorkPending()) {
            return this.executeNextWorkItem();
        } else {
            return null;
        }
    }

    private async executeNextWorkItem(): Promise<IterationResult> {
        // Get next work item from queue
        const workItem = this.queue.find(item => item.status === 'queued');
        if (!workItem) {
            return { workExecuted: false };
        }
        
        // Mark as in-progress
        workItem.status = 'in-progress';
        const startTime = Date.now();
        
        try {
            //this.logger.info(`Executing '${workItem.type}' work item...`);
            // Execute based on work item type
            switch (workItem.type) {
                case 'skill':
                    workItem.result = await this.executeSkillItem(workItem);
                    break;
                    
                case 'scenario':
                    workItem.result = await this.executeScenarioItem(workItem);
                    break;
                    
                case 'task':
                    workItem.result = await this.executeTaskItem(workItem);
                    break;
                    
                case 'idle':
                    // No-op for idle work items
                    workItem.result = null;
                    break;
                    
                default:
                    throw new Error(`Unknown work item type: ${workItem.type}`);
            }
            
            // Mark as succeeded
            workItem.status = 'succeeded';
            const duration = Date.now() - startTime;
            
            // Call success callback if present
            if (workItem.callbacks?.onSuccess) {
                await workItem.callbacks.onSuccess();
            }
            
            // Remove from queue if completed
            this.queue = this.queue.filter(item => item !== workItem);
            
            return {
                workExecuted: true,
                workItem,
                duration
            };
            
        } catch (error) {
            this.logger.error(String(error));

            // Mark as failed
            workItem.status = 'failed';
            const duration = Date.now() - startTime;
            
            // Call failure callback if present
            if (workItem.callbacks?.onFailure) {
                await workItem.callbacks.onFailure();
            }
            
            // Remove from queue even if failed (could optionally retry)
            this.queue = this.queue.filter(item => item !== workItem);
            
            return {
                workExecuted: true,
                workItem,
                duration,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }
    
    /**
     * Get the appropriate PromptDriver for a work item
     * If routineContext is provided, ensure it's set up and use its driver
     * Otherwise use the agent's default driver
     */
    private async getPromptDriverForWorkItem(workItem: AgentRoutineWorkItem): Promise<PromptDriver> {
        const { routineContext } = workItem.params;
        
        if (routineContext) {
            let switchNeeded: 'none' | 'scenario' | 'full' = 'full';
            if (this.currentContext) {
                switchNeeded = this.currentContext.needsContextChange(routineContext);    
                switch(switchNeeded) {
                    case "full":
                        console.log("Switching out full context without session ID transfer");
                        await routineContext.setup();
                        this.currentContext.getPromptDriver().endSession();
                        this.currentContext = routineContext;
                        break;

                    case "scenario":
                        console.log("Switching out context with session ID transfer");
                        await routineContext.setup(this.currentContext.getPromptDriver().getSessionId());
                        this.currentContext = routineContext;
                        break;

                    case "none":
                        console.log("Preserving existing context");
                        break;
                }

            } else {
                this.currentContext = routineContext;
                await this.currentContext.setup();
            }
            
            return this.currentContext.getPromptDriver();

        } else {
            // Use default driver
            const driver = this.agent.getPromptDriver();
            if (!driver) {
                throw new Error('Default PromptDriver not available');
            }
            return driver;
        }
    }

    private async executeSkillItem(workItem: AgentRoutineWorkItem): Promise<SkillExecutionResult> {
        const { skillName, context, options } = workItem.params;
        return this.agent.executeSkill(skillName || 'default',
            context,
            options
        );
    }
    
    private async executeScenarioItem(workItem: AgentRoutineWorkItem): Promise<ScenarioExecutionResult> {
        const { skillName, scenarioId, context, options, scenarioFlow } = workItem.params;
        
        if (!scenarioId) {
            throw new Error('Scenario ID is required for scenario work items');
        }
        
        if (!scenarioFlow) {
            throw new Error('Scenario flow is required for scenario work items');
        }
        
        // Get the appropriate PromptDriver
        const promptDriver = await this.getPromptDriverForWorkItem(workItem);
        
        // Build scenario key
        const scenarioKey = promptDriver.getRepository().generateScenarioKey(
            skillName || 'default',
            scenarioId
        );
        
        return promptDriver.executeScenarioFlow(
            scenarioKey,
            scenarioFlow,
            context,
            options
        );
    }
    
    private async executeTaskItem(workItem: AgentRoutineWorkItem): Promise<TaskResponse> {
        const { skillName, scenarioId, taskId, context, options } = workItem.params;
        
        if (!scenarioId || !taskId) {
            throw new Error('Scenario ID and Task ID are required for task work items');
        }
        
        // Get the appropriate PromptDriver
        const promptDriver = await this.getPromptDriverForWorkItem(workItem);
        
        // Get the scenario key
        const scenarioKey = promptDriver.getRepository().generateScenarioKey(
            skillName || 'default',
            scenarioId
        );
        
        // Get the rendered scenario to find the task
        const scenario = promptDriver.getRepository().getScenarioByKey(scenarioKey, context);
        if (!scenario) {
            throw new Error(`Scenario not found: ${scenarioKey}`);
        }
        
        // Find the task in the scenario
        const task = scenario.tasks.find(t => t.id === taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found in scenario ${scenarioId}`);
        }
        
        return promptDriver.executeTask(
            task,
            options,
            context
        );
    }

    private hasWorkPending(): boolean {
        return this.queue.length > 0;
    }

    // TODO: add logger
    // TODO: add event listeners
}

interface IterationResult {
    workExecuted: boolean;
    workItem?: AgentRoutineWorkItem;
    duration?: number;
    error?: Error;
}
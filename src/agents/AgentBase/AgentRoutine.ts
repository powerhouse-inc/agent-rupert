import { PromptDriver, ScenarioExecutionResult, SkillExecutionResult, TaskResponse } from "../../prompts/PromptDriver.js";
import { IScenarioFlow } from "../../prompts/flows/IScenarioFlow.js";
import { ISkillFlow } from "../../prompts/flows/ISkillFlow.js";
import { AgentInboxDocument } from "powerhouse-agent/document-models/agent-inbox";
import { WorkBreakdownStructureDocument, Goal } from "powerhouse-agent/document-models/work-breakdown-structure";
import { InboxRoutineHandler } from "./InboxRoutineHandler.js";
import { WbsRoutineHandler } from "./WbsRoutineHandler.js";
import { AgentBase, ILogger } from "./AgentBase.js";
import { AgentRoutineContext } from "./AgentRoutineContext.js";

export type WorkItemType = 'skill' | 'scenario' | 'task' | 'idle';

export type WorkItemParams<TContext = any> = {
    skillName?: string,
    scenarioId?: string,
    taskId?: string,
    context?: TContext,
    options?: {
        maxTurns?: number;
        sessionId?: string;
        captureSession?: boolean;
        sendSkillPreamble?: boolean;
    },
    skillFlow?: ISkillFlow,
    scenarioFlow?: IScenarioFlow,
    routineContext?: AgentRoutineContext,
};

export type AgentRoutineWorkItem<TContext = any> = {
    type: WorkItemType,
    status: 'queued' | 'in-progress' | 'succeeded' | 'failed' | 'terminated',
    params: WorkItemParams<TContext>,
    result: TaskResponse | ScenarioExecutionResult | SkillExecutionResult | null,
    promise?: {
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
    }
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
                this.logger.debug(`${this.agent.getName()}: Waiting ${idleTime}ms before next iteration`);
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
        return new Promise((resolve, reject) => {
            const workItem: AgentRoutineWorkItem<TContext> = {
                type: 'skill',
                status: 'queued',
                params: {
                    skillName,
                    context,
                    options,
                    skillFlow: flow
                },
                result: null,
                promise: { resolve, reject }
            };
            
            this.queue.push(workItem);
            this.logger.info(`${this.agent.getName()}: Queued skill '${skillName}'`);
        });
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
        return new Promise((resolve, reject) => {
            const workItem: AgentRoutineWorkItem<TContext> = {
                type: 'scenario',
                status: 'queued',
                params: {
                    skillName,
                    scenarioId,
                    context,
                    options,
                    scenarioFlow: flow
                },
                result: null,
                promise: { resolve, reject }
            };
            
            this.queue.push(workItem);
            this.logger.info(`${this.agent.getName()}: Queued scenario '${skillName}/${scenarioId}'`);
        });
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
        return new Promise((resolve, reject) => {
            const workItem: AgentRoutineWorkItem<TContext> = {
                type: 'task',
                status: 'queued',
                params: {
                    skillName,
                    scenarioId,
                    taskId,
                    context,
                    options
                },
                result: null,
                promise: { resolve, reject }
            };
            
            this.queue.push(workItem);
            this.logger.info(`${this.agent.getName()}: Queued task '${skillName}/${scenarioId}/${taskId}'`);
        });
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

    /**
     * Ensure we have the appropriate context for executing WBS goal-driven work
     * Creates a new context if needed or reuses existing if it matches the goal chain
     */
    private async ensureContext(goalChain: Goal[]): Promise<AgentRoutineContext> {
        // Check if we need a new context
        if (!this.currentContext || !this.currentContext.matchesGoalChain(goalChain)) {
            // Get required components
            const brain = this.agent.getBrain();
            const repository = this.agent.getPromptDriver()?.getRepository();
            
            if (!brain || !repository) {
                throw new Error('Brain or repository not available for context creation');
            }
            
            // Create filtered PromptDriver with only relevant templates
            // Note: When called from here, we don't have siblings (empty arrays)
            const driverResult = WbsRoutineHandler.createGoalChainPromptDriver(
                goalChain,
                [],  // No preceding siblings when called directly
                [],  // No following siblings when called directly
                repository,
                brain
            );
            
            if (!driverResult) {
                throw new Error('Failed to create PromptDriver for goal chain');
            }
            
            // Get prior completed tasks from WBS tracking
            const priorCompletedTasks = this.getPriorCompletedTasks(goalChain);
            
            // Create new context with resolved skill name
            this.currentContext = new AgentRoutineContext(
                goalChain,
                priorCompletedTasks,
                driverResult.driver,
                driverResult.skillName
            );
            
            // Setup the context (collect variables, send preambles & completed tasks overview)
            await this.currentContext.setup();
        }
        
        return this.currentContext;
    }

    /**
     * Get list of prior completed task IDs for a goal chain
     * TODO: Implement actual tracking from WBS document
     */
    private getPriorCompletedTasks(goalChain: Goal[]): string[] {
        // For now, return empty array
        // In future, track completed tasks in WBS document
        return [];
    }

    private async run(): Promise<IterationResult | null> {

        if (this.unreadMessagesPending && this.inbox.document) {
            this.unreadMessagesPending = false;
            const driveUrl = this.agent.getReactorDriveUrl() || '';
            const workItem = InboxRoutineHandler.getNextWorkItem(this.inbox.document, driveUrl, this.wbs.id);
            if (workItem !== null) {
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
                        this.queueWorkItem(workItem.type, workItem.params);
                    }
                }
            }
        }

        return this.hasWorkPending() ? this.executeNextWorkItem() : null;
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
            
            // Resolve promise if present
            if (workItem.promise) {
                workItem.promise.resolve(workItem.result);
            }
            
            // Remove from queue if completed
            this.queue = this.queue.filter(item => item !== workItem);
            
            return {
                workExecuted: true,
                workItem,
                duration
            };
            
        } catch (error) {
            console.error(error);

            // Mark as failed
            workItem.status = 'failed';
            const duration = Date.now() - startTime;
            
            // Reject promise if present
            if (workItem.promise) {
                workItem.promise.reject(error);
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
            // Check if we need to switch contexts
            if (!this.currentContext || !this.currentContext.matchesContext(routineContext)) {
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
        const { skillName, context, options, skillFlow } = workItem.params;
        
        // Get the appropriate PromptDriver
        const promptDriver = await this.getPromptDriverForWorkItem(workItem);
        
        if (!skillFlow) {
            throw new Error('Skill flow is required for skill work items');
        }
        
        return promptDriver.executeSkillFlow(
            skillName || 'default',
            skillFlow,
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
            options
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
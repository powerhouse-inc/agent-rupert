import { ScenarioExecutionResult, SkillExecutionResult, TaskResponse } from "../../prompts/PromptDriver.js";
import { IScenarioFlow } from "../../prompts/flows/IScenarioFlow.js";
import { ISkillFlow } from "../../prompts/flows/ISkillFlow.js";
import { AgentInboxDocument } from "powerhouse-agent/document-models/agent-inbox";
import { WorkBreakdownStructureDocument } from "powerhouse-agent/document-models/work-breakdown-structure";
import { InboxRoutineHandler } from "./InboxHandlingFlow.js";
import { WbsRoutineHandler } from "./WbsHandler.js";
import { AgentBase } from "./AgentBase.js";

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

    // Flag indicating if new inbox messages are waiting
    private unreadMessagesPending: boolean = false;

    // Latest inbox document
    private inbox: AgentInboxDocument;

    // Latest WBS document
    private wbs: WorkBreakdownStructureDocument;

    // Queued work items
    private queue: AgentRoutineWorkItem[] = [];

    // Routine only starts when initial inbox and WBS are resolved
    public constructor(agent: AgentBase, inbox: AgentInboxDocument, wbs: WorkBreakdownStructureDocument) {
        this.agent = agent;
        this.inbox = inbox;
        this.wbs = wbs;
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

    public updateInbox(inbox: AgentInboxDocument) {
        this.inbox = inbox;
        this.unreadMessagesPending = InboxRoutineHandler.hasUnreadMessages(inbox);
    }

    public updateWbs(wbs: WorkBreakdownStructureDocument) {
        this.wbs = wbs;
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
            const workItem = InboxRoutineHandler.getNextWorkItem(this.inbox);
            if (workItem !== null) {
                this.queueWorkItem(workItem.type, workItem.params);
            }
        } 
        
        if (!this.hasWorkPending()) {
            const workItem = WbsRoutineHandler.getNextWorkItem(this.wbs);
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
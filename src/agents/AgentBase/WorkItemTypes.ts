import { TaskExecutionResult, ScenarioExecutionResult, SkillExecutionResult } from "../../prompts/PromptDriver.js";
import { IScenarioFlow } from "../../prompts/flows/IScenarioFlow.js";
import { ISkillFlow } from "../../prompts/flows/ISkillFlow.js";
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
    result: TaskExecutionResult | ScenarioExecutionResult | SkillExecutionResult | null,
    promise?: {
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
    },
    callbacks?: {
        onSuccess?: () => void | Promise<void>;
        onFailure?: () => void | Promise<void>;
    }
}

export class WorkItemValidationErrors extends Error {
    public validationErrors: string[];

    constructor(errors: string[]) {
        super("Invalid agent work item");
        this.validationErrors = errors;
    }
}
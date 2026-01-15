import { RenderedScenarioTask } from "../types.js";

export interface IScenarioFlow {
    /**
     * The name of the scenario flow, for example "SequentialFlow"
     */
    name(): string;

    /**
     * A short description that explains in what order tasks are executed.
     */
    description(): string;

    /**
     * Returns null if the flow is finished.
     * Throws an exception if the previous task result was not reported.
     */
    nextTask(): RenderedScenarioTask | null;

    /**
     * Has to be called after every call to nextTask(). Proceeds the 
     * flow to the next step.
     */
    reportTaskResult(success: boolean, error?: Error): void;

    /**
     * Returns the current status of the flow
     */
    status(): ScenarioFlowStatus;

    /**
     * Returns true if nextTask() was called at least once since the last reset
     */
    started(): boolean;

    /**
     * Returns true if the flow is terminated successfully or failed
     */
    finished(): boolean;

    /**
     * Resets the flow back to started = false and clears finished/success/error state.
     */
    reset(): void;
}

/**
 * Expresses the current status of a flow
 * - started = true if nextTask() was called at least once
 * - awaitingResult = true if the flow is waiting for the current task result to proceed
 * - finished = true if the flow terminated either successfully or not
 * - success/error are only set if the flow is finished
 */
export type ScenarioFlowStatus = {
    started: boolean;
    awaitingResult: boolean;
    finished: boolean;
    success?: boolean;
    error?: Error;
};
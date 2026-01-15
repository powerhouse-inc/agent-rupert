import { IScenarioFlow, ScenarioFlowStatus } from "./IScenarioFlow.js";
import { RenderedScenario, RenderedScenarioTask } from "../types.js";

/**
 * SequentialFlow executes all tasks in a scenario sequentially.
 * - Returns tasks in order as long as success is reported
 * - Terminates successfully when all tasks are completed
 * - Terminates with error if any task fails
 */
export class SequentialFlow implements IScenarioFlow {
    private scenario: RenderedScenario;
    private currentTaskIndex: number = -1;
    private _started: boolean = false;
    private _awaitingResult: boolean = false;
    private _finished: boolean = false;
    private _success?: boolean;
    private _error?: Error;

    constructor(scenario: RenderedScenario) {
        this.scenario = scenario;
    }

    /**
     * Returns the next task in the sequence, or null if finished
     */
    nextTask(): RenderedScenarioTask | null {
        // Check if we're waiting for a result from the previous task
        if (this._awaitingResult) {
            throw new Error("Cannot get next task: waiting for result from current task. Call reportTaskResult() first.");
        }

        // Check if flow is already finished
        if (this._finished) {
            return null;
        }

        // Mark as started
        if (!this._started) {
            this._started = true;
        }

        // Move to next task
        this.currentTaskIndex++;

        // Check if we've completed all tasks
        if (this.currentTaskIndex >= this.scenario.tasks.length) {
            // All tasks completed successfully
            this._finished = true;
            this._success = true;
            return null;
        }

        // Get the next task and mark that we're waiting for its result
        this._awaitingResult = true;
        return this.scenario.tasks[this.currentTaskIndex];
    }

    /**
     * Report the result of the current task
     */
    reportTaskResult(success: boolean, error?: Error): void {
        // Check if we're actually waiting for a result
        if (!this._awaitingResult) {
            throw new Error("No task result expected. Call nextTask() first.");
        }

        // Clear awaiting flag
        this._awaitingResult = false;

        // Handle task failure
        if (!success) {
            this._finished = true;
            this._success = false;
            this._error = error || new Error(`Task ${this.scenario.tasks[this.currentTaskIndex]?.id} failed`);
        }

        // For success, we continue to the next task (handled by nextTask())
    }

    /**
     * Get the current status of the flow
     */
    status(): ScenarioFlowStatus {
        const status: ScenarioFlowStatus = {
            started: this._started,
            awaitingResult: this._awaitingResult,
            finished: this._finished
        };

        // Only include success/error if finished
        if (this._finished) {
            status.success = this._success;
            if (this._error) {
                status.error = this._error;
            }
        }

        return status;
    }

    /**
     * Returns true if nextTask() was called at least once
     */
    started(): boolean {
        return this._started;
    }

    /**
     * Returns true if the flow is finished (either successfully or with error)
     */
    finished(): boolean {
        return this._finished;
    }

    /**
     * Reset the flow to initial state
     */
    reset(): void {
        this.currentTaskIndex = -1;
        this._started = false;
        this._awaitingResult = false;
        this._finished = false;
        this._success = undefined;
        this._error = undefined;
    }

    /**
     * Get information about the current scenario
     */
    getScenarioInfo(): { id: string; title: string; totalTasks: number } {
        return {
            id: this.scenario.id,
            title: this.scenario.title,
            totalTasks: this.scenario.tasks.length
        };
    }

    /**
     * Get current progress through the scenario
     */
    getProgress(): { currentTaskIndex: number; totalTasks: number; completedTasks: number } {
        return {
            currentTaskIndex: this.currentTaskIndex,
            totalTasks: this.scenario.tasks.length,
            completedTasks: this._awaitingResult ? this.currentTaskIndex : Math.max(0, this.currentTaskIndex + 1)
        };
    }
}
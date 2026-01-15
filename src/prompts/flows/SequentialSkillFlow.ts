import { ISkillFlow, SkillFlowStatus, ScenarioResult } from './ISkillFlow.js';
import { IScenarioFlow } from './IScenarioFlow.js';
import { SequentialScenarioFlow } from './SequentialScenarioFlow.js';
import { RenderedScenario } from '../types.js';

/**
 * SequentialSkillFlow executes all scenarios in a skill sequentially.
 * - Returns scenarios in order as long as success is reported
 * - Terminates successfully when all scenarios are completed
 * - Terminates with error if any scenario fails
 */
export class SequentialSkillFlow implements ISkillFlow {
    private scenarios: RenderedScenario[];
    private skillName: string;
    private currentScenarioIndex: number = -1;
    private _started: boolean = false;
    private _awaitingResult: boolean = false;
    private _finished: boolean = false;
    private _success?: boolean;
    private _error?: Error;
    private completedScenarios: number = 0;

    constructor(skillName: string, scenarios: RenderedScenario[]) {
        this.skillName = skillName;
        this.scenarios = scenarios;
    }

    name(): string {
        return "SequentialSkillFlow";
    }

    description(): string {
        return "Scenarios will be executed in sequence until one of them fails or all scenarios are completed.";
    }

    /**
     * Create a scenario flow for the given scenario.
     * By default, creates a SequentialScenarioFlow for each scenario.
     * Can be overridden in subclasses to provide different flow strategies per scenario.
     */
    async createScenarioFlow(scenario: RenderedScenario): Promise<IScenarioFlow> {
        return new SequentialScenarioFlow(scenario);
    }

    /**
     * Returns the next scenario in the sequence, or null if finished
     */
    async nextScenario(): Promise<RenderedScenario | null> {
        // Check if we're waiting for a result from the previous scenario
        if (this._awaitingResult) {
            throw new Error("Cannot get next scenario: waiting for result from current scenario. Call reportScenarioResult() first.");
        }

        // Check if flow is already finished
        if (this._finished) {
            return null;
        }

        // Mark as started
        if (!this._started) {
            this._started = true;
        }

        // Move to next scenario
        this.currentScenarioIndex++;

        // Check if we've completed all scenarios
        if (this.currentScenarioIndex >= this.scenarios.length) {
            // All scenarios completed successfully
            this._finished = true;
            this._success = true;
            return null;
        }

        // Get the next scenario and mark that we're waiting for its result
        this._awaitingResult = true;
        return this.scenarios[this.currentScenarioIndex];
    }

    /**
     * Report the result of the current scenario
     */
    async reportScenarioResult(result: ScenarioResult): Promise<void> {
        // Check if we're actually waiting for a result
        if (!this._awaitingResult) {
            throw new Error("No scenario result expected. Call nextScenario() first.");
        }

        // Clear awaiting flag
        this._awaitingResult = false;

        // Handle scenario completion
        if (result.success) {
            this.completedScenarios++;
        } else {
            // Scenario failed, terminate the flow
            this._finished = true;
            this._success = false;
            this._error = result.error || new Error(`Scenario ${result.scenarioId} failed`);
        }
    }

    /**
     * Get the current status of the flow
     */
    status(): SkillFlowStatus {
        return {
            started: this._started,
            awaitingResult: this._awaitingResult,
            finished: this._finished,
            success: this._success,
            error: this._error,
            completedScenarios: this.completedScenarios,
            totalScenarios: this.scenarios.length
        };
    }

    /**
     * Returns true if nextScenario() was called at least once
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
        this.currentScenarioIndex = -1;
        this._started = false;
        this._awaitingResult = false;
        this._finished = false;
        this._success = undefined;
        this._error = undefined;
        this.completedScenarios = 0;
    }

    /**
     * Get information about the skill
     */
    getSkillInfo(): { name: string; totalScenarios: number } {
        return {
            name: this.skillName,
            totalScenarios: this.scenarios.length
        };
    }

    /**
     * Get current progress through the skill
     */
    getProgress(): { currentScenarioIndex: number; totalScenarios: number; completedScenarios: number } {
        return {
            currentScenarioIndex: this.currentScenarioIndex,
            totalScenarios: this.scenarios.length,
            completedScenarios: this.completedScenarios
        };
    }
}
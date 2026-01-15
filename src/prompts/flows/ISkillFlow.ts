import { RenderedScenario } from '../types.js';
import type { IScenarioFlow } from './IScenarioFlow.js';

/**
 * Status of a skill flow execution
 */
export interface SkillFlowStatus {
    started: boolean;
    awaitingResult: boolean;
    finished: boolean;
    success?: boolean;
    error?: Error;
    completedScenarios: number;
    totalScenarios: number;
}

/**
 * Result of a scenario execution
 */
export interface ScenarioResult {
    scenarioId: string;
    success: boolean;
    completedTasks: number;
    totalTasks: number;
    error?: Error;
}

/**
 * Interface for controlling the flow of scenarios within a skill.
 * Implementations can be sequential, parallel, conditional, or AI-driven.
 */
export interface ISkillFlow {
    /**
     * Get the name of this flow type
     */
    name(): string;

    /**
     * Get a description of how this flow works
     */
    description(): string;

    /**
     * Create a scenario flow for the given scenario.
     * This factory method allows the skill flow to determine how each scenario should be executed.
     * @param scenario The scenario to create a flow for
     * @returns A promise resolving to the scenario flow
     */
    createScenarioFlow(scenario: RenderedScenario): Promise<IScenarioFlow>;

    /**
     * Get the next scenario to execute, or null if finished.
     * This method is async to support AI-driven decision making.
     */
    nextScenario(): Promise<RenderedScenario | null>;

    /**
     * Report the result of the current scenario.
     * This method is async to support state persistence and AI analysis.
     */
    reportScenarioResult(result: ScenarioResult): Promise<void>;

    /**
     * Get the current status of the flow
     */
    status(): SkillFlowStatus;

    /**
     * Check if the flow has been started
     */
    started(): boolean;

    /**
     * Check if the flow is finished
     */
    finished(): boolean;

    /**
     * Reset the flow to initial state
     */
    reset(): void;

    /**
     * Get information about the skill being executed
     */
    getSkillInfo(): {
        name: string;
        totalScenarios: number;
    };

    /**
     * Get current progress through the skill
     */
    getProgress(): {
        currentScenarioIndex: number;
        totalScenarios: number;
        completedScenarios: number;
    };
}
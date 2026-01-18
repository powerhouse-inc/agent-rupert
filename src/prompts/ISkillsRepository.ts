import type { 
    RenderedScenario, 
    SkillInfo,
    ScenarioMetadata,
    SkillTemplate
} from './types.js';

/**
 * Interface for Skills Repository
 * Defines the contract for accessing and managing skill templates
 */
export interface ISkillsRepository {
    /**
     * Load all skills from the repository
     */
    loadSkills(): Promise<void>;

    /**
     * Check if skills have been loaded
     */
    isLoaded(): boolean;

    /**
     * Get list of all available skill names
     */
    getSkills(): string[];

    /**
     * Get skill information by name
     */
    getSkillInformation(skill: string): SkillInfo | undefined;

    /**
     * Get skill preamble function
     */
    getSkillPreamble<TContext = any>(
        skill: string, 
        context?: TContext
    ): string | undefined;

    /**
     * Get scenarios for a specific skill
     */
    getScenariosBySkill<TContext = any>(
        skill: string,
        context?: TContext
    ): RenderedScenario[];

    /**
     * Get a specific scenario by key
     */
    getScenarioByKey<TContext = any>(
        scenarioKey: string,
        context?: TContext
    ): RenderedScenario | undefined;

    /**
     * Generate a scenario key from skill and scenario ID
     */
    generateScenarioKey(skill: string, scenarioId: string): string;

    /**
     * Get all scenario metadata
     */
    getAllMetadata(): ScenarioMetadata[];

    /**
     * Get skill template by name (internal use)
     * Returns the raw template with functions
     */
    getSkillTemplate(skill: string): SkillTemplate | undefined;

    /**
     * Collect all variables required for a scenario
     * Includes parent skill variables, scenario variables, and all child task variables
     * @param skillName - Name of the skill containing the scenario
     * @param scenarioId - ID of the scenario
     * @returns Array of unique variable names required for the scenario
     */
    getScenarioRequiredVariables(skillName: string, scenarioId: string): string[];
}
import type { ISkillsRepository } from './ISkillsRepository.js';
import type {
  ScenarioTemplate,
  ScenarioTaskTemplate,
  SkillTemplate,
  ScenarioMetadata,
  RenderedScenario,
  RenderedScenarioTask,
  SkillInfo,
  TemplateVars,
} from './types.js';

/**
 * Base class for Skills Repository implementations
 * Contains shared functionality for managing skill and scenario templates
 */
export abstract class SkillsRepositoryBase implements ISkillsRepository {
  protected skills: Map<string, SkillTemplate> = new Map();
  protected scenarioTemplates: Map<string, ScenarioTemplate> = new Map();
  protected scenarioMetaData: Map<string, ScenarioMetadata> = new Map();
  protected loaded: boolean = false;

  /**
   * Load skills - implementation specific
   */
  abstract loadSkills(): Promise<void>;

  /**
   * Check if skills are loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Generate a key for scenario storage
   */
  generateScenarioKey(skill: string, scenarioId: string): string {
    return `${skill}::${scenarioId}`;
  }

  /**
   * Get all skills
   */
  getSkills(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Get skill template by name
   */
  getSkillTemplate(skill: string): SkillTemplate | undefined {
    return this.skills.get(skill);
  }

  /**
   * Get skill information (no functions, just metadata)
   */
  getSkillInformation(skill: string): SkillInfo | undefined {
    const skillTemplate = this.skills.get(skill);
    if (!skillTemplate) return undefined;
    
    // Extract the prefix from the first scenario's ID (e.g., "CRP.00" -> "CRP")
    let skillId = skill; // Default to skill name if we can't extract prefix
    if (skillTemplate.scenarios.length > 0 && skillTemplate.scenarios[0].id) {
      const match = skillTemplate.scenarios[0].id.match(/^([A-Z]+)\./);
      if (match) {
        skillId = match[1];
      }
    }
    
    // Helper function to build template with vars structure
    const buildTemplateWithVars = (text?: string, vars?: TemplateVars) => {
      if (!text) return undefined;
      if (!vars) return text; // Return as plain string for backwards compatibility
      return vars; // The vars object already contains text and variable structure
    };
    
    return {
      id: skillId,  // Use the extracted prefix as the id
      name: skillTemplate.name,
      hasPreamble: !!skillTemplate.preamble,  // Check if skill preamble function exists
      preambleTemplate: buildTemplateWithVars(skillTemplate.preambleText, skillTemplate.preambleVars),
      expectedOutcome: buildTemplateWithVars(
        skillTemplate.expectedOutcome ? skillTemplate.expectedOutcome() : undefined,
        skillTemplate.expectedOutcomeVars
      ),
      scenarios: skillTemplate.scenarios
        .map(scenario => ({
          id: scenario.id,
          title: scenario.title,
          hasPreamble: !!scenario.preamble,  // Check if scenario preamble function exists
          preambleTemplate: buildTemplateWithVars(scenario.preambleText, scenario.preambleVars),
          expectedOutcome: buildTemplateWithVars(
            scenario.expectedOutcome ? scenario.expectedOutcome() : undefined,
            scenario.expectedOutcomeVars
          ),
          tasks: scenario.tasks.map(task => ({
            id: task.id,
            title: task.title,
            template: buildTemplateWithVars(task.contentText, task.contentVars) || '',
            expectedOutcome: buildTemplateWithVars(
              task.expectedOutcome ? task.expectedOutcome() : undefined,
              task.expectedOutcomeVars
            )
          }))
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    };
  }

  /**
   * Get skill preamble
   */
  getSkillPreamble<TContext = any>(
    skill: string,
    context?: TContext
  ): string | undefined {
    const preambleFunc = this.skills.get(skill)?.preamble;
    if (!preambleFunc) return undefined;
    return preambleFunc(context);
  }

  /**
   * Get scenarios for a skill
   */
  getScenariosBySkill<TContext = any>(
    skill: string,
    context?: TContext
  ): RenderedScenario[] {
    const scenarios = this.skills.get(skill)?.scenarios || [];
    return scenarios
      .map(scenario => this.renderScenarioWithContext(scenario, context))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Get a specific scenario by key
   */
  getScenarioByKey<TContext = any>(
    scenarioKey: string,
    context?: TContext
  ): RenderedScenario | undefined {
    const scenario = this.scenarioTemplates.get(scenarioKey);
    if (!scenario) return undefined;
    return this.renderScenarioWithContext(scenario, context);
  }

  /**
   * Get all scenario metadata
   */
  getAllMetadata(): ScenarioMetadata[] {
    return Array.from(this.scenarioMetaData.values())
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Render a scenario with context
   */
  protected renderScenarioWithContext<TContext = any>(
    scenario: ScenarioTemplate,
    context?: TContext
  ): RenderedScenario {
    const renderedTasks: RenderedScenarioTask[] = scenario.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      content: task.content ? task.content(context) : '',
      expectedOutcome: task.expectedOutcome ? task.expectedOutcome(context) : undefined
    }));

    return {
      id: scenario.id,
      title: scenario.title,
      preamble: scenario.preamble ? scenario.preamble(context) : undefined,
      tasks: renderedTasks,
      expectedOutcome: scenario.expectedOutcome ? scenario.expectedOutcome(context) : undefined
    };
  }

  /**
   * Collect all variables required for a scenario
   * Includes parent skill variables, scenario variables, and all child task variables
   * Returns a deduplicated array of variable names
   */
  public getScenarioRequiredVariables(skillName: string, scenarioId: string): string[] {
    const variables = new Set<string>();
    
    // Get skill template - try direct match first
    let skill = this.skills.get(skillName);
    
    // If not found by direct name, try to find by prefix
    if (!skill) {
      // Check if skillName is a prefix (like "CRP") and find matching skill
      for (const [name, skillData] of this.skills.entries()) {
        // Check if any scenario ID starts with the skillName prefix
        const hasMatchingPrefix = skillData.scenarios.some(s => 
          s.id && s.id.startsWith(skillName + '.')
        );
        // Also check if the skill name itself matches
        if (hasMatchingPrefix || name === skillName) {
          skill = skillData;
          break;
        }
      }
    }
    
    if (!skill) {
      return [];
    }
    
    // Helper function to merge variables from a TemplateVars object
    const mergeVariables = (varsObj: TemplateVars | undefined): void => {
      if (!varsObj?.vars) return;
      // Merge the vars array into our Set (automatically deduplicates)
      varsObj.vars.forEach(v => variables.add(v));
    };
    
    // Collect skill-level variables
    mergeVariables(skill.preambleVars);
    mergeVariables(skill.expectedOutcomeVars);
    
    // Find the specific scenario
    const scenario = skill.scenarios.find(s => s.id === scenarioId);
    if (!scenario) {
      // Return skill-level variables even if scenario not found
      return Array.from(variables);
    }
    
    // Collect scenario-level variables
    mergeVariables(scenario.preambleVars);
    mergeVariables(scenario.expectedOutcomeVars);
    
    // Collect all task-level variables
    for (const task of scenario.tasks) {
      mergeVariables(task.contentVars);
      mergeVariables(task.expectedOutcomeVars);
    }
    
    // Return deduplicated, sorted array for consistency
    return Array.from(variables).sort();
  }

  /**
   * Register a skill template
   */
  protected registerSkill(skillName: string, template: SkillTemplate): void {
    this.skills.set(skillName, template);
    
    // Also register each scenario
    for (const scenario of template.scenarios) {
      const scenarioKey = this.generateScenarioKey(skillName, scenario.id);
      this.scenarioTemplates.set(scenarioKey, scenario);
      
      // Store metadata
      this.scenarioMetaData.set(scenarioKey, {
        id: scenario.id,
        title: scenario.title,
        skill: skillName,
        taskCount: scenario.tasks.length,
        filePath: '' // Will be overridden in file-based implementation
      });
    }
  }

  /**
   * Print the skill tree structure to console for debugging
   * Default implementation - can be overridden by subclasses
   */
  public print(): void {
    console.log('\n=== Skills Repository ===');
    console.log(`Total Skills: ${this.skills.size}`);
    console.log(`Total Scenarios: ${this.scenarioTemplates.size}`);
    
    for (const [skillName, skillTemplate] of this.skills.entries()) {
      console.log(`\nSkill: ${skillName}`);
      console.log(`  Scenarios: ${skillTemplate.scenarios.length}`);
      
      for (const scenario of skillTemplate.scenarios) {
        console.log(`    - ${scenario.id}: ${scenario.title} (${scenario.tasks.length} tasks)`);
      }
    }
    
    console.log('\n=== End of Repository ===\n');
  }

  /**
   * Find a task by its ID across all skills and scenarios
   * @param taskId - The task ID to search for
   * @returns Object containing skill template, scenario template, and task template, or undefined if not found
   */
  public findTask(taskId: string): {
    skill: SkillTemplate;
    scenario: ScenarioTemplate;
    task: ScenarioTaskTemplate;
  } | undefined {
    // Search through all skills
    for (const skillTemplate of this.skills.values()) {
      // Search through all scenarios in this skill
      for (const scenario of skillTemplate.scenarios) {
        // Search through all tasks in this scenario
        const task = scenario.tasks.find(t => t.id === taskId);
        if (task) {
          return {
            skill: skillTemplate,
            scenario,
            task
          };
        }
      }
    }
    
    // Task not found
    return undefined;
  }
}